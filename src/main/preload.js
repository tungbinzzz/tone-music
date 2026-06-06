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
  openSettingsWindow: () => ipcRenderer.invoke('settings:open'),
  closeCurrentWindow: () => ipcRenderer.invoke('window:close-current'),
  setMainWindowSize: (width, height) => ipcRenderer.invoke('window:set-main-size', width, height),
  engineRequest: (command, payload) => ipcRenderer.invoke('engine:request', command, payload),
  stopEngineProcess: () => ipcRenderer.invoke('engine:stop-process'),
  onYoutubeVideoSelected: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('youtube:video-selected', listener);
    return () => ipcRenderer.removeListener('youtube:video-selected', listener);
  },
  onEngineEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('engine:event', listener);
    return () => ipcRenderer.removeListener('engine:event', listener);
  },
  onEngineLog: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('engine:log', listener);
    return () => ipcRenderer.removeListener('engine:log', listener);
  }
});
