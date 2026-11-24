import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignored = new Set(['.git', 'node_modules', 'qa', '.preview', '.cache']);
const failures = [];
const htmlCache = new Map();
let linkCount = 0;

async function collect(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.name.startsWith('.')) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(filename));
    else if (entry.isFile()) files.push(filename);
  }
  return files;
}

function label(filename) {
  return path.relative(root, filename).split(path.sep).join('/');
}

function fail(filename, message) {
  failures.push(`${label(filename)}: ${message}`);
}

function unescape(value) {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function attributes(tag) {
  const attrs = new Map();
  const pattern = /\s([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of tag.matchAll(pattern)) {
    attrs.set(match[1].toLowerCase(), unescape(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return attrs;
}

async function htmlInfo(filename) {
  if (htmlCache.has(filename)) return htmlCache.get(filename);
  const source = (await readFile(filename, 'utf8')).replace(/<!--[\s\S]*?-->/g, '');
  const tags = [...source.matchAll(/<([a-zA-Z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/g)]
    .map(match => ({ name: match[1].toLowerCase(), attrs: attributes(match[0]) }));
  const ids = new Set();
  const duplicates = [];
  for (const tag of tags) {
    const id = tag.attrs.get('id');
    if (id) {
      if (ids.has(id)) duplicates.push(id);
      ids.add(id);
    }
  }
  const result = { source, tags, ids, duplicates };
  htmlCache.set(filename, result);
  return result;
}

async function checkReference(filename, rawReference) {
  const reference = rawReference.trim();
  if (!reference || reference === '#') {
    fail(filename, `empty or placeholder link: ${JSON.stringify(rawReference)}`);
    return;
  }
  if (/\bexample\.(?:com|org|net)\b/i.test(reference)) fail(filename, `placeholder domain: ${reference}`);
  if (/^(?:https?:|mailto:|tel:|data:|blob:|\/\/)/i.test(reference)) return;
  if (/^[a-zA-Z][\w+.-]*:/.test(reference)) {
    fail(filename, `unexpected URL scheme: ${reference}`);
    return;
  }
  linkCount++;
  let url;
  try {
    url = new URL(reference, `https://local.invalid/${label(filename)}`);
  } catch {
    fail(filename, `invalid URL: ${reference}`);
    return;
  }
  let target;
  try {
    target = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
  } catch {
    fail(filename, `invalid URL encoding: ${reference}`);
    return;
  }
  const relative = path.relative(root, target);
  if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    fail(filename, `link leaves the site directory: ${reference}`);
    return;
  }
  try {
    if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html');
    if (!(await stat(target)).isFile()) throw new Error('not a file');
  } catch {
    fail(filename, `missing local resource: ${reference}`);
    return;
  }
  if (url.hash && /\.html?$/i.test(target)) {
    let fragment;
    try { fragment = decodeURIComponent(url.hash.slice(1)); }
    catch { fail(filename, `invalid fragment encoding: ${reference}`); return; }
    const targetInfo = await htmlInfo(target);
    if (!targetInfo.ids.has(fragment)) fail(filename, `missing fragment target: ${reference}`);
  }
}

const files = await collect(root);
const htmlFiles = files.filter(filename => /\.html?$/i.test(filename));
if (!htmlFiles.includes(path.join(root, 'index.html'))) failures.push('index.html: homepage is missing');
for (const filename of htmlFiles) {
  const { source, tags, ids, duplicates } = await htmlInfo(filename);
  const html = tags.find(tag => tag.name === 'html');
  if (!/^en(?:-|$)/i.test(html?.attrs.get('lang') ?? '')) fail(filename, 'html lang must declare English');
  if (!/<title>\s*[^<\s][\s\S]*?<\/title>/i.test(source)) fail(filename, 'page title is missing');
  if (!tags.some(tag => tag.name === 'meta' && tag.attrs.get('name')?.toLowerCase() === 'viewport' && /width=device-width/.test(tag.attrs.get('content') ?? ''))) fail(filename, 'responsive viewport is missing');
  if (tags.filter(tag => tag.name === 'main').length !== 1) fail(filename, 'expected exactly one main landmark');
  if (tags.filter(tag => tag.name === 'h1').length !== 1) fail(filename, 'expected exactly one primary heading');
  for (const id of duplicates) fail(filename, `duplicate id: ${id}`);
  for (const tag of tags) {
    for (const attr of ['href', 'src', 'poster']) {
      if (tag.attrs.has(attr)) await checkReference(filename, tag.attrs.get(attr));
    }
    if (tag.name === 'img' && !tag.attrs.has('alt')) fail(filename, 'image is missing its alt attribute');
    for (const attr of ['aria-controls', 'aria-labelledby', 'aria-describedby']) {
      for (const id of (tag.attrs.get(attr) ?? '').split(/\s+/).filter(Boolean)) {
        if (!ids.has(id)) fail(filename, `${attr} points to a missing id: ${id}`);
      }
    }
  }
}

for (const filename of files.filter(filename => /\.css$/i.test(filename))) {
  const source = (await readFile(filename, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of source.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
    await checkReference(filename, match[1]);
  }
}

const scripts = files.filter(filename => /\.(?:js|mjs|cjs)$/i.test(filename));
for (const filename of scripts) {
  const check = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
  if (check.status !== 0) fail(filename, `JavaScript syntax check failed\n${check.stderr || check.error?.message || ''}`);
}

if (failures.length) {
  console.error(`Validation failed (${failures.length} issue${failures.length === 1 ? '' : 's'}):\n${failures.map(failure => `- ${failure}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Validated ${htmlFiles.length} HTML pages, ${linkCount} local references, and ${scripts.length} JavaScript files.`);
  console.log('English metadata, landmarks, headings, image alternatives, anchor targets, and local assets passed.');
  console.log('External link availability and visual appearance require separate review.');
}
