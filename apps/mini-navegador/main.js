const { app, BrowserWindow, WebContentsView, Menu, ipcMain, net, protocol, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const UI_URL = 'eduos-browser://chrome/index.html';
const NEWTAB_URL = 'eduos-browser://newtab/';
const BROWSER_PARTITION = 'persist:eduos-web';
const MAX_TABS = 32;
protocol.registerSchemesAsPrivileged([{ scheme: 'eduos-browser', privileges: { standard: true, secure: true } }]);
app.enableSandbox();
const FULL_CHROME_HEIGHT = 104; // abas (36) + barra de endereço (40) + favoritos (28)

let win = null;
let chromeHeight = FULL_CHROME_HEIGHT;
let tabs = []; // { id, view, title, favicon }
let activeId = null;
let nextId = 1;
const openPrefix = '--eduos-open=';
const initialUrl = launchUrl(globalThis.process.argv);
let pendingUrls = [];
const ownsProfile = app.requestSingleInstanceLock(initialUrl ? { url: initialUrl } : {});

function launchUrl(args) {
  const url = args.find((arg) => arg.startsWith(openPrefix))?.slice(openPrefix.length);
  return isWebUrl(url) ? url : null;
}

app.on('second-instance', (_event, _args, _directory, data) => {
  const url = isWebUrl(data?.url) ? data.url : null;
  if (!win) {
    if (url) pendingUrls.push(url);
    return;
  }
  if (url) createTab(url);
  if (win.isMinimized()) win.restore();
  win.focus();
});

// ---------------------------------------------------------------
// Dados salvos em disco (favoritos e histórico)
// ---------------------------------------------------------------
let dataFile = null;
let data = { bookmarks: [], history: [] };

function loadData() {
  dataFile = path.join(app.getPath('userData'), 'data.json');
  try {
    data = { ...data, ...JSON.parse(fs.readFileSync(dataFile, 'utf8')) };
  } catch {
    /* primeira execução: arquivo ainda não existe */
  }
}

function saveData() {
  try {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Não foi possível salvar os dados:', err);
  }
}

// ---------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------
function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function isInternal(url) {
  return url.startsWith('eduos-browser:') || url.startsWith('data:');
}

function isWebUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function allowSiteNavigation(event) {
  if (isWebUrl(event.url)) return;
  if (!event.isMainFrame && /^(about:(blank|srcdoc)$|data:|blob:)/.test(event.url)) return;
  event.preventDefault();
}

// Transforma o que foi digitado na barra de endereço em uma URL.
function normalizeInput(text) {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t) return NEWTAB_URL;
  if (isWebUrl(t)) return new URL(t).href;
  if (/^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?(\/.*)?$/i.test(t)) return 'http://' + t;
  if (!/\s/.test(t) && /^[^\s/]+\.[^\s/.]{2,}(:\d+)?(\/.*)?$/.test(t)) return 'https://' + t;
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(t);
}

function activeTab() {
  return tabs.find((t) => t.id === activeId);
}

// ---------------------------------------------------------------
// Estado enviado para a interface (barra de abas e toolbar)
// ---------------------------------------------------------------
function getState() {
  const tab = activeTab();
  const wc = tab ? tab.view.webContents : null;
  const url = wc ? wc.getURL() : '';
  return {
    tabs: tabs.map((t) => ({
      id: t.id,
      title: t.title,
      favicon: t.favicon,
      loading: t.view.webContents.isLoading(),
    })),
    activeId,
    url: isInternal(url) ? '' : url,
    loading: wc ? wc.isLoading() : false,
    canGoBack: wc ? wc.navigationHistory.canGoBack() : false,
    canGoForward: wc ? wc.navigationHistory.canGoForward() : false,
    bookmarked: data.bookmarks.some((b) => b.url === url),
    bookmarks: data.bookmarks,
  };
}

function pushState() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('state', getState());
}

function layout() {
  const tab = activeTab();
  if (!win || !tab) return;
  const { width, height } = win.getContentBounds();
  tab.view.setBounds({ x: 0, y: chromeHeight, width, height: Math.max(0, height - chromeHeight) });
}

// ---------------------------------------------------------------
// Abas
// ---------------------------------------------------------------
function addHistory(tab) {
  const wc = tab.view.webContents;
  const url = wc.getURL();
  if (!isWebUrl(url)) return;
  if (data.history[0] && data.history[0].url === url) {
    data.history[0].title = wc.getTitle();
  } else {
    data.history.unshift({ url, title: wc.getTitle(), at: Date.now() });
    data.history = data.history.slice(0, 2000);
  }
  saveData();
}

function errorPage(url, description) {
  const html = `<!doctype html><meta charset="utf-8"><title>Erro ao carregar</title>
<style>body{font:16px system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 24px;color:#333}
@media (prefers-color-scheme:dark){body{background:#202124;color:#e8eaed}}small{color:#888}</style>
<h2>Não foi possível abrir esta página</h2><p>${escapeHtml(url)}</p><small>${escapeHtml(description)}</small>`;
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

function createTab(url, internal = false) {
  if (tabs.length >= MAX_TABS || (!internal && url !== NEWTAB_URL && !isWebUrl(url))) return;
  const id = nextId++;
  const view = new WebContentsView({
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: BROWSER_PARTITION },
  });
  const wc = view.webContents;
  const tab = { id, view, title: 'Nova aba', favicon: '' };
  tabs.push(tab);

  // Links que querem abrir janela nova viram abas novas
  wc.setWindowOpenHandler(({ url: target }) => {
    if (isWebUrl(target)) createTab(target);
    return { action: 'deny' };
  });

  wc.on('will-frame-navigate', allowSiteNavigation);
  wc.on('will-redirect', allowSiteNavigation);

  wc.on('page-title-updated', (_e, title) => {
    tab.title = title;
    pushState();
  });
  wc.on('page-favicon-updated', (_e, favicons) => {
    tab.favicon = favicons.find(url => url.startsWith('https://')) || '';
    pushState();
  });
  wc.on('did-start-loading', pushState);
  wc.on('did-stop-loading', () => {
    if (!wc.isDestroyed()) addHistory(tab);
    pushState();
  });
  wc.on('did-navigate', pushState);
  wc.on('did-navigate-in-page', pushState);

  wc.on('did-fail-load', (_e, code, description, failedUrl, isMainFrame) => {
    if (!isMainFrame || code === -3 || !isWebUrl(failedUrl)) return; // -3 = carregamento cancelado
    wc.loadURL(errorPage(failedUrl, description)).catch(() => {});
  });

  // Vídeo em tela cheia: esconde a interface e ocupa a janela toda
  wc.on('enter-html-full-screen', () => {
    chromeHeight = 0;
    win.setFullScreen(true);
    layout();
  });
  wc.on('leave-html-full-screen', () => {
    chromeHeight = FULL_CHROME_HEIGHT;
    win.setFullScreen(false);
    layout();
  });

  // Menu de clique direito
  wc.on('context-menu', (_e, params) => {
    const items = [];
    if (isWebUrl(params.linkURL)) items.push({ label: 'Abrir link em nova aba', click: () => createTab(params.linkURL) });
    if (params.selectionText) items.push({ role: 'copy', label: 'Copiar' });
    if (params.isEditable) items.push({ role: 'paste', label: 'Colar' });
    if (items.length) items.push({ type: 'separator' });
    items.push(
      { label: 'Voltar', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
      { label: 'Recarregar', click: () => wc.reload() },
      { type: 'separator' },
      { label: 'Inspecionar elemento', click: () => wc.inspectElement(params.x, params.y) }
    );
    Menu.buildFromTemplate(items).popup({ window: win });
  });

  wc.loadURL(url).catch(() => {});
  switchTab(id);
  return tab;
}

function switchTab(id) {
  const next = tabs.find((t) => t.id === id);
  if (!next) return;
  const current = activeTab();
  if (current === next) return;
  if (current) win.contentView.removeChildView(current.view);
  activeId = id;
  win.contentView.addChildView(next.view);
  layout();
  next.view.webContents.focus();
  pushState();
}

function closeTab(id) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const [tab] = tabs.splice(idx, 1);
  if (id === activeId) win.contentView.removeChildView(tab.view);
  tab.view.webContents.close();

  if (tabs.length === 0) {
    newTab();
  } else if (id === activeId) {
    switchTab(tabs[Math.min(idx, tabs.length - 1)].id);
  } else {
    pushState();
  }
}

function cycleTab(step) {
  if (tabs.length < 2) return;
  const idx = tabs.findIndex((t) => t.id === activeId);
  switchTab(tabs[(idx + step + tabs.length) % tabs.length].id);
}

function focusAddress() {
  win.webContents.focus();
  win.webContents.send('focus-address');
}

function newTab() {
  createTab(NEWTAB_URL);
  focusAddress();
}

// ---------------------------------------------------------------
// Ações de navegação
// ---------------------------------------------------------------
function go(text) {
  const tab = activeTab();
  if (!tab) return;
  tab.view.webContents.loadURL(normalizeInput(text)).catch(() => {});
  tab.view.webContents.focus();
}

function goBack() {
  const wc = activeTab()?.view.webContents;
  if (wc && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
}

function goForward() {
  const wc = activeTab()?.view.webContents;
  if (wc && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
}

function reloadOrStop() {
  const wc = activeTab()?.view.webContents;
  if (!wc) return;
  if (wc.isLoading()) wc.stop();
  else wc.reload();
}

function zoom(delta) {
  const wc = activeTab()?.view.webContents;
  if (!wc) return;
  wc.setZoomLevel(delta === 0 ? 0 : wc.getZoomLevel() + delta);
}

function toggleBookmark() {
  const wc = activeTab()?.view.webContents;
  if (!wc) return;
  const url = wc.getURL();
  if (!isWebUrl(url)) return;
  const i = data.bookmarks.findIndex((b) => b.url === url);
  if (i >= 0) data.bookmarks.splice(i, 1);
  else data.bookmarks.push({ url, title: wc.getTitle() || url });
  saveData();
  pushState();
}

function removeBookmark(url) {
  data.bookmarks = data.bookmarks.filter((b) => b.url !== url);
  saveData();
  pushState();
}

function openHistory() {
  const rows = data.history
    .filter(h => isWebUrl(h.url))
    .map(
      (h) =>
        `<li><a href="${escapeHtml(h.url)}">${escapeHtml(h.title || h.url)}</a>` +
        `<small>${escapeHtml(h.url)}</small><time>${new Date(h.at).toLocaleString('pt-BR')}</time></li>`
    )
    .join('');
  const html = `<!doctype html><meta charset="utf-8"><title>Histórico</title>
<style>
body{font:15px system-ui,sans-serif;max-width:820px;margin:32px auto;padding:0 24px;color:#202124}
@media (prefers-color-scheme:dark){body{background:#202124;color:#e8eaed}a{color:#8ab4f8}}
ul{list-style:none;padding:0}li{display:grid;grid-template-columns:1fr auto;gap:2px 16px;padding:10px 0;border-bottom:1px solid #8884}
a{text-decoration:none}small{color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;grid-column:1}
time{color:#888;grid-column:2;grid-row:1 / span 2;align-self:center}
</style><h1>Histórico</h1>${rows ? `<ul>${rows}</ul>` : '<p>Nada por aqui ainda.</p>'}`;
  createTab('data:text/html;charset=utf-8,' + encodeURIComponent(html), true);
}

// ---------------------------------------------------------------
// Menu (os atalhos de teclado vivem aqui)
// ---------------------------------------------------------------
function buildMenu() {
  const template = [
    {
      label: 'Navegador',
      submenu: [
        { label: 'Nova aba', accelerator: 'CmdOrCtrl+T', click: newTab },
        { label: 'Fechar aba', accelerator: 'CmdOrCtrl+W', click: () => closeTab(activeId) },
        { label: 'Próxima aba', accelerator: 'Ctrl+Tab', click: () => cycleTab(1) },
        { label: 'Aba anterior', accelerator: 'Ctrl+Shift+Tab', click: () => cycleTab(-1) },
        { type: 'separator' },
        { label: 'Barra de endereço', accelerator: 'CmdOrCtrl+L', click: focusAddress },
        { label: 'Recarregar', accelerator: 'CmdOrCtrl+R', click: reloadOrStop },
        { label: 'Voltar', accelerator: 'Alt+Left', click: goBack },
        { label: 'Avançar', accelerator: 'Alt+Right', click: goForward },
        { type: 'separator' },
        { label: 'Favoritar página', accelerator: 'CmdOrCtrl+D', click: toggleBookmark },
        { label: 'Histórico', accelerator: 'CmdOrCtrl+H', click: openHistory },
        { type: 'separator' },
        { label: 'Aumentar zoom', accelerator: 'CmdOrCtrl+Plus', click: () => zoom(0.5) },
        { label: 'Diminuir zoom', accelerator: 'CmdOrCtrl+-', click: () => zoom(-0.5) },
        { label: 'Zoom padrão', accelerator: 'CmdOrCtrl+0', click: () => zoom(0) },
        { type: 'separator' },
        { label: 'Ferramentas de desenvolvedor', accelerator: 'F12', click: () => activeTab()?.view.webContents.toggleDevTools() },
        { role: 'quit', label: 'Sair' },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Desfazer' },
        { role: 'redo', label: 'Refazer' },
        { type: 'separator' },
        { role: 'cut', label: 'Recortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Colar' },
        { role: 'selectAll', label: 'Selecionar tudo' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------
// IPC: só aceita mensagens vindas da interface do navegador
// ---------------------------------------------------------------
function fromUi(handler) {
  return (event, ...args) => {
    if (win && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame
        && event.senderFrame.url === UI_URL) handler(...args);
  };
}

ipcMain.on('ui:ready', fromUi(pushState));
ipcMain.on('tab:new', fromUi(newTab));
ipcMain.on('tab:close', fromUi((id) => closeTab(id)));
ipcMain.on('tab:switch', fromUi((id) => switchTab(id)));
ipcMain.on('nav:go', fromUi((text) => go(text)));
ipcMain.on('nav:back', fromUi(goBack));
ipcMain.on('nav:forward', fromUi(goForward));
ipcMain.on('nav:reload', fromUi(reloadOrStop));
ipcMain.on('bookmark:toggle', fromUi(toggleBookmark));
ipcMain.on('bookmark:remove', fromUi((url) => removeBookmark(url)));

// ---------------------------------------------------------------
// Janela e ciclo de vida
// ---------------------------------------------------------------
function createWindow(url = NEWTAB_URL) {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    title: 'Mini Navegador',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on('will-frame-navigate', event => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('did-finish-load', pushState);
  void win.loadURL(UI_URL);
  win.on('resize', layout);
  win.on('enter-full-screen', layout);
  win.on('leave-full-screen', layout);
  win.on('closed', () => {
    const closedTabs = tabs;
    win = null;
    tabs = [];
    for (const tab of closedTabs) if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
    activeId = null;
  });

  createTab(url);
}

if (!ownsProfile) app.quit();
else app.whenReady().then(() => {
  loadData();

  const chromeFiles = new Map([
    ['/index.html', 'index.html'],
    ['/styles.css', 'styles.css'],
    ['/renderer.js', 'renderer.js'],
  ]);
  protocol.handle('eduos-browser', request => {
    const url = new URL(request.url);
    const file = url.hostname === 'chrome' && chromeFiles.get(url.pathname);
    return file
      ? net.fetch(pathToFileURL(path.join(__dirname, file)).href)
      : new Response(null, { status: 404 });
  });

  const web = session.fromPartition(BROWSER_PARTITION);
  web.protocol.handle('eduos-browser', request => request.url === NEWTAB_URL
    ? net.fetch(pathToFileURL(path.join(__dirname, 'newtab.html')).href)
    : new Response(null, { status: 404 }));
  const allowed = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock']);
  web.setPermissionCheckHandler((_wc, permission, origin) => isWebUrl(origin) && allowed.has(permission));
  web.setPermissionRequestHandler((_wc, permission, callback, details) => {
    callback(isWebUrl(details.requestingUrl) && allowed.has(permission));
  });

  buildMenu();
  createWindow(initialUrl ?? pendingUrls.shift());
  for (const url of pendingUrls) createTab(url);
  pendingUrls = [];

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
