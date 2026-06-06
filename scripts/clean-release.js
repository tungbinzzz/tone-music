const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const releasePath = path.join(root, 'release-fixed');

if (fs.existsSync(releasePath)) {
  fs.rmSync(releasePath, { recursive: true, force: true });
}
