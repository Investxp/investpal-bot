const { spawn } = require('child_process');
const http = require('http');

const PORT = 3005;
const CLOUDFLARED = require('path').join(__dirname, '..', '..', '..', '..', 'Users', 'SAMM', 'AppData', 'Local', 'Temp', 'opencode', 'cloudflared.exe');

function isServerReady() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${PORT}/`, (res) => resolve(true));
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

async function main() {
  if (!(await isServerReady())) {
    console.log('Server not running on port ' + PORT + '. Start it first.');
    process.exit(1);
  }

  console.log('Starting Cloudflare Tunnel to http://localhost:' + PORT + '...\n');

  const cf = spawn(CLOUDFLARED, ['tunnel', '--url', 'http://localhost:' + PORT], {
    stdio: 'inherit',
  });

  cf.on('close', (code) => {
    console.log('cloudflared exited with code ' + code);
    process.exit(code);
  });
}

main();
