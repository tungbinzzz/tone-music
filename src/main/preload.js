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
  openLaughWindow: () => ipcRenderer.invoke('laughs:open'),
  closeCurrentWindow: () => ipcRenderer.invoke('window:close-current'),
  setMainWindowSize: (width, height) => ipcRenderer.invoke('window:set-main-size', width, height),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('window:set-always-on-top', flag),
  relaunchApp: () => ipcRenderer.invoke('app:relaunch'),
  minimizeCurrentWindow: () => ipcRenderer.invoke('window:minimize-current'),
  quitApp: () => ipcRenderer.invoke('window:quit'),
  selectAudioFile: () => ipcRenderer.invoke('dialog:open-audio'),
  readAudioFile: (filePath) => ipcRenderer.invoke('audio:read-file', filePath),
  engineRequest: (command, payload) => ipcRenderer.invoke('engine:request', command, payload),
  stopEngineProcess: () => ipcRenderer.invoke('engine:stop-process'),
  // License
  activateLicense: (licenseKey) => ipcRenderer.invoke('license:activate', licenseKey),
  verifyLicense: () => ipcRenderer.invoke('license:verify'),
  deactivateLicense: () => ipcRenderer.invoke('license:deactivate'),
  checkUpdate: (version) => ipcRenderer.invoke('license:check-update', version),
  getLicenseInfo: () => ipcRenderer.invoke('license:get-info'),
  onYoutubeVideoSelected: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('youtube:video-selected', listener);
    return () => ipcRenderer.removeListener('youtube:video-selected', listener);
  },
  onYoutubePlaybackState: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('youtube:playback-state', listener);
    return () => ipcRenderer.removeListener('youtube:playback-state', listener);
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
  },
  onConfigChanged: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('config:changed', listener);
    return () => ipcRenderer.removeListener('config:changed', listener);
  }
});
