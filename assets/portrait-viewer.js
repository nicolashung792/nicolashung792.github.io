const closeLink = document.querySelector('.close-portrait');
const home = new URL(closeLink.href);
const previousPage = document.referrer ? new URL(document.referrer) : null;
const cameFromHome = previousPage?.origin === home.origin &&
  [home.pathname, new URL('index.html', home).pathname].includes(previousPage.pathname);

closeLink.addEventListener('click', event => {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  if (cameFromHome && window.history.length > 1) {
    event.preventDefault();
    window.history.back();
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeLink.click();
  }
});
