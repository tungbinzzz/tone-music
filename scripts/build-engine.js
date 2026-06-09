const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';
const localPyInstaller = path.join(
  root,
  '.venv',
  isWindows ? 'Scripts' : 'bin',
  isWindows ? 'pyinstaller.exe' : 'pyinstaller',
);

const pyInstaller = fs.existsSync(localPyInstaller) ? localPyInstaller : 'pyinstaller';
const distPath = path.join(root, 'dist', 'engine');
const workPath = path.join(root, 'build', 'pyinstaller');
const entryPath = path.join(root, 'engine', 'app.py');

fs.mkdirSync(distPath, { recursive: true });
fs.mkdirSync(workPath, { recursive: true });

const args = [
  '--noconfirm',
  '--clean',
  '--onefile',
  '--name',
  'tonelink-engine',
  '--distpath',
  distPath,
  '--workpath',
  workPath,
  '--specpath',
  workPath,
  '--hidden-import',
  'mido.backends.rtmidi',
  '--hidden-import',
  'rtmidi',
  '--hidden-import',
  'license_guard',
  '--hidden-import',
  'urllib.request',
  '--hidden-import',
  'urllib.error',
  entryPath,
];

const result = spawnSync(pyInstaller, args, {
  cwd: root,
  stdio: 'inherit',
  shell: false,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
