const { spawn } = require('child_process');
const path = require('path');

console.log('Starting all Sentinel services...\n');

const services = [
  { name: 'auth-service', port: 3001 },
  { name: 'data-service', port: 3002 },
  { name: 'payment-service', port: 3003 },
];

const processes = [];

services.forEach(svc => {
  const servicePath = path.join(__dirname, '..', 'services', svc.name, 'src', 'index.js');
  const cwd = path.join(__dirname, '..', 'services', svc.name);

  const proc = spawn('node', [servicePath], {
    cwd,
    detached: true,
    stdio: 'ignore'
  });

  proc.unref();
  processes.push({ name: svc.name, port: svc.port, proc });

  console.log(`  ✓ Started ${svc.name} on port ${svc.port}`);
});

console.log('\nAll services started!\n');