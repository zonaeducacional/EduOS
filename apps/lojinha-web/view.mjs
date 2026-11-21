export function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

export function card(item, preview = false) {
  return `<article class="card">
    ${item.icon ? `<img src="${escape(item.icon)}" alt="" width="48" height="48" referrerpolicy="no-referrer">` : '<span class="icon" aria-hidden="true">↗</span>'}
    <small>${escape(item.category || 'Categoria')}</small>
    <h2>${escape(item.name || 'Nome do aplicativo')}</h2>
    <p>${escape(item.description || 'Descrição do aplicativo')}</p>
    ${preview ? '<span class="button">Abrir</span>' : `<a class="button" href="${escape(item.url)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir ${escape(item.name)}">Abrir</a>`}
  </article>`;
}

export function page(title, content, footer = '') {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title>
  <link rel="stylesheet" href="/lojinha.css"></head><body><main>
  <header><h1>${escape(title)}</h1></header>${content}<footer>${footer}</footer></main></body></html>`;
}

export function editor(items, item, error = '') {
  const field = (name, label, max, { url = false, optional = false } = {}) =>
    `<label>${label}<input name="${name}" type="${url ? 'url' : 'text'}" maxlength="${max}" value="${escape(item[name])}" ${optional ? '' : 'required'}></label>`;
  return page('Administrar Lojinha', `
    ${error ? `<p role="alert">${escape(error)}</p>` : ''}
    <div class="editor"><form method="post" action="/admin/app" id="editor">
      <input type="hidden" name="id" value="${escape(item.id)}">
      ${field('name', 'Nome', 80)}
      ${field('category', 'Categoria', 48)}
      <label>Descrição<textarea name="description" maxlength="400" required>${escape(item.description)}</textarea></label>
      ${field('url', 'Link do aplicativo (HTTPS)', 2048, { url: true })}
      ${field('icon', 'Link do ícone (HTTPS)', 2048, { url: true, optional: true })}
      <div class="actions">
        <button name="action" value="publish">Publicar</button>
        <button name="action" value="draft">${item.published ? 'Ocultar e salvar' : 'Salvar rascunho'}</button>
      </div>
    </form><section aria-labelledby="preview-title"><h2 id="preview-title">Prévia do card</h2>
      <div id="preview">${card(item, true)}</div>
    </section></div>
    <h2>Aplicativos cadastrados</h2>
    ${items.length ? `<ul>${items.map((entry) => `<li><a href="/admin?id=${entry.id}">${escape(entry.name)}</a> · ${entry.published ? 'Publicado' : 'Rascunho'}</li>`).join('')}</ul>` : '<p>Nenhum aplicativo cadastrado.</p>'}
    <div class="actions"><a href="/admin">Novo aplicativo</a><form method="post" action="/admin/logout"><button>Sair</button></form></div>
    <script type="module" src="/preview.mjs"></script>`, '<a href="/">Voltar à vitrine</a>');
}
