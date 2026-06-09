const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const licenseClient = require('./licenseClient');

// Icon path: use build/icon.png in dev, resources/icon.png when packaged
const APP_ICON = app.isPackaged
  ? path.join(process.resourcesPath, 'icon.png')
  : path.join(__dirname, '..', '..', 'build', 'icon.png');

const DEFAULT_CONFIG = {
  youtubeUrl: 'https://www.youtube.com',
  cubasePath: '',
  pythonPath: process.platform === 'win32' ? 'python' : 'python3',
  midiOutputName: 'TC Studio To Cubase',
  midiInputName: 'TC Studio From Cubase',
  micVolume: 90,
  cubaseVolume: 64,
  send1Level: 0,
  send2Level: 0,
  autoLaunchYoutube: true,
  autoLaunchCubase: true
};

let mainWindow;
let splashWindow;
let youtubeWindow;
let settingsWindow;
let laughWindow;
let engineProcess;
let nextRequestId = 1;
const pendingRequests = new Map();

function getConfigPath() {
  return path.join(app.getPath('userData'), 'app-config.json');
}

function getDefaultConfig() {
  const localVenvPython = process.platform === 'win32'
    ? path.join(app.getAppPath(), '.venv', 'Scripts', 'python.exe')
    : path.join(app.getAppPath(), '.venv', 'bin', 'python');

  return {
    ...DEFAULT_CONFIG,
    pythonPath: fs.existsSync(localVenvPython) ? localVenvPython : DEFAULT_CONFIG.pythonPath
  };
}

function normalizeConfig(config) {
  const defaults = getDefaultConfig();
  const configuredPython = config.pythonPath || defaults.pythonPath;
  const pythonPath = configuredPython === DEFAULT_CONFIG.pythonPath ? defaults.pythonPath : configuredPython;

  return {
    ...defaults,
    ...config,
    midiOutputName: config.midiOutputName || defaults.midiOutputName,
    midiInputName: config.midiInputName || defaults.midiInputName,
    pythonPath,
    youtubeUrl: config.youtubeUrl || defaults.youtubeUrl
  };
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf8');
    return normalizeConfig(JSON.parse(raw));
  } catch {
    return normalizeConfig({});
  }
}

function saveConfig(config) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(getConfigPath(), JSON.stringify(normalizeConfig(config), null, 2));
}

function emitToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function emitToAllRenderers(channel, payload) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  }
}

function resolveEnginePath() {
  return path.join(app.getAppPath(), 'engine', 'app.py');
}

function resolvePackagedEnginePath() {
  return process.platform === 'win32'
    ? path.join(process.resourcesPath, 'engine', 'tonelink-engine.exe')
    : path.join(process.resourcesPath, 'engine', 'tonelink-engine');
}

function getEngineLaunchConfig(config) {
  if (app.isPackaged) {
    const enginePath = resolvePackagedEnginePath();
    if (!fs.existsSync(enginePath)) {
      throw new Error(`Packaged engine not found: ${enginePath}`);
    }

    return {
      command: enginePath,
      args: [],
      cwd: process.resourcesPath
    };
  }

  return {
    command: config.pythonPath,
    args: [resolveEnginePath()],
    cwd: app.getAppPath()
  };
}

function startEngine() {
  if (engineProcess) return;

  const config = loadConfig();
  let launchConfig;

  try {
    launchConfig = getEngineLaunchConfig(config);
  } catch (error) {
    emitToRenderer('engine:log', { level: 'error', text: error.message });
    throw error;
  }

  engineProcess = spawn(launchConfig.command, launchConfig.args, {
    cwd: launchConfig.cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });

  engineProcess.stdout.setEncoding('utf8');
  engineProcess.stderr.setEncoding('utf8');

  let buffer = '';
  engineProcess.stdout.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        if (message.id && pendingRequests.has(message.id)) {
          const { resolve, reject } = pendingRequests.get(message.id);
          pendingRequests.delete(message.id);
          message.ok === false ? reject(new Error(message.error || 'Engine request failed')) : resolve(message);
        } else {
          emitToRenderer('engine:event', message);
        }
      } catch (error) {
        emitToRenderer('engine:log', { level: 'warn', text: `Invalid engine output: ${line}` });
      }
    }
  });

  engineProcess.stderr.on('data', (chunk) => {
    emitToRenderer('engine:log', { level: 'error', text: chunk.toString() });
  });

  engineProcess.on('exit', (code) => {
    engineProcess = undefined;
    emitToRenderer('engine:log', { level: 'info', text: `Python engine exited with code ${code}` });
  });
}

function requestEngine(command, payload = {}) {
  startEngine();
  const id = nextRequestId++;
  const request = { id, command, payload };

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    engineProcess.stdin.write(`${JSON.stringify(request)}\n`, (error) => {
      if (error) {
        pendingRequests.delete(id);
        reject(error);
      }
    });
  });
}

function stopEngineProcess() {
  if (!engineProcess) return true;
  try {
    engineProcess.kill();
  } finally {
    engineProcess = undefined;
    pendingRequests.clear();
  }
  return true;
}

function launchCubase(cubasePath) {
  if (!cubasePath) {
    emitToRenderer('engine:log', { level: 'warn', text: 'Cubase path is not configured.' });
    return;
  }
  try {
    spawn(cubasePath, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    }).unref();
  } catch (error) {
    emitToRenderer('engine:log', { level: 'error', text: `Cannot launch Cubase: ${error.message}` });
  }
}

function getYoutubeVideoId(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' && parsed.pathname === '/watch') {
      return parsed.searchParams.get('v') || '';
    }
    if (host === 'youtube.com' && parsed.pathname.startsWith('/shorts/')) {
      return parsed.pathname.split('/').filter(Boolean)[1] || '';
    }
    if (host === 'youtu.be') {
      return parsed.pathname.split('/').filter(Boolean)[0] || '';
    }
  } catch {
    return '';
  }
  return '';
}

function handleYoutubeUrl(url) {
  const videoId = getYoutubeVideoId(url);
  if (!videoId) return;
  emitToRenderer('youtube:video-selected', { videoId, url });
}

function openYoutubeWindow(url) {
  const targetUrl = url || DEFAULT_CONFIG.youtubeUrl;

  if (youtubeWindow && !youtubeWindow.isDestroyed()) {
    youtubeWindow.focus();
    if (targetUrl) youtubeWindow.loadURL(targetUrl);
    return true;
  }

  youtubeWindow = new BrowserWindow({
    width: 700,
    height: 420,
    minWidth: 700,
    minHeight: 420,
    title: 'YouTube - TC Studio',
    backgroundColor: '#111111',
    autoHideMenuBar: true,
    frame: false,
    icon: APP_ICON,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  youtubeWindow.webContents.setWindowOpenHandler(({ url: nextUrl }) => {
    youtubeWindow.loadURL(nextUrl);
    return { action: 'deny' };
  });

  youtubeWindow.webContents.on('did-navigate', (_event, nextUrl) => handleYoutubeUrl(nextUrl));
  youtubeWindow.webContents.on('did-navigate-in-page', (_event, nextUrl) => handleYoutubeUrl(nextUrl));
  youtubeWindow.webContents.on('did-finish-load', () => handleYoutubeUrl(youtubeWindow.webContents.getURL()));
  youtubeWindow.webContents.on('dom-ready', () => {
    youtubeWindow.webContents.insertCSS(`
      html::before {
        content: "";
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 28px;
        z-index: 2147483647;
        -webkit-app-region: drag;
      }
    `).catch(() => {});
  });

  // Poll video play/pause state every second
  let lastPlayingState = null;
  const playbackPoller = setInterval(async () => {
    if (!youtubeWindow || youtubeWindow.isDestroyed()) {
      clearInterval(playbackPoller);
      return;
    }
    try {
      const playing = await youtubeWindow.webContents.executeJavaScript(
        '(function(){ var v = document.querySelector("video"); return v ? !v.paused && !v.ended && v.readyState > 2 : false; })()'
      );
      if (playing !== lastPlayingState) {
        lastPlayingState = playing;
        emitToRenderer('youtube:playback-state', { playing });
      }
    } catch (_) { /* page not ready */ }
  }, 1000);

  youtubeWindow.on('closed', () => {
    clearInterval(playbackPoller);
    emitToRenderer('youtube:playback-state', { playing: false });
    youtubeWindow = undefined;
  });

  youtubeWindow.loadURL(targetUrl);
  return true;
}

function closeYoutubeWindow() {
  if (youtubeWindow && !youtubeWindow.isDestroyed()) {
    youtubeWindow.close();
    youtubeWindow = undefined;
  }
  return true;
}

function loadRendererWindow(windowRef, query = '') {
  if (process.env.VITE_DEV_SERVER_URL) {
    windowRef.loadURL(`${process.env.VITE_DEV_SERVER_URL}${query}`);
  } else {
    const search = query.startsWith('?') ? query.slice(1) : query;
    const queryObject = Object.fromEntries(new URLSearchParams(search));
    windowRef.loadFile(path.join(app.getAppPath(), 'dist', 'renderer', 'index.html'), { query: queryObject });
  }
}

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return true;
  }

  settingsWindow = new BrowserWindow({
    width: 320,
    height: 330,
    minWidth: 300,
    minHeight: 300,
    title: 'TC Studio Settings',
    backgroundColor: '#101317',
    autoHideMenuBar: true,
    frame: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.on('closed', () => {
    settingsWindow = undefined;
  });
  loadRendererWindow(settingsWindow, '?view=settings');
  return true;
}

function openLaughWindow() {
  if (laughWindow && !laughWindow.isDestroyed()) {
    laughWindow.focus();
    return true;
  }

  laughWindow = new BrowserWindow({
    width: 380,
    height: 420,
    minWidth: 350,
    minHeight: 380,
    title: 'TC Studio Laughs',
    backgroundColor: '#101317',
    autoHideMenuBar: true,
    frame: false,
    resizable: false,
    minimizable: true,
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  laughWindow.setMenuBarVisibility(false);
  laughWindow.on('closed', () => {
    laughWindow = undefined;
  });
  loadRendererWindow(laughWindow, '?view=laughs');
  return true;
}

function createWindow() {
  // Check license synchronously so we can set the right window dimensions from creation
  const hasLicense = (() => {
    try { return !!licenseClient.readLicense(app); } catch { return false; }
  })();

  const isLicenseMode = !hasLicense;

  mainWindow = new BrowserWindow({
    width:  isLicenseMode ? 420 : 620,
    height: isLicenseMode ? 560 : 120,
    minWidth: 1,
    minHeight: 1,
    backgroundColor: isLicenseMode ? '#101317' : '#00000000',
    autoHideMenuBar: true,
    frame: false,
    transparent: !isLicenseMode,
    resizable: false,
    show: false,
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  if (isLicenseMode) mainWindow.center();

  // When main content ready: close splash then reveal main window
  mainWindow.once('ready-to-show', () => {
    const showMain = () => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
      }
      mainWindow.show();
    };
    // Guarantee splash shows for at least 2.5s
    const elapsed = Date.now() - splashStartTime;
    const remaining = Math.max(0, 2500 - elapsed);
    setTimeout(showMain, remaining);
  });

  loadRendererWindow(mainWindow);
}

let splashStartTime = Date.now();

function createSplashWindow() {
  splashStartTime = Date.now();
  splashWindow = new BrowserWindow({
    width: 300,
    height: 320,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    center: true,
    show: false,
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });
  splashWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.show();
  });
  loadRendererWindow(splashWindow, '?view=splash');
}

app.whenReady().then(() => {
  const config = loadConfig();
  createSplashWindow();  // Show splash first
  createWindow();        // Load main window in background

  if (config.autoLaunchYoutube) openYoutubeWindow(config.youtubeUrl);
  if (config.autoLaunchCubase) launchCubase(config.cubasePath);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (engineProcess) {
    requestEngine('shutdown').catch(() => {});
    engineProcess.kill();
  }
});

ipcMain.handle('config:get', () => loadConfig());
ipcMain.handle('config:save', (_event, config) => {
  const nextConfig = normalizeConfig(config);
  saveConfig(nextConfig);
  emitToAllRenderers('config:changed', nextConfig);
  return nextConfig;
});

ipcMain.handle('dialog:select-cubase', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Cubase executable',
    filters: [{ name: 'Executable', extensions: ['exe'] }],
    properties: ['openFile']
  });
  return result.canceled ? '' : result.filePaths[0];
});

ipcMain.handle('app:launch-youtube', async (_event, url) => {
  return openYoutubeWindow(url || DEFAULT_CONFIG.youtubeUrl);
});

ipcMain.handle('app:close-youtube', async () => closeYoutubeWindow());

ipcMain.handle('app:launch-cubase', (_event, cubasePath) => {
  launchCubase(cubasePath);
  return true;
});

ipcMain.handle('preset:export', async (_event, preset) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save TC Studio preset',
    defaultPath: `${preset?.name || 'tc-studio-preset'}.json`,
    filters: [{ name: 'TC Studio Preset', extensions: ['json'] }]
  });

  if (result.canceled || !result.filePath) {
    return { saved: false };
  }

  fs.writeFileSync(result.filePath, JSON.stringify(preset, null, 2), 'utf8');
  return { saved: true, filePath: result.filePath };
});

ipcMain.handle('preset:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import TC Studio preset',
    filters: [{ name: 'TC Studio Preset', extensions: ['json'] }],
    properties: ['openFile']
  });

  if (result.canceled || !result.filePaths[0]) {
    return { imported: false };
  }

  const filePath = result.filePaths[0];
  const preset = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return { imported: true, filePath, preset };
});

ipcMain.handle('settings:open', () => openSettingsWindow());
ipcMain.handle('laughs:open', () => openLaughWindow());
ipcMain.handle('window:close-current', (event) => {
  const currentWindow = BrowserWindow.fromWebContents(event.sender);
  if (currentWindow && !currentWindow.isDestroyed()) {
    currentWindow.close();
    return true;
  }
  return false;
});
ipcMain.handle('dialog:open-audio', async (event) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(parentWindow ?? undefined, {
    title: 'Chọn file âm thanh',
    properties: ['openFile'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'webm'] }]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});
ipcMain.handle('audio:read-file', async (_event, filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    return { ok: true, base64: buffer.toString('base64'), size: buffer.length };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});
ipcMain.handle('window:minimize-current', (event) => {
  const currentWindow = BrowserWindow.fromWebContents(event.sender);
  if (currentWindow && !currentWindow.isDestroyed()) {
    if (currentWindow.isMinimizable()) {
      currentWindow.minimize();
    } else {
      currentWindow.hide();
    }
    return true;
  }
  return false;
});
ipcMain.handle('window:set-main-size', (_event, width, height) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const nextWidth = Math.max(1, Math.ceil(Number(width) || 1));
  const nextHeight = Math.max(1, Math.ceil(Number(height) || 1));
  mainWindow.setContentSize(nextWidth, nextHeight);
  return true;
});
ipcMain.handle('window:minimize', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  mainWindow.minimize();
  return true;
});
ipcMain.handle('window:set-always-on-top', (_event, flag) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  mainWindow.setAlwaysOnTop(!!flag, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(!!flag);
  return true;
});
// Relaunch app after license activation so window is recreated with correct toolbar dimensions
ipcMain.handle('app:relaunch', () => {
  app.relaunch();
  app.exit(0);
  return true;
});
ipcMain.handle('window:quit', () => {
  app.quit();
  return true;
});
ipcMain.handle('engine:request', (_event, command, payload) => requestEngine(command, payload));
ipcMain.handle('engine:stop-process', () => stopEngineProcess());

// ─── License IPC handlers ─────────────────────────────────────────────────────
ipcMain.handle('license:activate', async (_event, licenseKey) => {
  try { return await licenseClient.activateLicense(app, licenseKey); }
  catch (e) { return { valid: false, message: e.message }; }
});
ipcMain.handle('license:verify', async () => {
  try { return await licenseClient.verifyLicense(app); }
  catch (e) { return { valid: false, message: e.message }; }
});
ipcMain.handle('license:deactivate', async () => {
  try { return await licenseClient.deactivateLicense(app); }
  catch (e) { return { success: false, message: e.message }; }
});
ipcMain.handle('license:check-update', async (_event, version) => {
  try { return await licenseClient.checkUpdate(version || app.getVersion()); }
  catch (e) { return { has_update: false }; }
});
ipcMain.handle('license:get-info', () => {
  return licenseClient.readLicense(app);
});
