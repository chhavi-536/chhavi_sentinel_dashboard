const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'db', 'sentinel.db');

// Delete old database
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log('Old database deleted!');
}

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    status TEXT DEFAULT 'HEALTHY',
    last_checked TEXT,
    error_message TEXT,
    resolved_by TEXT
  )`);

  db.run(`CREATE TABLE incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id INTEGER,
    service_name TEXT,
    status TEXT,
    error_message TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT
  )`);

  db.run(`CREATE TABLE resolution_history (
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
  )`);

  db.run(`INSERT INTO services (name, status) VALUES ('auth-service', 'HEALTHY')`);
  db.run(`INSERT INTO services (name, status) VALUES ('data-service', 'HEALTHY')`);
  db.run(`INSERT INTO services (name, status) VALUES ('payment-service', 'HEALTHY')`);

  console.log('✅ Fresh database created!');
  console.log('✅ All 3 services added as HEALTHY!');
  console.log('✅ Ready to run start-sentinel.js');
});

setTimeout(() => db.close(), 1000);