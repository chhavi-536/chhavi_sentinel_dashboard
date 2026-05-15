const Database = require('better-sqlite3');

const db = new Database('db/sentinel.db');

db.prepare('DELETE FROM resolution_history').run();
db.prepare('DELETE FROM incidents').run();

db.prepare(`
UPDATE services
SET status = 'HEALTHY',
    error_message = NULL,
    resolved_by = NULL
`).run();

console.log('Database cleared!');

db.close();