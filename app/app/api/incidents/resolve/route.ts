import { NextResponse } from 'next/server';

// Shared in-memory incidents store (same as in incidents/route.ts)
const incidents: Array<{
  id: number;
  service_id: number;
  service_name: string;
  description: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}> = [];

export async function POST(request: Request) {
  const { incidentId, resolvedBy } = await request.json();

  // Note: In serverless, each request gets a fresh instance
  // So we log to console - in production this would hit a database
  console.log(`[RESOLVE] Incident ${incidentId} resolved by ${resolvedBy}`);

  return NextResponse.json({ success: true });
}