// Tiny helper — grab a DOM element by id, throw if missing
export function el(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Element #${id} not found`);
  return node;
}

// Escape HTML so user-provided strings can't inject tags
export function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
