import { NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), '..', 'db', 'sentinel.db');

export async function GET(): Promise<NextResponse> {
  return new Promise<NextResponse>((resolve) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        resolve(NextResponse.json({ error: 'Database not accessible' }, { status: 500 }));
        return;
      }

      db.all('SELECT * FROM resolution_history ORDER BY detected_at DESC', [], (err, rows) => {
        db.close();
        if (err) {
          resolve(NextResponse.json({ error: 'Failed to query database' }, { status: 500 }));
          return;
        }
        resolve(NextResponse.json(rows || []));
      });
    });
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const { incidentId, fixApplied, success } = await request.json();

  return new Promise<NextResponse>((resolve) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
      if (err) {
        resolve(NextResponse.json({ error: 'Database not accessible' }, { status: 500 }));
        return;
      }

      const now = new Date().toISOString();
      const stmt = db.prepare(`
        INSERT INTO resolution_history (service_name, detected_at, resolved_at, bug_type, bug_description, fix_applied, fix_successful, attempts)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        `service-${incidentId}`,
        now,
        now,
        'manual',
        'Manual resolution',
        fixApplied,
        success ? 1 : 0,
        1,
        (err: Error | null) => {
          db.close();
          if (err) {
            resolve(NextResponse.json({ error: 'Failed to insert' }, { status: 500 }));
            return;
          }
          resolve(NextResponse.json({ success: true }));
        }
      );
      stmt.finalize();
    });
  });
}