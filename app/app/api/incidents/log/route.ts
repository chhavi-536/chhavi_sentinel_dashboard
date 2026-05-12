import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { incidentId, fix, resolvedBy } = await request.json();
  console.log(`Logged resolution for incident ${incidentId}: ${fix} by ${resolvedBy}`);
  return NextResponse.json({ success: true });
}