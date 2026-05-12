import { NextResponse } from 'next/server';

const services: Array<{
  id: number;
  name: string;
  status: string;
  last_checked: string | null;
  error_message: string | null;
  resolved_by: string | null;
}> = [
  { id: 1, name: 'auth-service', status: 'HEALTHY', last_checked: null, error_message: null, resolved_by: null },
  { id: 2, name: 'data-service', status: 'HEALTHY', last_checked: null, error_message: null, resolved_by: null },
  { id: 3, name: 'payment-service', status: 'HEALTHY', last_checked: null, error_message: null, resolved_by: null },
];

export async function POST(request: Request) {
  const { name, status, errorMessage, resolvedBy } = await request.json();
  const service = services.find(s => s.name === name);
  if (service) {
    service.status = status;
    service.last_checked = new Date().toISOString();
    service.error_message = errorMessage || null;
    service.resolved_by = resolvedBy || null;
  }
  return NextResponse.json({ success: true });
}