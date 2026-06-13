const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
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
let favoritesWindow;
let engineProcess;
let nextRequestId = 1;
const pendingRequests = new Map();
let adBlockerPromise;
const adBlockedSessions = new WeakSet();

function getConfigPath() {
  return path.join(app.getPath('userData'), 'app-config.json');
}

function getFavoritesPath() {
  return path.join(app.getPath('userData'), 'favorite-songs.json');
}

function getKnownSongsPath() {
  return path.join(app.getPath('userData'), 'known-songs.json');
}

function readJsonArray(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJsonArray(filePath, rows) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(rows, null, 2), 'utf8');
}

function readFavoriteSongs() {
  return readJsonArray(getFavoritesPath());
}

function writeFavoriteSongs(songs) {
  writeJsonArray(getFavoritesPath(), songs);
}

function normalizeFavoriteSong(song = {}) {
  const videoId = String(song.videoId || '').trim();
  if (!videoId) throw new Error('Missing YouTube video id.');

  const now = new Date().toISOString();
  const transitions = Array.isArray(song.transitions)
    ? song.transitions
        .map((item) => ({
          time: Math.max(0, Number(item?.time || 0)),
          tone: String(item?.tone || '').trim()
        }))
        .filter((item) => item.tone)
        .filter((item, index, rows) => rows.findIndex((row) => row.tone === item.tone) === index)
    : [];

  return {
    videoId,
    title: String(song.title || videoId).trim(),
    url: String(song.url || '').trim(),
    duration: Math.max(0, Number(song.duration || 0)),
    mainTone: String(song.mainTone || '').trim(),
    completed: Boolean(song.completed),
    completedAt: song.completedAt ? String(song.completedAt) : '',
    transitions,
    updatedAt: now,
    createdAt: song.createdAt ? String(song.createdAt) : now
  };
}

function upsertFavoriteSong(song) {
  const nextSong = normalizeFavoriteSong(song);
  const songs = readFavoriteSongs();
  const index = songs.findIndex((item) => item.videoId === nextSong.videoId);
  if (index >= 0) {
    songs[index] = {
      ...songs[index],
      ...nextSong,
      createdAt: songs[index].createdAt || nextSong.createdAt,
      mainTone: nextSong.mainTone || songs[index].mainTone || '',
      completed: nextSong.completed || Boolean(songs[index].completed),
      completedAt: nextSong.completedAt || songs[index].completedAt || '',
      transitions: nextSong.transitions.length ? nextSong.transitions : (songs[index].transitions || [])
    };
  } else {
    songs.unshift(nextSong);
  }
  writeFavoriteSongs(songs);
  return songs;
}

function readKnownSongs() {
  return readJsonArray(getKnownSongsPath());
}

function writeKnownSongs(songs) {
  writeJsonArray(getKnownSongsPath(), songs);
}

function upsertKnownSong(song) {
  const nextSong = normalizeFavoriteSong(song);
  if (!nextSong.mainTone || nextSong.mainTone === '--') {
    return readKnownSongs();
  }
  const songs = readKnownSongs();
  const index = songs.findIndex((item) => item.videoId === nextSong.videoId);
  if (index >= 0) {
    songs[index] = {
      ...songs[index],
      ...nextSong,
      createdAt: songs[index].createdAt || nextSong.createdAt,
      completed: nextSong.completed || Boolean(songs[index].completed),
      completedAt: nextSong.completedAt || songs[index].completedAt || '',
      mainTone: nextSong.mainTone || songs[index].mainTone || '',
      transitions: nextSong.transitions.length ? nextSong.transitions : (songs[index].transitions || [])
    };
  } else {
    songs.unshift(nextSong);
  }
  writeKnownSongs(songs);
  return songs;
}

function mergeKnownSongData(localSong, onlineSong) {
  if (!localSong) return onlineSong || null;
  if (!onlineSong) return localSong;

  const transitions = [...(localSong.transitions || []), ...(onlineSong.transitions || [])]
    .map((item) => ({
      time: Math.max(0, Number(item?.time || 0)),
      tone: String(item?.tone || '').trim()
    }))
    .filter((item) => item.tone)
    .sort((left, right) => left.time - right.time)
    .filter((item, index, rows) => rows.findIndex((row) => row.tone === item.tone) === index);

  return {
    ...localSong,
    ...onlineSong,
    createdAt: localSong.createdAt || onlineSong.createdAt || '',
    completed: Boolean(localSong.completed || onlineSong.completed),
    completedAt: localSong.completedAt || onlineSong.completedAt || '',
    mainTone: onlineSong.mainTone || localSong.mainTone || '',
    transitions
  };
}

async function getKnownSong(videoId) {
  const id = String(videoId || '').trim();
  if (!id) return null;
  const localSong = readKnownSongs().find((song) => song.videoId === id) || null;
  if (
    localSong?.mainTone
    && localSong.mainTone !== '--'
    && Array.isArray(localSong.transitions)
    && localSong.transitions.length > 0
  ) {
    return localSong;
  }

  const onlineSong = await licenseClient.getOnlineKnownSong(id);
  const mergedSong = mergeKnownSongData(localSong, onlineSong);
  if (onlineSong?.mainTone) {
    const songs = upsertKnownSong(mergedSong);
    emitToAllRenderers('known-songs:changed', songs);
  }
  return mergedSong;
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

  // Read existing file to use as fallback for missing/empty values
  let existing = {};
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf8');
    existing = JSON.parse(raw);
  } catch {
    // ignore
  }

  const configuredPython = config.pythonPath || existing.pythonPath || defaults.pythonPath;
  const pythonPath = configuredPython === DEFAULT_CONFIG.pythonPath ? defaults.pythonPath : configuredPython;

  return {
    ...defaults,
    ...existing,
    ...config,
    midiOutputName: config.midiOutputName || existing.midiOutputName || defaults.midiOutputName,
    midiInputName: config.midiInputName || existing.midiInputName || defaults.midiInputName,
    pythonPath,
    youtubeUrl: config.youtubeUrl || existing.youtubeUrl || defaults.youtubeUrl
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

async function enableYoutubeAdBlocker(targetSession) {
  if (!targetSession || adBlockedSessions.has(targetSession)) return;
  if (typeof fetch !== 'function') {
    emitToRenderer('engine:log', { level: 'warn', text: 'Ad blocker unavailable: fetch is not supported in this runtime.' });
    return;
  }

  if (!adBlockerPromise) {
    const cachePath = path.join(app.getPath('userData'), 'adblocker-engine.bin');
    adBlockerPromise = ElectronBlocker.fromPrebuiltAdsAndTracking(
      (...args) => fetch(...args),
      {
        path: cachePath,
        read: fs.promises.readFile,
        write: async (filePath, data) => {
          await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
          await fs.promises.writeFile(filePath, data);
        }
      }
    );
  }

  const blocker = await adBlockerPromise;
  blocker.enableBlockingInSession(targetSession);
  adBlockedSessions.add(targetSession);
  emitToRenderer('engine:log', { level: 'info', text: 'YouTube ad blocker enabled.' });
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
    const ext = path.extname(cubasePath).toLowerCase();
    if (ext === '.exe') {
      spawn(cubasePath, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }).unref();
    } else {
      shell.openPath(cubasePath).catch((err) => {
        emitToRenderer('engine:log', { level: 'error', text: `Cannot open Cubase project: ${err.message}` });
      });
    }
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
    if (targetUrl) {
      loadRendererWindow(youtubeWindow, `?view=youtube&url=${encodeURIComponent(targetUrl)}`);
    }
    return true;
  }

  youtubeWindow = new BrowserWindow({
    width: 800,
    height: 540,
    minWidth: 700,
    minHeight: 420,
    title: 'YouTube - TC Studio',
    backgroundColor: '#111111',
    autoHideMenuBar: true,
    frame: true,
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      webviewTag: true
    }
  });

  // const youtubeMenu = Menu.buildFromTemplate([
  //   {
  //     label: 'Cửa sổ',
  //     submenu: [
  //       {
  //         label: 'Luôn ở trên cùng (Ghim)',
  //         type: 'checkbox',
  //         checked: false,
  //         accelerator: 'CmdOrCtrl+T',
  //         click: (menuItem) => {
  //           if (youtubeWindow && !youtubeWindow.isDestroyed()) {
  //             youtubeWindow.setAlwaysOnTop(menuItem.checked);
  //           }
  //         }
  //       },
  //       { type: 'separator' },
  //       { label: 'Tải lại trang', role: 'reload' },
  //       { label: 'Thu nhỏ', role: 'minimize' },
  //       { label: 'Đóng', role: 'close' }
  //     ]
  //   }
  // ]);
  // youtubeWindow.setMenu(youtubeMenu);

  youtubeWindow.on('closed', () => {
    emitToRenderer('youtube:playback-state', { playing: false });
    youtubeWindow = undefined;
  });

  enableYoutubeAdBlocker(youtubeWindow.webContents.session)
    .catch((error) => {
      adBlockerPromise = undefined;
      emitToRenderer('engine:log', { level: 'warn', text: `Cannot enable YouTube ad blocker: ${error.message}` });
    })
    .finally(() => {
      if (youtubeWindow && !youtubeWindow.isDestroyed()) {
        loadRendererWindow(youtubeWindow, `?view=youtube&url=${encodeURIComponent(targetUrl)}`);
      }
    });
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

function openFavoritesWindow() {
  if (favoritesWindow && !favoritesWindow.isDestroyed()) {
    favoritesWindow.focus();
    return true;
  }

  favoritesWindow = new BrowserWindow({
    width: 420,
    height: 520,
    minWidth: 360,
    minHeight: 420,
    title: 'TC Studio Favorites',
    backgroundColor: '#101317',
    autoHideMenuBar: true,
    frame: false,
    resizable: true,
    minimizable: true,
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  favoritesWindow.setMenuBarVisibility(false);
  favoritesWindow.on('closed', () => {
    favoritesWindow = undefined;
  });
  loadRendererWindow(favoritesWindow, '?view=favorites');
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

ipcMain.handle('favorites:list', () => readFavoriteSongs());
ipcMain.handle('favorites:save', (_event, song) => {
  const songs = upsertFavoriteSong(song);
  emitToAllRenderers('favorites:changed', songs);
  return songs;
});
ipcMain.handle('favorites:delete', (_event, videoId) => {
  const songs = readFavoriteSongs().filter((song) => song.videoId !== String(videoId || ''));
  writeFavoriteSongs(songs);
  emitToAllRenderers('favorites:changed', songs);
  return songs;
});
ipcMain.handle('known-songs:list', () => readKnownSongs());
ipcMain.handle('known-songs:get', (_event, videoId) => getKnownSong(videoId));
ipcMain.handle('known-songs:save', (_event, song) => {
  const songs = upsertKnownSong(song);
  const savedSong = readKnownSongs().find((item) => item.videoId === String(song?.videoId || '')) || null;
  emitToAllRenderers('known-songs:changed', songs);
  if (!savedSong?.mainTone || savedSong.mainTone === '--') return songs;

  licenseClient.saveOnlineKnownSong(app, savedSong).then((result) => {
    if (result?.saved && result.song?.mainTone) {
      const localSong = readKnownSongs().find((item) => item.videoId === result.song.videoId) || null;
      const merged = upsertKnownSong(mergeKnownSongData(localSong, result.song));
      emitToAllRenderers('known-songs:changed', merged);
    }
  }).catch((error) => {
    emitToRenderer('engine:log', { level: 'warn', text: `Known song online save failed: ${error.message}` });
  });
  return songs;
});

ipcMain.handle('dialog:select-cubase', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Cubase executable or project file',
    filters: [{ name: 'Cubase Files (*.exe, *.cpr, *.prj)', extensions: ['exe', 'cpr', 'prj'] }],
    properties: ['openFile']
  });
  return result.canceled ? '' : result.filePaths[0];
});

ipcMain.handle('app:launch-youtube', async (_event, url) => {
  return openYoutubeWindow(url || DEFAULT_CONFIG.youtubeUrl);
});

ipcMain.handle('app:close-youtube', async () => closeYoutubeWindow());

ipcMain.on('youtube:minimize', () => {
  if (youtubeWindow && !youtubeWindow.isDestroyed()) {
    youtubeWindow.minimize();
  }
});

ipcMain.on('youtube:close', () => {
  if (youtubeWindow && !youtubeWindow.isDestroyed()) {
    youtubeWindow.close();
  }
});

ipcMain.handle('youtube:toggle-pin', () => {
  if (youtubeWindow && !youtubeWindow.isDestroyed()) {
    const isAlwaysOnTop = !youtubeWindow.isAlwaysOnTop();
    youtubeWindow.setAlwaysOnTop(isAlwaysOnTop);
    return isAlwaysOnTop;
  }
  return false;
});

ipcMain.handle('youtube:is-pinned', () => {
  if (youtubeWindow && !youtubeWindow.isDestroyed()) {
    return youtubeWindow.isAlwaysOnTop();
  }
  return false;
});

ipcMain.on('youtube:playback-state-changed', (_event, payload) => {
  if (typeof payload === 'boolean') {
    emitToRenderer('youtube:playback-state', { playing: payload });
    return;
  }
  emitToRenderer('youtube:playback-state', {
    playing: Boolean(payload?.playing),
    ended: Boolean(payload?.ended),
    currentTime: Number(payload?.currentTime || 0),
    duration: Number(payload?.duration || 0),
    progressRatio: Number(payload?.progressRatio || 0),
    title: String(payload?.title || '')
  });
});

ipcMain.on('youtube:video-selected-changed', (_event, payload) => {
  emitToRenderer('youtube:video-selected', payload);
});

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
ipcMain.handle('favorites:open', () => openFavoritesWindow());
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
