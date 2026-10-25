const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('keyclickSettings', {
  get: () => ipcRenderer.invoke('settings:get'),
  set: (patch) => ipcRenderer.send('settings:set', patch),
  reset: () => ipcRenderer.invoke('settings:reset'),
  onChanged: (callback) => {
    ipcRenderer.on('settings-changed', (_event, payload) => callback(payload));
  },
  onPackStatus: (callback) => {
    ipcRenderer.on('pack-status', (_event, payload) => callback(payload));
  },
  onShortcutConflict: (callback) => {
    ipcRenderer.on('shortcut-conflict', (_event, payload) => callback(payload));
  },
  onShowPage: (callback) => {
    ipcRenderer.on('show-page', (_event, page) => callback(page));
  },
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  openPrivacySettings: () => ipcRenderer.invoke('app:open-privacy-settings'),
});
