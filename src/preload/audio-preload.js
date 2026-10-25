const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('keyclick', {
  onKeyEvent: (callback) => {
    ipcRenderer.on('key-event', (_event, payload) => callback(payload));
  },
  onSettingsChanged: (callback) => {
    ipcRenderer.on('settings-changed', (_event, payload) => callback(payload));
  },
  reportPackStatus: (status) => {
    ipcRenderer.send('pack-load-status', status);
  },
});
