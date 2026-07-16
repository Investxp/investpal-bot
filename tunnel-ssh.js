const { spawn } = require('child_process');
const http = require('http');

const PORT = 3005;

function isServerReady() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${PORT}/`, (res) => resolve(true));
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

async function main() {
  console.log('Checking if server is running on port ' + PORT + '...');
  if (!(await isServerReady())) {
    console.log('Server not running. Start it first with: npm run prod');
    process.exit(1);
  }
  console.log('Server is running. Starting SSH tunnel via localhost.run...');
  console.log('(Press Ctrl+C to stop)\n');

  const ssh = spawn('ssh', [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ServerAliveInterval=30',
    '-R', '80:localhost:' + PORT,
    'nokey@localhost.run'
  ], { stdio: 'inherit' });

  ssh.on('close', (code) => {
    console.log('SSH tunnel exited with code ' + code);
    process.exit(code);
  });
}

main();
