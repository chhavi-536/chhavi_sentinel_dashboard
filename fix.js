const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('db/sentinel.db');
db.run("UPDATE services SET status='HEALTHY', error_message=null WHERE name='payment-service'", function(err) {
  if (err) console.error(err);
  else console.log('Done:', this.changes, 'rows updated');
  db.close();
});