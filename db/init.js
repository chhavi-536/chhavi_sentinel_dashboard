const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'sentinel.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Services table
  db.run(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'HEALTHY',
      last_checked TEXT,
      error_message TEXT,
      resolved_by TEXT
    )
  `);

  // Incidents table
  db.run(`
    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      resolved_by TEXT,
      FOREIGN KEY (service_id) REFERENCES services(id)
    )
  `);

  // Resolution history table
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

  // Initialize services
  const services = ['auth-service', 'data-service', 'payment-service'];
  const stmt = db.prepare('INSERT OR IGNORE INTO services (name, status) VALUES (?, ?)');

  services.forEach(svc => {
    stmt.run(svc, 'HEALTHY');
  });

  stmt.finalize();

  console.log('Database initialized at', dbPath);
});

db.close();