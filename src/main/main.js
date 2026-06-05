const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const DEFAULT_CONFIG = {
  youtubeUrl: 'https://www.youtube.com',
  cubasePath: '',
  pythonPath: process.platform === 'win32' ? 'python' : 'python3',
  midiOutputName: '',
  midiInputName: '',
  micVolume: 90,
  cubaseVolume: 64,
  send1Level: 0,
  send2Level: 0,
  autoLaunchYoutube: true,
  autoLaunchCubase: true
};

let mainWindow;
let youtubeWindow;
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

function loadConfig() {
  const defaults = getDefaultConfig();
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf8');
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

function saveConfig(config) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(getConfigPath(), JSON.stringify({ ...getDefaultConfig(), ...config }, null, 2));
}

function emitToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function resolveEnginePath() {
  return path.join(app.getAppPath(), 'engine', 'app.py');
}

function startEngine() {
  if (engineProcess) return;

  const config = loadConfig();
  engineProcess = spawn(config.pythonPath, [resolveEnginePath()], {
    cwd: app.getAppPath(),
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
    title: 'YouTube - Cubase Tone Assistant',
    backgroundColor: '#111111',
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
  youtubeWindow.on('closed', () => {
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 640,
    height: 180,
    minWidth: 600,
    minHeight: 160,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    frame: false,
    transparent: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  mainWindow.setMenuBarVisibility(false);

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'renderer', 'index.html'));
  }
}

app.whenReady().then(() => {
  const config = loadConfig();
  createWindow();

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
  const nextConfig = { ...getDefaultConfig(), ...config };
  saveConfig(nextConfig);
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
    title: 'Save ToneLink preset',
    defaultPath: `${preset?.name || 'tonelink-preset'}.json`,
    filters: [{ name: 'ToneLink Preset', extensions: ['json'] }]
  });

  if (result.canceled || !result.filePath) {
    return { saved: false };
  }

  fs.writeFileSync(result.filePath, JSON.stringify(preset, null, 2), 'utf8');
  return { saved: true, filePath: result.filePath };
});

ipcMain.handle('preset:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import ToneLink preset',
    filters: [{ name: 'ToneLink Preset', extensions: ['json'] }],
    properties: ['openFile']
  });

  if (result.canceled || !result.filePaths[0]) {
    return { imported: false };
  }

  const filePath = result.filePaths[0];
  const preset = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return { imported: true, filePath, preset };
});

ipcMain.handle('engine:request', (_event, command, payload) => requestEngine(command, payload));
ipcMain.handle('engine:stop-process', () => stopEngineProcess());
