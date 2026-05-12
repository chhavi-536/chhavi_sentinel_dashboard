const fs = require('fs');
const path = require('path');

const services = ['auth-service', 'data-service', 'payment-service'];
const bugs = ['wrong-port', 'syntax-error'];

const service = services[Math.floor(Math.random() * services.length)];
const bug = bugs[Math.floor(Math.random() * bugs.length)];

const srcPath = path.join(__dirname, '..', 'services', service, 'src', 'index.js');

console.log(`🎲 Chaos Monkey attacking: ${service}`);
console.log(`🐛 Bug type: ${bug}`);

let brokenCode = '';
const port = service === 'auth-service' ? 3001 : service === 'data-service' ? 3002 : 3003;

switch (bug) {
  case 'wrong-port':
    brokenCode = `const express = require('express');
const app = express();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: '${service}' });
});

app.get('/api/data', (req, res) => {
  res.json({ data: 'sample data' });
});

const PORT = 9999;
app.listen(PORT, () => console.log('${service} running on port', PORT));`;
    break;

  case 'syntax-error':
    brokenCode = `const express = require('express');;
const app = express();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: '${service}' });
});

app.get('/api/data', (req, res) => {
  res.json({ data: 'sample data' });
});

const PORT = process.env.PORT || ${port};
app.listen(PORT, () => console.log('${service} running on port', PORT));`;
    break;
}

fs.writeFileSync(srcPath, brokenCode);
console.log(`✅ Injected ${bug} into ${service}`);

console.log(`\n⚠️  Restart the service to pick up the changes!`);
console.log(`   Run: node scripts/start-sentinel.js`);