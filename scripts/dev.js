const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '..');
const devUrl = 'http://127.0.0.1:5173';
const isWindows = process.platform === 'win32';
const bin = (name) => path.join(root, 'node_modules', '.bin', `${name}${isWindows ? '.cmd' : ''}`);

function probeServer(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(true);
    });

    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });

    request.on('error', () => resolve(false));
  });
}

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

let vite;
let electron;

async function start() {
  const serverAlreadyRunning = await probeServer(devUrl);

  if (!serverAlreadyRunning) {
    vite = spawn(bin('vite'), ['--host', '127.0.0.1'], {
      cwd: root,
      stdio: 'inherit',
      shell: isWindows,
    });

    vite.on('exit', (code) => {
      if (!electron) process.exit(code ?? 0);
    });

    await waitForServer(devUrl);
  } else {
    console.log(`Using existing Vite dev server at ${devUrl}`);
  }

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
    if (vite) vite.kill();
    process.exit(code ?? 0);
  });
}

start().catch((error) => {
    console.error(error.message);
    if (vite) vite.kill();
    process.exit(1);
});

process.on('SIGINT', () => {
  if (electron) electron.kill();
  if (vite) vite.kill();
  process.exit(0);
});
