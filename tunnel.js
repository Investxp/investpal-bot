const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = 3005;
const CLOUDFLARED = path.join(__dirname, 'cloudflared.exe');
const TUNNEL_URL = 'https://investpal.online';

function isServerReady() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${PORT}/`, (res) => resolve(true));
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

async function startServer() {
  return new Promise((resolve) => {
    console.log('Starting production server on port ' + PORT + '...');
    const proc = spawn('cmd.exe', ['/c', 'npm', 'run', 'prod'], { stdio: 'inherit' });
    proc.on('error', (err) => { console.error('Failed:', err.message); resolve(false); });
    resolve(true);
  });
}

async function waitForServer(maxWait = 30) {
  for (let i = 0; i < maxWait; i++) {
    if (await isServerReady()) {
      console.log('Server ready on http://localhost:' + PORT);
      return true;
    }
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('');
  return false;
}

function startNamedTunnel() {
  console.log('Starting Cloudflare tunnel (investpal)...');
  const tunnel = spawn(CLOUDFLARED, ['tunnel', '--config', path.join(__dirname, 'investpal.yml'), 'run', 'investpal'], {
    stdio: 'inherit',
  });
  tunnel.on('close', (code) => {
    console.log('Cloudflare tunnel exited with code ' + code + '. Restarting in 3s...');
    setTimeout(startNamedTunnel, 3000);
  });
  console.log('\n' + '='.repeat(50));
  console.log('Tunnel URL: ' + TUNNEL_URL);
  console.log('Local URL:  http://localhost:' + PORT);
  console.log('='.repeat(50) + '\n');
}

async function main() {
  if (!(await isServerReady())) {
    await startServer();
    if (!(await waitForServer())) process.exit(1);
  }
  if (!fs.existsSync(CLOUDFLARED)) {
    console.log('cloudflared not found in project directory.');
    process.exit(1);
  }
  startNamedTunnel();
}

main();
