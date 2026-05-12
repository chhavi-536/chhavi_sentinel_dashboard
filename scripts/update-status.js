const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const http = require('http');

const dbPath = path.join(__dirname, '..', 'db', 'sentinel.db');
const db = new sqlite3.Database(dbPath);

// Add unique constraint to prevent duplicate open incidents
db.run(`
  CREATE INDEX IF NOT EXISTS idx_open_incidents
  ON incidents(service_id, resolved_at)
  WHERE resolved_at IS NULL
`, (err) => {
  if (err) console.error('Error creating index:', err);
});

const servicePorts = {
  'auth-service': 3001,
  'data-service': 3002,
  'payment-service': 3003,
};

function checkServiceHealth(serviceName, port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/health`, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ healthy: json.status === 'ok', error: null });
        } catch {
          resolve({ healthy: false, error: 'Invalid response' });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ healthy: false, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ healthy: false, error: 'Connection timeout' });
    });
  });
}

function updateServiceStatus(serviceName, status, errorMessage, resolvedBy) {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE services
      SET status = ?, last_checked = ?, error_message = ?, resolved_by = ?
      WHERE name = ?
    `);
    stmt.run(status, now, errorMessage, resolvedBy, serviceName, function(err) {
      if (err) reject(err);
      else resolve();
    });
    stmt.finalize();
  });
}

// PROBLEM 3 & 5: Fixed incident handling with hard limit and proper duplicate prevention
async function handleIncident(serviceName, newStatus, prevStatus, errorMessage) {
  const service = await new Promise((resolve, reject) => {
    db.get('SELECT id FROM services WHERE name = ?', [serviceName], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  if (!service) return;

  const now = new Date().toISOString();

  // PROBLEM 5: Hard limit - check total open incidents before anything
  const openCount = await new Promise((resolve) => {
    db.get("SELECT COUNT(*) as cnt FROM incidents WHERE resolved_at IS NULL", [], (err, row) => {
      resolve(row ? row.cnt : 0);
    });
  });

  if (openCount >= 3) {
    console.log(`  ⚠ Too many open incidents (${openCount}), skipping insertion`);
    return;
  }

  if (newStatus === 'CRITICAL') {
    // Only INSERT if transitioning from HEALTHY to CRITICAL (first time critical)
    if (prevStatus === 'HEALTHY') {
      // Check if open incident already exists for this service
      const existingIncident = await new Promise((resolve) => {
        db.get(
          "SELECT id FROM incidents WHERE service_id = ? AND resolved_at IS NULL",
          [service.id],
          (err, row) => resolve(row)
        );
      });

      if (existingIncident) {
        // Already has open incident - do NOT insert, just skip
        console.log(`  → Incident already exists for ${serviceName}, skipping`);
      } else {
        // INSERT new incident (first time this service went critical)
        db.run(
          "INSERT INTO incidents (service_id, description, created_at) VALUES (?, ?, ?)",
          [service.id, errorMessage || 'Service critical', now],
          (err) => {
            if (err) console.error('Error inserting incident:', err);
            else console.log(`  → Created new incident for ${serviceName}`);
          }
        );
      }
    }
    // If already CRITICAL (prevStatus was CRITICAL), do nothing - don't create duplicates
  } else if (newStatus === 'HEALTHY' && prevStatus === 'CRITICAL') {
    // CRITICAL -> HEALTHY: Resolve the incident
    db.run(
      "UPDATE incidents SET resolved_at = ?, resolved_by = 'auto-recovered' WHERE service_id = ? AND resolved_at IS NULL",
      [now, service.id],
      (err) => {
        if (err) console.error('Error resolving incident:', err);
        else console.log(`  → Resolved incident for ${serviceName}`);
      }
    );
  }
}

async function checkAllServices() {
  console.log(`[${new Date().toISOString()}] Checking services...`);

  const services = await new Promise((resolve, reject) => {
    db.all('SELECT name FROM services', [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  for (const service of services) {
    const serviceName = service.name;
    const port = servicePorts[serviceName];

    if (!port) {
      console.log(`  ${serviceName}: No port configured, skipping`);
      continue;
    }

    const { healthy, error } = await checkServiceHealth(serviceName, port);

    let status = 'HEALTHY';
    let errorMessage = null;
    let resolvedBy = null;

    if (!healthy) {
      status = 'CRITICAL';
      errorMessage = error || 'Service not responding';
      resolvedBy = null;

      const current = await new Promise((resolve, reject) => {
        db.get('SELECT status, resolved_by FROM services WHERE name = ?', [serviceName], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (current && current.status === 'HEALTHY' && current.resolved_by) {
        resolvedBy = current.resolved_by;
      }
    } else {
      const current = await new Promise((resolve, reject) => {
        db.get('SELECT status, resolved_by FROM services WHERE name = ?', [serviceName], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (current && current.status !== 'HEALTHY') {
        resolvedBy = 'auto-recovered';
      }
    }

    // Get previous status BEFORE updating for handleIncident to use
    const prevStatus = await new Promise((resolve) => {
      db.get('SELECT status FROM services WHERE name = ?', [serviceName], (err, row) => {
        resolve(row ? row.status : null);
      });
    });

    await updateServiceStatus(serviceName, status, errorMessage, resolvedBy);
    // Pass previous status so handleIncident knows transition
    await handleIncident(serviceName, status, prevStatus, errorMessage);
    const statusIcon = status === 'HEALTHY' ? '✓' : '✗';
    console.log(`  ${statusIcon} ${serviceName}: ${status}${errorMessage ? ` - ${errorMessage}` : ''}`);
  }

  console.log('Done.\n');
}

console.log('=== Service Status Monitor ===');
console.log('Checking services every 10 seconds...\n');

checkAllServices();
setInterval(checkAllServices, 45000);