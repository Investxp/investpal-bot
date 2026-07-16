const { spawn } = require('child_process');

const PORT = 3005;
const isProd = process.argv.includes('--prod');

const cmd = isProd ? 'npm run prod' : 'npm run dev';
const label = isProd ? 'production' : 'development';

console.log(`Starting Next.js ${label} server on port ${PORT}...`);
const nextProcess = spawn('cmd.exe', ['/c', cmd], {
  stdio: 'inherit',
});

nextProcess.on('close', (code) => {
  console.log(`Next.js process exited with code ${code}`);
  process.exit(code);
});
