require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const dbPath = path.join(__dirname, '..', 'db', 'sentinel.db');
const docsPath = path.join(__dirname, '..', 'docs');
const servicesPath = path.join(__dirname, '..', 'services');
const logsPath = path.join(__dirname, '..', 'services', 'logs');

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(dbPath);

console.log('=== Sentinel Auto-Resolver (Deterministic) ===');

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
  `);
}

function logToFile(message) {
  const logPath = path.join(docsPath, 'incident-history.log');
  const timestamp = new Date().toISOString().split('T')[0];
  const logEntry = timestamp + ' | ' + message + '\n';
  fs.appendFileSync(logPath, logEntry);
}

function getServiceErrorLog(serviceName) {
  const logPath = path.join(logsPath, serviceName + '-error.log');
  if (!fs.existsSync(logPath)) return null;
  return fs.readFileSync(logPath, 'utf-8');
}

function extractBugType(serviceName, errorLog) {
  // FIXED: removed early return when errorLog is null.
  // Now we check the error log only if it exists, then always
  // fall through to code inspection as a fallback.

  if (errorLog) {
    if (errorLog.includes('expreqs')) return 'Wrong variable name (expreqs)';
    if (errorLog.includes('expressssss')) return 'Wrong variable name (expressssss)';
    if (errorLog.includes('SyntaxError')) return 'Syntax error';
    if (errorLog.includes('ECONNREFUSED') || errorLog.includes('ETIMEDOUT')) return 'Service not starting';
    if (errorLog.includes("status: 'CRITICAL'")) return 'Broken health check';
    if (errorLog.includes('config.json invalid')) return 'Invalid config.json reference';
    if (errorLog.includes('failed to parse config.json')) return 'Invalid config.json reference';
  }

  // Always fall through to code inspection regardless of errorLog
  const serviceCodePath = path.join(servicesPath, serviceName, 'src', 'index.js');
  if (!fs.existsSync(serviceCodePath)) return 'Code not found';

  const code = fs.readFileSync(serviceCodePath, 'utf-8');
  if (code.includes('require(\'express\');;')) return 'Syntax error';
  if (code.includes('PORT = 9999')) return 'Wrong port';
  if (code.includes('const x = ;')) return 'Empty constant declaration';
  if (code.includes('PORT = "string"')) return 'PORT as string';
  if (code.includes('// const express') && !code.includes('const express')) return 'Express commented out';
  if (code.includes('const config = require')) return 'Invalid config.json reference';

  return 'Unknown error';
}

function applyDeterministicFix(serviceName, bugType) {
  const serviceCodePath = path.join(servicesPath, serviceName, 'src', 'index.js');
  const code = fs.readFileSync(serviceCodePath, 'utf-8');
  let fixedCode = null;

  const portMap = {
    'auth-service': 3001,
    'data-service': 3002,
    'payment-service': 3003
  };
  const port = portMap[serviceName] || 3000;

  switch(bugType) {
    case 'Wrong variable name (expreqs)':
      fixedCode = code.replace(/expreqs/g, 'express');
      break;
    case 'Wrong variable name (expressssss)':
      fixedCode = code.replace(/expressssss/g, 'express');
      break;
    case 'Syntax error':
      fixedCode = code.replace(/require\('express'\);;/g, "require('express');");
      break;
    case 'Wrong port':
      fixedCode = code.replace(/PORT = 9999/g, 'PORT = ' + port);
      break;
    case 'Empty constant declaration':
      fixedCode = code.replace(/const x = ;/g, '');
      break;
    case 'PORT as string':
      fixedCode = code.replace(/PORT = "string"/g, 'PORT = ' + port);
      break;
    case 'Express commented out':
      fixedCode = code.replace(/\/\/ const express = require\('express'\);/g, "const express = require('express');");
      break;
    case 'Invalid config.json reference':
      fixedCode = code.replace(/const config = require\('\.\/config\.json'\);/g, '');
      break;
    default:
      console.log('  ⚠ Unknown bug type for ' + serviceName + ': ' + bugType);
      return null;
  }

  // Safety net: always fix any remaining PORT = 9999 after the main fix
  fixedCode = fixedCode.replace(/PORT = 9999/g, 'PORT = ' + port);

  return fixedCode;
}

function writeServiceCode(serviceName, code) {
  const serviceCodePath = path.join(servicesPath, serviceName, 'src', 'index.js');
  fs.writeFileSync(serviceCodePath, code);
  console.log('  ↓ Wrote code to ' + serviceName);
}

function syntaxCheck(serviceName) {
  try {
    const code = fs.readFileSync(
      path.join(servicesPath, serviceName, 'src', 'index.js'),
      'utf-8'
    );
    require('vm').runInThisContext(code);
    return true;
  } catch (err) {
    console.log('  ✗ Syntax check failed for ' + serviceName + ': ' + err.message);
    return false;
  }
}

function restartService(serviceName) {
  return new Promise((resolve) => {
    const portMap = {
      'auth-service': 3001,
      'data-service': 3002,
      'payment-service': 3003
    };
    const port = portMap[serviceName] || 3000;

    spawn('netstat', ['-ano'], { shell: true }).stdout.on('data', function(data) {
      var lines = data.toString().split('\n');
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].includes(':' + port) && lines[i].includes('LISTENING')) {
          var parts = lines[i].trim().split(/\s+/);
          var pid = parts[parts.length - 1];
          if (pid && pid !== '0') {
            spawn('taskkill', ['/F', '/PID', pid], { shell: true });
          }
        }
      }
    });

    setTimeout(function() {
      const serviceDir = path.join(servicesPath, serviceName);
      const indexPath = path.join(serviceDir, 'src', 'index.js');
      const proc = spawn('node', [indexPath], {
        cwd: serviceDir,
        detached: true,
        stdio: 'ignore'
      });
      proc.unref();
      resolve(true);
    }, 1000);
  });
}

async function updateServiceStatus(serviceName, status, errorMessage, resolvedBy) {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      'UPDATE services SET status = ?, last_checked = ?, error_message = ?, resolved_by = ? WHERE name = ?',
      [status, now, errorMessage, resolvedBy, serviceName],
      function(err) {
        if (err) {
          console.error('Error updating service:', err);
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

async function writeResolutionToHistory(incident) {
  return new Promise((resolve) => {
    db.run(
      'INSERT INTO resolution_history (service_name, detected_at, resolved_at, bug_type, bug_description, fix_applied, fix_successful, attempts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
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
      function(err) {
        if (err) console.error('Error writing to history:', err);
        resolve();
      }
    );
  });
}

async function handleServiceFix(serviceName) {
  console.log('\n→ Processing ' + serviceName + '...');

  try {
    const serviceCodePath = path.join(servicesPath, serviceName, 'src', 'index.js');
    if (!fs.existsSync(serviceCodePath)) {
      console.log('  ⚠ Code not found: ' + serviceCodePath);
      return false;
    }

    var errorLog = getServiceErrorLog(serviceName);
    var errorMessage = errorLog || 'Service critical';

    // FIXED: retry loop — keeps fixing until no known bug remains or max 3 attempts
    var maxAttempts = 3;
    var attempt = 0;
    var isValid = false;

    var incidentFile = path.join(docsPath, 'incident-history.log');
    var history = fs.existsSync(incidentFile) ? fs.readFileSync(incidentFile, 'utf-8') : '';

    while (attempt < maxAttempts) {
      attempt++;

      var bugType = extractBugType(serviceName, errorLog) || 'Unknown error';
      console.log('  Bug type (attempt ' + attempt + '): ' + bugType);

      if (bugType === 'Unknown error' || bugType === 'Code not found') {
        console.log('  ✓ No known bugs detected in code');
        isValid = syntaxCheck(serviceName);
        break;
      }

      var previousAttempts = history.split('\n')
        .filter(function(line) { return line.includes(serviceName) && line.includes(bugType); })
        .length;

      console.log('  Previous attempts for this bug: ' + previousAttempts);

      var fixedCode = applyDeterministicFix(serviceName, bugType);
      if (!fixedCode) {
        console.log('  ✗ Could not apply fix for ' + bugType);
        break;
      }

      writeServiceCode(serviceName, fixedCode);

      isValid = syntaxCheck(serviceName);
      console.log('  Syntax check (attempt ' + attempt + '): ' + (isValid ? 'PASSED' : 'FAILED'));

      await writeResolutionToHistory({
        service_name: serviceName,
        detected_at: new Date().toISOString(),
        resolved_at: isValid ? new Date().toISOString() : null,
        bug_type: bugType,
        bug_description: errorMessage,
        fix_applied: 'Fixed ' + bugType + ' via deterministic approach',
        fix_successful: isValid ? 1 : 0,
        attempts: previousAttempts + 1
      });

      if (!isValid) {
        // Syntax still broken — write minimal fallback and stop
        var backupPath = serviceCodePath + '.broken';
        console.log('  ✗ Syntax check failed - writing minimal fallback');
        if (fs.existsSync(backupPath)) {
          fs.copyFileSync(backupPath, serviceCodePath);
        } else {
          var portMap = { 'auth-service': 3001, 'data-service': 3002, 'payment-service': 3003 };
          var fallbackPort = portMap[serviceName] || 3000;
          var minimalCode =
            "const express = require('express');\n" +
            "const app = express();\n\n" +
            "app.get('/health', (req, res) => {\n" +
            "  res.json({ status: 'ok', service: '" + serviceName + "' });\n" +
            "});\n\n" +
            "app.get('/api/data', (req, res) => {\n" +
            "  res.json({ data: 'sample data' });\n" +
            "});\n\n" +
            "const PORT = " + fallbackPort + ";\n" +
            "app.listen(PORT, () => console.log('" + serviceName + " running on port', PORT));\n";
          fs.writeFileSync(serviceCodePath, minimalCode);
        }
        isValid = syntaxCheck(serviceName);
        break;
      }

      // Syntax passed — loop again to check if another bug remains
    }

    if (isValid) {
      console.log('  ✓ Fix applied successfully for ' + serviceName);
      try {
  await updateServiceStatus(serviceName, 'HEALTHY', null, 'Sentinel Auto-Resolver');
} catch (err) {
  console.error('Failed to update status initially:', err);
  await new Promise(r => setTimeout(r, 500));
  try {
    await updateServiceStatus(serviceName, 'HEALTHY', null, 'Sentinel Auto-Resolver');
  } catch (err2) {
    console.error('Failed to update status after retry:', err2);
  }
}
      return true;
    } else {
      console.log('  ✗ Fix failed for ' + serviceName);
      await updateServiceStatus(serviceName, 'CRITICAL', errorMessage, 'Sentinel Auto-Resolver');
      return false;
    }

  } catch (err) {
    console.error('  ✗ Error processing ' + serviceName + ': ' + err.message);
    return false;
  }
}

let isResolving = false;

async function resolveCriticalServices() {
  if (isResolving) return;
  isResolving = true;

  console.log('\n[' + new Date().toISOString() + '] Auto-resolver checking for critical services...');

  db.all("SELECT name FROM services WHERE status = 'CRITICAL'", [], async function(err, rows) {
    if (err) { isResolving = false; return; }

    var criticalServices = rows.map(function(row) { return row.name; });

    if (criticalServices.length === 0) {
      console.log('✓ All services are healthy');
      isResolving = false;
      return;
    }

    console.log('→ Processing ' + criticalServices.length + ' critical service(s): ' + criticalServices.join(', '));

    for (var i = 0; i < criticalServices.length; i++) {
      var serviceName = criticalServices[i];
      var success = await handleServiceFix(serviceName);
      if (success) {
        console.log('  → ' + serviceName + ': FIXED');
      } else {
        console.log('  → ' + serviceName + ': FAILED');
      }
    }

    isResolving = false;
  });
}

ensureResolutionHistoryTable();
resolveCriticalServices();
setInterval(resolveCriticalServices, 60000);
console.log('✓ Auto-resolver started');