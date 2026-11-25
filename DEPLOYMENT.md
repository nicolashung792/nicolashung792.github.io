# Publish the homepage on GitHub Pages

This static site is prepared for [nicolashung792/nicolashung792.github.io](https://github.com/nicolashung792/nicolashung792.github.io). GitHub Pages can serve the HTML, CSS, and SVG files directly from the root of `main`. The empty `.nojekyll` file disables Jekyll processing.

## Preview the proposed changes

Check out the branch you want to preview. From the site directory, run these commands with Node.js 20 or later.

```sh
node scripts/check.mjs
node scripts/serve.mjs
```

Open [the local preview](http://127.0.0.1:4173/). The check covers local links, anchors, image alternatives, and document structure. Open the portrait with a keyboard and check that the close control returns to the homepage. Visit a missing path to check the custom 404 page. Stop the preview with Ctrl+C.

## Publish

1. Review the homepage pull request and merge it into `main`.
2. Open [Settings → Pages](https://github.com/nicolashung792/nicolashung792.github.io/settings/pages). Under **Build and deployment**, choose **Deploy from a branch**.
3. Select **main** and **/(root)**, then click **Save**. If these settings are already selected, the merge should trigger the deployment.
4. Check the [Actions tab](https://github.com/nicolashung792/nicolashung792.github.io/actions) for a successful Pages deployment. Open [the homepage](https://nicolashung792.github.io/) and confirm that the title reads **Jingyi Huang | Mathematics**.

Keep `index.html`, `portrait.html`, `404.html`, `.nojekyll`, and `assets/` in the publishing root. Future changes merged into the publishing branch will deploy automatically. If the first deployment fails, open its workflow log and verify the selected branch and folder. [GitHub Pages publishing-source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
