import { card } from './view.mjs';

const editor = globalThis.document.querySelector('#editor');
const preview = globalThis.document.querySelector('#preview');

editor.addEventListener('input', () => {
  const item = Object.fromEntries(new globalThis.FormData(editor));
  try {
    const icon = new globalThis.URL(item.icon);
    if (icon.protocol !== 'https:' || icon.username || icon.password) item.icon = '';
  } catch {
    item.icon = '';
  }
  preview.innerHTML = card(item, true);
});
