const { spawn } = require('child_process');
const path = require('path');

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║           SENTINEL AUTONOMOUS SYSTEM                     ║');
console.log('║  Starting all services in parallel...                   ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

console.log('[STEP 1] Starting microservices...\n');

const services = [
  { name: 'auth-service', port: 3001 },
  { name: 'data-service', port: 3002 },
  { name: 'payment-service', port: 3003 },
];

services.forEach(svc => {
  const servicePath = path.join(__dirname, '..', 'services', svc.name, 'src', 'index.js');
  const cwd = path.join(__dirname, '..', 'services', svc.name);

  spawn('node', [servicePath], {
    cwd,
    detached: true,
    stdio: 'ignore'
  }).unref();

  console.log(`  ✓ Started ${svc.name} on port ${svc.port}`);
});

console.log('\n[STEP 2] Starting monitoring agents...\n');

const updateStatusScript = path.join(__dirname, 'update-status.js');
const autoResolverScript = path.join(__dirname, 'auto-resolver.js');

let statusProcess = null;
let resolverProcess = null;
let restartCount = 0;
const MAX_RESTARTS = 5;

function startUpdateStatus() {
  console.log(`[START] Running update-status.js every 45 seconds...`);
  statusProcess = spawn('node', [updateStatusScript], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });

  statusProcess.on('error', (err) => {
    console.error(`[ERROR] update-status.js crashed: ${err.message}`);
    if (restartCount < MAX_RESTARTS) {
      restartCount++;
      console.log(`[RESTART] Restarting update-status.js (attempt ${restartCount})...`);
      setTimeout(startUpdateStatus, 2000);
    }
  });

  statusProcess.on('exit', (code) => {
    console.log(`[EXIT] update-status.js exited with code ${code}`);
    if (restartCount < MAX_RESTARTS && code !== 0) {
      restartCount++;
      console.log(`[RESTART] Restarting update-status.js (attempt ${restartCount})...`);
      setTimeout(startUpdateStatus, 2000);
    }
  });
}

function startAutoResolver() {
  console.log(`[START] Running auto-resolver.js every 60 seconds...`);
  resolverProcess = spawn('node', [autoResolverScript], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });

  resolverProcess.on('error', (err) => {
    console.error(`[ERROR] auto-resolver.js crashed: ${err.message}`);
  });

  resolverProcess.on('exit', (code) => {
    console.log(`[EXIT] auto-resolver.js exited with code ${code}`);
  });
}

startUpdateStatus();
startAutoResolver();

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║  All systems running:                                    ║');
console.log('║  • update-status.js  - checks services every 45s         ║');
console.log('║  • auto-resolver.js  - fixes critical services every 60s║');
console.log('║                                                          ║');
console.log('║  Press Ctrl+C to stop                                    ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

process.on('SIGINT', () => {
  console.log('\n[SHUTDOWN] Stopping all Sentinel processes...');
  if (statusProcess) statusProcess.kill();
  if (resolverProcess) resolverProcess.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[SHUTDOWN] Stopping all Sentinel processes...');
  if (statusProcess) statusProcess.kill();
  if (resolverProcess) resolverProcess.kill();
  process.exit(0);
});