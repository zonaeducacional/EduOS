const { contextBridge, ipcRenderer } = require('electron');

// Ponte segura entre a interface (index.html) e o processo principal.
contextBridge.exposeInMainWorld('browserApi', {
  ready: () => ipcRenderer.send('ui:ready'),
  newTab: () => ipcRenderer.send('tab:new'),
  closeTab: (id) => ipcRenderer.send('tab:close', id),
  switchTab: (id) => ipcRenderer.send('tab:switch', id),
  go: (text) => ipcRenderer.send('nav:go', text),
  back: () => ipcRenderer.send('nav:back'),
  forward: () => ipcRenderer.send('nav:forward'),
  reload: () => ipcRenderer.send('nav:reload'),
  toggleBookmark: () => ipcRenderer.send('bookmark:toggle'),
  removeBookmark: (url) => ipcRenderer.send('bookmark:remove', url),
  onState: (callback) => ipcRenderer.on('state', (_event, state) => callback(state)),
  onFocusAddress: (callback) => ipcRenderer.on('focus-address', () => callback()),
});
