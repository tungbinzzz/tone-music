const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '..');
const devUrl = 'http://127.0.0.1:5173';
const isWindows = process.platform === 'win32';
const bin = (name) => path.join(root, 'node_modules', '.bin', `${name}${isWindows ? '.cmd' : ''}`);

function waitForServer(url, timeoutMs = 30000) {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const tick = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });

      request.on('error', () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Vite dev server was not ready at ${url}`));
          return;
        }
        setTimeout(tick, 250);
      });
    };

    tick();
  });
}

const vite = spawn(bin('vite'), ['--host', '127.0.0.1'], {
  cwd: root,
  stdio: 'inherit',
  shell: isWindows,
});

let electron;

waitForServer(devUrl)
  .then(() => {
    electron = spawn(bin('electron'), ['.'], {
      cwd: root,
      stdio: 'inherit',
      shell: isWindows,
      env: {
        ...process.env,
        VITE_DEV_SERVER_URL: devUrl,
      },
    });

    electron.on('exit', (code) => {
      vite.kill();
      process.exit(code ?? 0);
    });
  })
  .catch((error) => {
    console.error(error.message);
    vite.kill();
    process.exit(1);
  });

process.on('SIGINT', () => {
  if (electron) electron.kill();
  vite.kill();
  process.exit(0);
});
