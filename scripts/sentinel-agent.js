// Sentinel Agent - Deterministic Auto-Resolver
// No external APIs. Pure string-based bug detection and fixing.

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { spawn } = require('child_process');

const dbPath = path.join(__dirname, '..', 'db', 'sentinel.db');
const docsPath = path.join(__dirname, '..', 'docs');
const servicesPath = path.join(__dirname, '..', 'services');
const logsPath = path.join(__dirname, '..', 'services', 'logs');

const db = new sqlite3.Database(dbPath);

console.log('=== Sentinel Agent (Deterministic) ===');

// ── Bug Detection ──────────────────────────────────────────
function detectBug(code) {
  if (code.includes('const x = ;')) return 'syntax_error';
  if (code.includes('expreqs')) return 'wrong_variable';
  if (code.includes('expressssss')) return 'wrong_variable';
  if (code.includes('9999')) return 'wrong_port';
  if (/PORT\s*=\s*["']\d+["']/.test(code)) return 'port_string';
  if (code.includes("status: 'BROKEN'")) return 'broken_status';
  if (code.includes('status: "BROKEN"')) return 'broken_status';
  if (code.includes('// const express')) return 'commented_express';
  if (code.includes("require('./config.json')")) return 'bad_config';
  if (code.includes('throw new Error("Port')) return 'port_error';
  return 'unknown';
}

// ── Fix Application ────────────────────────────────────────
function applyFix(code, bugType, port) {
  switch (bugType) {
    case 'syntax_error':
      return code.split('\n').filter(l => !l.includes('const x = ;')).join('\n');

    case 'wrong_variable':
      return code
        .replace(/expreqs/g, 'express')
        .replace(/expressssss/g, 'express');

    case 'wrong_port':
      return code
        .replace(/9999/g, String(port))
        .replace(/PORT\s*=\s*9999/g, `PORT = ${port}`);

    case 'port_string':
      return code.replace(
        /PORT\s*=\s*["']\d+["'];/g,
        `PORT = ${port};`
      );

    case 'broken_status':
      return code
        .replace(/status:\s*'BROKEN'/g, "status: 'OK'")
        .replace(/status:\s*"BROKEN"/g, 'status: "OK"');

    case 'commented_express':
      return code
        .replace(
          /\/\/ const express = require\('express'\);/g,
          "const express = require('express');"
        )
        .replace(
          /\/\/ const app = express\(\);/g,
          'const app = express();'
        );

    case 'bad_config':
      return code.replace(
        /const config = require\('\.\/config\.json'\);\n?/g,
        ''
      );

    case 'port_error':
      return code.replace(
        /const PORT = ["']\d+["'];\nthrow new Error\([^)]+\);/g,
        `const PORT = ${port};`
      );

    default:
      return code;
  }
}

// ── Helpers ────────────────────────────────────────────────
function getServiceErrorLog(serviceName) {
  const logPath = path.join(logsPath, `${serviceName}-error.log`);
  return fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf-8') : null;
}

function logToFile(message) {
  const logPath = path.join(docsPath, 'incident-history.log');
  const entry = `${new Date().toISOString().split('T')[0]} | ${message}\n`;
  fs.appendFileSync(logPath, entry);
}

// FIXED: syntaxCheck now uses node --check with full file path
function syntaxCheck(serviceFilePath) {
  try {
    require('child_process').execSync(
      `node --check "${serviceFilePath}"`,
      { stdio: 'pipe' }
    );
    return true;
  } catch (e) {
    console.log('  ✗ Syntax check failed:', e.stderr?.toString().trim());
    return false;
  }
}

function getServicePort(serviceName) {
  return {
    'auth-service': 3001,
    'data-service': 3002,
    'payment-service': 3003
  }[serviceName] || 3000;
}

async function updateServiceStatus(serviceName, status, msg, by) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE services SET status=?, last_checked=?, error_message=?, resolved_by=? WHERE name=?',
      [status, new Date().toISOString(), msg, by, serviceName],
      err => (err ? reject(err) : resolve())
    );
  });
}

async function writeResolutionToHistory(rec) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO resolution_history 
       (service_name, detected_at, resolved_at, bug_type, bug_description, fix_applied, fix_successful, attempts) 
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        rec.service_name,
        rec.detected_at,
        rec.resolved_at,
        rec.bug_type,
        rec.bug_description,
        rec.fix_applied,
        rec.fix_successful,
        rec.attempts
      ],
      err => (err ? reject(err) : resolve())
    );
  });
}

// ── Restart Service ────────────────────────────────────────
async function restartService(serviceName, serviceFile) {
  const port = getServicePort(serviceName);
  console.log(`  → Killing process on port ${port}...`);

  // Kill existing process on that port
  await new Promise((resolve) => {
    const netstat = require('child_process').spawn('netstat', ['-ano'], { shell: true });
    let output = '';
    netstat.stdout.on('data', d => output += d);
    netstat.on('close', () => {
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes(`:${port}`) && line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0') {
            require('child_process').spawn('taskkill', ['/F', '/PID', pid], { shell: true });
            console.log(`  → Killed PID ${pid} on port ${port}`);
          }
        }
      }
      setTimeout(resolve, 1000);
    });
  });

  // Restart service
  console.log(`  → Starting ${serviceName}...`);
  const cwd = path.join(servicesPath, serviceName);
  const proc = require('child_process').spawn('node', [serviceFile], {
    cwd,
    detached: true,
    stdio: 'ignore'
  });
  proc.unref();

  // Wait 3 seconds then check health
  await new Promise(r => setTimeout(r, 3000));

  return new Promise((resolve) => {
    const http = require('http');
    const req = http.get(`http://localhost:${port}/health`, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const ok = json.status === 'OK' || json.status === 'ok';
          console.log(`  → Health check: ${ok ? '✓ PASSED' : '✗ FAILED'} (status: ${json.status})`);
          resolve(ok);
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => {
      console.log('  → Health check: ✗ Service not responding');
      resolve(false);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// ── Main Fix Loop ──────────────────────────────────────────
async function fix(serviceName) {
  console.log(`\n→ Fixing ${serviceName}...`);
  const serviceFile = path.join(servicesPath, serviceName, 'src', 'index.js');

  if (!fs.existsSync(serviceFile)) {
    console.log('  ✗ Service file not found:', serviceFile);
    return false;
  }

  const port = getServicePort(serviceName);
  const errorLog = getServiceErrorLog(serviceName) || '';
  const maxAttempts = 3;
  let attempt = 0;

  // Make backup before touching anything
  const backupPath = serviceFile + '.broken';
  fs.copyFileSync(serviceFile, backupPath);
  console.log('  → Backup created');

  while (attempt < maxAttempts) {
    attempt++;
    const code = fs.readFileSync(serviceFile, 'utf-8');
    const bug = detectBug(code);

    console.log(`  Attempt ${attempt}/${maxAttempts} - Bug: ${bug}`);

    if (bug === 'unknown') {
      console.log('  ✓ No known bugs in code - checking if service starts...');
      const alive = await restartService(serviceName, serviceFile);
      if (alive) {
        await writeResolutionToHistory({
          service_name: serviceName,
          detected_at: new Date().toISOString(),
          resolved_at: new Date().toISOString(),
          bug_type: 'No code bug',
          bug_description: errorLog || 'Service was not responding',
          fix_applied: 'Service restarted successfully',
          fix_successful: 1,
          attempts: attempt
        });
        return true;
      }
      break;
    }

    // Apply fix
    const fixed = applyFix(code, bug, port);
    fs.writeFileSync(serviceFile, fixed);
    console.log('  ↓ Fix written for:', bug);

    // Syntax check with full file path (FIXED)
    if (!syntaxCheck(serviceFile)) {
      console.log('  ✗ Syntax check failed, restoring backup...');
      fs.copyFileSync(backupPath, serviceFile);
      if (attempt === maxAttempts) break;
      continue;
    }

    console.log('  ✓ Syntax check passed');

    // Restart and test
    const alive = await restartService(serviceName, serviceFile);
    if (alive) {
      console.log(`  ✓ ${serviceName} is responding!`);
      await writeResolutionToHistory({
        service_name: serviceName,
        detected_at: new Date().toISOString(),
        resolved_at: new Date().toISOString(),
        bug_type: bug,
        bug_description: errorLog || 'N/A',
        fix_applied: `${bug} fixed deterministically`,
        fix_successful: 1,
        attempts: attempt
      });
      logToFile(`${serviceName} | ${bug} | RESOLVED | ${bug} fixed | ${attempt} attempt(s)`);
      return true;
    } else {
      console.log('  ✗ Service still not responding, restoring backup...');
      fs.copyFileSync(backupPath, serviceFile);
      if (attempt === maxAttempts) break;
    }
  }

  // All attempts failed
  console.log(`  ✗ Failed after ${attempt} attempt(s)`);
  await writeResolutionToHistory({
    service_name: serviceName,
    detected_at: new Date().toISOString(),
    resolved_at: null,
    bug_type: 'unresolved',
    bug_description: errorLog || 'N/A',
    fix_applied: 'All deterministic fixes failed',
    fix_successful: 0,
    attempts: attempt
  });
  logToFile(`${serviceName} | unresolved | FAILED | All fixes failed | ${attempt} attempt(s)`);
  await updateServiceStatus(serviceName, 'CRITICAL', 'Fix failed', 'Sentinel Agent');
  return false;
}

// ── Entry Point ────────────────────────────────────────────
async function resolveAll() {
  db.all("SELECT name FROM services WHERE status='CRITICAL'", [], async (err, rows) => {
    if (err || !rows || rows.length === 0) {
      console.log('✓ All services healthy');
      return;
    }

    const names = rows.map(r => r.name);
    console.log(`→ Found ${names.length} critical service(s): ${names.join(', ')}`);

    for (const name of names) {
      const ok = await fix(name);
      if (ok) {
        await updateServiceStatus(name, 'HEALTHY', null, 'Sentinel Agent');
        console.log(`  ✓ ${name}: RESOLVED`);
      } else {
        console.log(`  ✗ ${name}: FAILED to resolve`);
      }
    }
  });
}

// ── Initialize DB table ────────────────────────────────────
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
`);

resolveAll();
setInterval(resolveAll, 60000);
console.log('✓ Sentinel Agent running (every 60s)');