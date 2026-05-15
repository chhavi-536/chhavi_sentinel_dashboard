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
const sentinelAgentScript = path.join(__dirname, 'sentinel-agent.js');

let statusProcess = null;
let agentProcess = null;

function startUpdateStatus() {
  console.log('[START] Running update-status.js every 45 seconds...');
  statusProcess = spawn('node', [updateStatusScript], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });

  statusProcess.on('error', (err) => {
    console.error('[ERROR] update-status.js crashed: ' + err.message);
  });
}

function startSentinelAgent() {
  console.log('[START] Running sentinel-agent.js every 60 seconds...');
  agentProcess = spawn('node', [sentinelAgentScript], {
    cwd: path.join(__dirname, '..'),
    detached: true,
    stdio: 'ignore'
  });
  agentProcess.unref();
}

startUpdateStatus();
startSentinelAgent();

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║  All systems running:                                    ║');
console.log('║  • update-status.js  - checks services every 45s         ║');
console.log('║  • sentinel-agent.js  - fixes critical services every 60s║');
console.log('║                                                          ║');
console.log('║  Press Ctrl+C to stop                                    ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

process.on('SIGINT', () => {
  console.log('\n[SHUTDOWN] Stopping all Sentinel processes...');
  if (statusProcess) statusProcess.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[SHUTDOWN] Stopping all Sentinel processes...');
  if (statusProcess) statusProcess.kill();
  process.exit(0);
});