import { spawn } from 'node:child_process';

const processes = [
  spawn('node', ['server/server.js'], { stdio: 'inherit' }),
  spawn('node', ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }),
];

function shutdown(signal) {
  for (const child of processes) {
    if (!child.killed) child.kill(signal);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

for (const child of processes) {
  child.on('exit', (code) => {
    if (code && code !== 0) process.exit(code);
  });
}
