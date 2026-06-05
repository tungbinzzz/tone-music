const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nhacApp', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  selectCubase: () => ipcRenderer.invoke('dialog:select-cubase'),
  launchYoutube: (url) => ipcRenderer.invoke('app:launch-youtube', url),
  closeYoutube: () => ipcRenderer.invoke('app:close-youtube'),
  launchCubase: (path) => ipcRenderer.invoke('app:launch-cubase', path),
  exportPreset: (preset) => ipcRenderer.invoke('preset:export', preset),
  importPreset: () => ipcRenderer.invoke('preset:import'),
  engineRequest: (command, payload) => ipcRenderer.invoke('engine:request', command, payload),
  stopEngineProcess: () => ipcRenderer.invoke('engine:stop-process'),
  onYoutubeVideoSelected: (callback) => ipcRenderer.on('youtube:video-selected', (_event, payload) => callback(payload)),
  onEngineEvent: (callback) => ipcRenderer.on('engine:event', (_event, payload) => callback(payload)),
  onEngineLog: (callback) => ipcRenderer.on('engine:log', (_event, payload) => callback(payload))
});
