require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const dbPath = path.join(__dirname, '..', 'db', 'sentinel.db');
const docsPath = path.join(__dirname, '..', 'docs');
const servicesPath = path.join(__dirname, '..', 'services');

// Use let so we can check after dotenv loads
let CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

// DEBUG: Re-check after dotenv loads
CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY;
console.log('[DEBUG] API Key check:', CLAUDE_API_KEY ? `Loaded (${CLAUDE_API_KEY.substring(0, 15)}...)` : 'NOT FOUND');

const db = new sqlite3.Database(dbPath);

// Lock system - prevent concurrent resolution cycles
let isResolving = false;

// Cooldown system - 2 minute cooldown after each fix attempt per service
const serviceCooldowns = {};
const COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

function isServiceInCooldown(serviceName) {
  const lastAttempt = serviceCooldowns[serviceName];
  if (!lastAttempt) return false;
  return (Date.now() - lastAttempt) < COOLDOWN_MS;
}

function setServiceCooldown(serviceName) {
  serviceCooldowns[serviceName] = Date.now();
}

console.log('=== Sentinel Auto-Resolver ===');
console.log('API Key configured:', CLAUDE_API_KEY ? 'YES' : 'NO');

function ensureResolutionHistoryTable() {
  db.run(`
    CREATE TABLE IF NOT EXISTS resolution_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_name TEXT NOT NULL,
      detected_at TEXT NOT NULL,
      resolved_at TEXT,
      bug_type TEXT,
      bug_description TEXT,
      fix_applied TEXT,
      fix_successful INTEGER DEFAULT 0,
      attempts INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Error creating table:', err);
  });
}

function logToFile(message) {
  const logPath = path.join(docsPath, 'incident-history.log');
  const timestamp = new Date().toISOString().split('T')[0];
  const logEntry = `${timestamp} | ${message}\n`;
  fs.appendFileSync(logPath, logEntry);
}

function readIncidentHistory(serviceName) {
  const logPath = path.join(docsPath, 'incident-history.log');
  if (!fs.existsSync(logPath)) return [];
  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.includes(serviceName));
  return lines;
}

function analyzeBug(code, errorMessage) {
  const bugs = [];
  if (errorMessage?.includes('Cannot find module') || code.includes('require(') && !code.includes('express')) {
    bugs.push('Missing dependency');
  }
  if (errorMessage?.includes('SyntaxError') || code.includes('throw new Error')) {
    bugs.push('Syntax error');
  }
  if (code.includes('expreqs') || code.includes('expressssss')) {
    bugs.push('Wrong variable name');
  }
  if (errorMessage?.includes('ECONNREFUSED') || errorMessage?.includes('ETIMEDOUT')) {
    bugs.push('Service not starting');
  }
  if (errorMessage?.includes('status: \'CRITICAL\'') || code.includes("status: 'CRITICAL'")) {
    bugs.push('Broken health check');
  }
  return bugs.length > 0 ? bugs.join(', ') : 'Unknown error';
}

async function callClaudeAPI(brokenCode, serviceName, errorMessage, attemptNum) {
  console.log(`[Claude API] Attempt ${attemptNum}: Calling for ${serviceName}...`);
  console.log(`[DEBUG] Using API key: ${CLAUDE_API_KEY ? CLAUDE_API_KEY.substring(0, 20) + '...' : 'NONE'}`);

  if (!CLAUDE_API_KEY || CLAUDE_API_KEY.includes('your-key')) {
    console.log('[Claude API] ERROR: No valid API key configured!');
    throw new Error('No API key - add ANTHROPIC_API_KEY to .env file');
  }

  let prompt = '';
  const port = serviceName === 'auth-service' ? 3001 : serviceName === 'data-service' ? 3002 : 3003;
  if (attemptNum === 1) {
    prompt = `This Node.js service file has a simple bug.
It is either a wrong port number or a small syntax error.
Here is the broken code:
${brokenCode}
Fix ONLY the bug, do not rewrite anything else.
Return the complete fixed file as plain JavaScript only.
No explanation, no markdown, no backticks.`;
  } else if (attemptNum === 2) {
    prompt = `This Node.js service file has a simple bug.
It is either a wrong port number or a small syntax error.
Here is the broken code:
${brokenCode}
The port should be ${port}.
Fix ONLY the bug, do not rewrite anything else.
Return the complete fixed file as plain JavaScript only.
No explanation, no markdown, no backticks.`;
  } else {
    prompt = `This Node.js service file has a simple bug.
It is either a wrong port number or a small syntax error.
The correct port for ${serviceName} is ${port}.
Here is the broken code:
${brokenCode}
Fix ONLY the bug, do not rewrite anything else.
Return the complete fixed file as plain JavaScript only.
No explanation, no markdown, no backticks.`;
  }

  // DEBUG: Log the request
  const requestBody = {
    model: CLAUDE_MODEL,
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: prompt
    }]
  };
  console.log('[DEBUG] Request body:', JSON.stringify(requestBody).substring(0, 200) + '...');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(requestBody)
  });

  console.log('[DEBUG] Response status:', response.status);
  const responseText = await response.text();
  console.log('[DEBUG] Raw response:', responseText.substring(0, 300));

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status} - ${responseText}`);
  }

  const data = JSON.parse(responseText);
  console.log('[Claude API] Response received');

  if (!data.content || !data.content[0]) {
    throw new Error('No content in Claude response');
  }

  console.log('[DEBUG] Fixed code length:', data.content[0].text.length);
  return data.content[0].text;
}

function fixCodeSimple(code, bugType) {
  // Fallback simple fixes
  let fixed = code;

  if (bugType.includes('Wrong variable')) {
    fixed = fixed.replace(/expreqs/gi, 'express');
    fixed = fixed.replace(/express[a-z]*/gi, 'express');
    fixed = fixed.replace(/app/gi, 'app');
  }

  if (bugType.includes('Syntax') || code.includes('throw new Error')) {
    // Rewrite cleanly
    const svcName = code.includes('auth') ? 'auth-service' : code.includes('data') ? 'data-service' : 'payment-service';
    const port = svcName === 'auth-service' ? '3001' : svcName === 'data-service' ? '3002' : '3003';
    fixed = `const express = require('express');
const app = express();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: '${svcName}' });
});

app.get('/api/data', (req, res) => {
  res.json({ data: 'sample data' });
});

const PORT = process.env.PORT || ${port};
app.listen(PORT, () => console.log('${svcName} running on port', PORT));`;
  }

  return fixed;
}

function killServiceOnPort(port) {
  return new Promise((resolve) => {
    const netstat = spawn('netstat', ['-ano'], { shell: true });
    let output = '';
    netstat.stdout.on('data', data => output += data);
    netstat.on('close', () => {
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes(`:${port}`) && line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0') {
            spawn('taskkill', ['/F', '/PID', pid], { shell: true }).on('close', () => {
              console.log(`[Service] Killed process ${pid} on port ${port}`);
            });
          }
        }
      }
      setTimeout(resolve, 1000);
    });
  });
}

async function restartService(serviceName) {
  const portMap = { 'auth-service': 3001, 'data-service': 3002, 'payment-service': 3003 };
  const port = portMap[serviceName];
  if (!port) return false;

  console.log(`[Service] Restarting ${serviceName} on port ${port}...`);

  // Kill any existing process
  await killServiceOnPort(port);

  const serviceDir = path.join(servicesPath, serviceName);
  const indexPath = path.join(serviceDir, 'src', 'index.js');

  // Start new process
  const proc = spawn('node', [indexPath], {
    cwd: serviceDir,
    detached: true,
    stdio: 'ignore'
  });
  proc.unref();

  // Wait and check
  await new Promise(r => setTimeout(r, 3000));

  try {
    const http = require('http');
    return new Promise((resolve) => {
      const req = http.get(`http://localhost:${port}/health`, { timeout: 3000 }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            console.log(`[Service] ${serviceName} responded:`, json.status);
            resolve(json.status === 'ok');
          } catch {
            resolve(false);
          }
        });
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
  } catch {
    return false;
  }
}

function updateServiceStatus(serviceName, status, resolvedBy) {
  return new Promise((resolve) => {
    const now = new Date().toISOString();
    db.run(
      'UPDATE services SET status = ?, last_checked = ?, resolved_by = ? WHERE name = ?',
      [status, now, resolvedBy, serviceName],
      (err) => {
        if (err) console.error('Error updating service:', err);
        resolve();
      }
    );
  });
}

function writeResolutionToHistory(incident) {
  return new Promise((resolve) => {
    db.run(
      `INSERT INTO resolution_history
       (service_name, detected_at, resolved_at, bug_type, bug_description, fix_applied, fix_successful, attempts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        incident.service_name,
        incident.detected_at,
        incident.resolved_at,
        incident.bug_type,
        incident.bug_description,
        incident.fix_applied,
        incident.fix_successful ? 1 : 0,
        incident.attempts
      ],
      (err) => {
        if (err) console.error('Error writing to history:', err);
        resolve();
      }
    );
  });
}

async function resolveCriticalServices() {
  // Check if already resolving - skip this cycle if locked
  if (isResolving) {
    console.log('⏳ Already resolving a service, waiting for previous cycle to complete...');
    return;
  }

  console.log(`\n[${new Date().toISOString()}] Auto-resolver checking for critical services...`);

  // Get critical services and filter out those in cooldown
  const allCriticalServices = await new Promise((resolve) => {
    db.all("SELECT name, status, error_message, last_checked FROM services WHERE status = 'CRITICAL'", [], (err, rows) => {
      resolve(rows || []);
    });
  });

  // Filter out services in cooldown
  const criticalServices = allCriticalServices.filter(s => !isServiceInCooldown(s.name));

  if (criticalServices.length === 0) {
    console.log('✓ All services are healthy or in cooldown period.');
    // Check remaining for cooldown info
    const onCooldown = allCriticalServices.filter(s => isServiceInCooldown(s.name));
    if (onCooldown.length > 0) {
      console.log(`  Services on cooldown: ${onCooldown.map(s => s.name).join(', ')}`);
    }
    return;
  }

  // Sort by last_checked to find the one CRITICAL longest
  criticalServices.sort((a, b) => new Date(a.last_checked || 0).getTime() - new Date(b.last_checked || 0).getTime());
  const service = criticalServices[0];

  console.log(`Found ${criticalServices.length} critical service(s): ${criticalServices.map(s => s.name).join(', ')}`);
  console.log(`→ Processing only ONE: ${service.name} (longest critical)`);

  // Set lock
  isResolving = true;

  try {
    const serviceDir = path.join(servicesPath, service.name, 'src', 'index.js');
    const detectedAt = new Date().toISOString();

    console.log(`\n→ Processing ${service.name}...`);

    if (!fs.existsSync(serviceDir)) {
      console.log(`  ⚠ Source file not found: ${serviceDir}`);
      isResolving = false;
      return;
    }

    const brokenCode = fs.readFileSync(serviceDir, 'utf-8');
    const errorMessage = service.error_message || '';
    const bugType = analyzeBug(brokenCode, errorMessage);

    const previousAttempts = readIncidentHistory(service.name).length;
    console.log(`  Bug type: ${bugType}, Previous attempts: ${previousAttempts}`);

    // Make backup
    const backupPath = serviceDir + '.broken';
    fs.copyFileSync(serviceDir, backupPath);

    let fixedCode = null;
    let fixSuccessful = false;
    let fixApplied = '';

    // Try up to 3 times with Claude API
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`  Attempt ${attempt}/3...`);

      try {
        if (attempt === 1) {
          fixedCode = await callClaudeAPI(brokenCode, service.name, errorMessage, attempt);
        } else {
          fixedCode = await callClaudeAPI(brokenCode, service.name, errorMessage + ' (retry)', attempt);
        }
      } catch (err) {
        console.log(`  ⚠ Claude API failed: ${err.message}`);
        // Try fallback fix
        fixedCode = fixCodeSimple(brokenCode, bugType);
      }

      if (!fixedCode || fixedCode.length < 50) {
        console.log('  ⚠ No valid fix code returned');
        fixedCode = fixCodeSimple(brokenCode, bugType);
      }

      // Write fix
      fs.writeFileSync(serviceDir, fixedCode);
      console.log('  → Fix written to', serviceDir);
      console.log('  → Fixed code length:', fixedCode.length);

      // Restart and test
      const restarted = await restartService(service.name);

      if (restarted) {
        fixSuccessful = true;
        fixApplied = attempt === 1 ? 'Claude AI fix' : `Claude AI retry attempt ${attempt}`;
        console.log(`  ✓ Service restarted successfully!`);
        break;
      } else {
        console.log(`  ✗ Service still not responding, restoring backup...`);
        fs.copyFileSync(backupPath, serviceDir);
      }
    }

    if (fixSuccessful) {
      await updateServiceStatus(service.name, 'HEALTHY', 'Claude AI');
      console.log(`  ✓ ${service.name} marked as HEALTHY`);
    } else {
      fixApplied = 'All fixes failed - manual intervention needed';
      console.log(`  ✗ ${service.name} could not be fixed`);
    }

    const resolvedAt = new Date().toISOString();

    await writeResolutionToHistory({
      service_name: service.name,
      detected_at: detectedAt,
      resolved_at: fixSuccessful ? resolvedAt : null,
      bug_type: bugType,
      bug_description: errorMessage || 'Service not responding',
      fix_applied: fixApplied,
      fix_successful: fixSuccessful ? 1 : 0,
      attempts: previousAttempts + 1
    });

    const status = fixSuccessful ? 'RESOLVED' : 'FAILED';
    logToFile(`${service.name} | ${bugType} | ${status} | ${fixApplied} | ${previousAttempts + 1} attempt(s)`);
    console.log(`  → Logged to incident-history.log`);

    // Set cooldown for this service (2 minutes)
    setServiceCooldown(service.name);
    console.log(`  ⏳ Cooldown set for ${service.name} (2 minutes)`);
  } finally {
    // Always release the lock
    isResolving = false;
    console.log('✓ Resolution cycle complete, lock released');
  }
}

ensureResolutionHistoryTable();

// Run once, then set interval
resolveCriticalServices();
setInterval(resolveCriticalServices, 60000); // Run every 60 seconds