import { NextResponse } from 'next/server';

const incidents: Array<{
  id: number;
  service_id: number;
  service_name: string;
  description: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}> = [];

let nextId = 1;

const services = [
  { id: 1, name: 'auth-service' },
  { id: 2, name: 'data-service' },
  { id: 3, name: 'payment-service' },
];

export async function GET() {
  return NextResponse.json(incidents);
}

export async function POST(request: Request) {
  const { action, serviceId, description, serviceName, status } = await request.json();

  if (action === 'auto-create') {
    // Auto-create incident when service goes critical
    const svc = services.find(s => s.name === serviceName);
    if (svc && status === 'CRITICAL') {
      const existingCritical = incidents.find(
        i => i.service_id === svc.id && !i.resolved_at
      );
      if (!existingCritical) {
        incidents.push({
          id: nextId++,
          service_id: svc.id,
          service_name: svc.name,
          description: `Service unreachable - ${serviceName} is down`,
          created_at: new Date().toISOString(),
          resolved_at: null,
          resolved_by: null,
        });
      }
    }
    return NextResponse.json({ success: true });
  }

  if (action === 'create' && serviceId && description) {
    const svc = services.find(s => s.id === serviceId);
    incidents.push({
      id: nextId++,
      service_id: serviceId,
      service_name: svc?.name || `Service #${serviceId}`,
      description,
      created_at: new Date().toISOString(),
      resolved_at: null,
      resolved_by: null,
    });
    return NextResponse.json({ id: nextId - 1 });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}