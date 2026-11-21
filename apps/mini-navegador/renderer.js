const api = window.browserApi;

const tabsEl = document.getElementById('tabs');
const addressEl = document.getElementById('address');
const backBtn = document.getElementById('back');
const forwardBtn = document.getElementById('forward');
const reloadBtn = document.getElementById('reload');
const starBtn = document.getElementById('star');
const bookmarksEl = document.getElementById('bookmarks');

function renderTabs(state) {
  tabsEl.replaceChildren();

  for (const tab of state.tabs) {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === state.activeId ? ' active' : '');
    el.title = tab.title;

    let icon;
    if (tab.loading) {
      icon = document.createElement('span');
      icon.className = 'dot';
    } else if (tab.favicon) {
      icon = document.createElement('img');
      icon.src = tab.favicon;
      icon.alt = '';
      icon.onerror = () => icon.remove();
    } else {
      icon = document.createElement('span');
      icon.className = 'dot';
      icon.style.animation = 'none';
    }

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = tab.title || 'Nova aba';

    const close = document.createElement('button');
    close.className = 'close';
    close.textContent = '×';
    close.title = 'Fechar aba';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      api.closeTab(tab.id);
    });

    el.append(icon, title, close);
    el.addEventListener('mousedown', (e) => {
      if (e.button === 1) api.closeTab(tab.id); // clique com o botão do meio fecha
      else api.switchTab(tab.id);
    });
    tabsEl.append(el);
  }
}

function renderBookmarks(state) {
  bookmarksEl.replaceChildren();

  if (state.bookmarks.length === 0) {
    const hint = document.createElement('span');
    hint.className = 'empty';
    hint.textContent = 'Favoritos aparecem aqui — use ☆ ou Ctrl+D.';
    bookmarksEl.append(hint);
    return;
  }

  for (const b of state.bookmarks) {
    const el = document.createElement('div');
    el.className = 'bookmark';
    el.textContent = b.title || b.url;
    el.title = b.url + '\n(botão direito para remover)';
    el.addEventListener('click', () => api.go(b.url));
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      api.removeBookmark(b.url);
    });
    bookmarksEl.append(el);
  }
}

api.onState((state) => {
  renderTabs(state);
  renderBookmarks(state);

  backBtn.disabled = !state.canGoBack;
  forwardBtn.disabled = !state.canGoForward;
  reloadBtn.textContent = state.loading ? '✕' : '⟳';
  reloadBtn.title = state.loading ? 'Parar' : 'Recarregar (Ctrl+R)';
  starBtn.textContent = state.bookmarked ? '★' : '☆';
  starBtn.classList.toggle('on', state.bookmarked);

  // Não sobrescreve o que a pessoa está digitando
  if (document.activeElement !== addressEl) addressEl.value = state.url;
});

api.onFocusAddress(() => {
  addressEl.focus();
  addressEl.select();
});

addressEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    api.go(addressEl.value);
    addressEl.blur();
  } else if (e.key === 'Escape') {
    addressEl.blur();
  }
});

addressEl.addEventListener('focus', () => addressEl.select());
addressEl.addEventListener('blur', () => api.ready()); // restaura o endereço da aba

document.getElementById('new-tab').addEventListener('click', api.newTab);
backBtn.addEventListener('click', api.back);
forwardBtn.addEventListener('click', api.forward);
reloadBtn.addEventListener('click', api.reload);
starBtn.addEventListener('click', api.toggleBookmark);

api.ready();
