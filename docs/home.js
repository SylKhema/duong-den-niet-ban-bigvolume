// Bookmarks and feedback links created before the shared homepage use these fragments.
if (/^#(?:tap\/[1-5](?:\/|$)|(?:downloads|home)$)/.test(location.hash)) {
  const reader = new URL('./bo-dai/', location.href);
  reader.search = location.search;
  reader.hash = location.hash;
  location.replace(reader);
}
