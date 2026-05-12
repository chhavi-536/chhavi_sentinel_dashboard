import { NextResponse } from 'next/server';
import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), '..', 'db', 'sentinel.db');

export async function GET() {
  return new Promise((resolve) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        resolve(NextResponse.json({ error: 'Database not accessible' }, { status: 500 }));
        return;
      }

      db.all('SELECT id, name, status, last_checked as last_checked, error_message as error_message, resolved_by FROM services', [], (err, rows) => {
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

export async function POST(request: Request) {
  const { name, status, errorMessage, resolvedBy } = await request.json();

  return new Promise((resolve) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
      if (err) {
        resolve(NextResponse.json({ error: 'Database not accessible' }, { status: 500 }));
        return;
      }

      const now = new Date().toISOString();
      const stmt = db.prepare(`
        UPDATE services
        SET status = ?, last_checked = ?, error_message = ?, resolved_by = ?
        WHERE name = ?
      `);
      stmt.run(status, now, errorMessage || null, resolvedBy || null, name, (err: Error | null) => {
        db.close();
        if (err) {
          resolve(NextResponse.json({ error: 'Failed to update database' }, { status: 500 }));
          return;
        }
        resolve(NextResponse.json({ success: true }));
      });
      stmt.finalize();
    });
  });
}