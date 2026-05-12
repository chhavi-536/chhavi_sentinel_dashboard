import { ServiceRow, IncidentRow } from './types';

// Use in-memory cache for Next.js API routes
// The actual SQLite is managed by scripts/update-status.js

const servicesCache: ServiceRow[] = [
  { id: 1, name: 'auth-service', status: 'HEALTHY', last_checked: null, error_message: null, resolved_by: null },
  { id: 2, name: 'data-service', status: 'HEALTHY', last_checked: null, error_message: null, resolved_by: null },
  { id: 3, name: 'payment-service', status: 'HEALTHY', last_checked: null, error_message: null, resolved_by: null },
];

const incidentsCache: IncidentRow[] = [];

let nextServiceId = 4;
let nextIncidentId = 1;

export function getAllServices(): ServiceRow[] {
  return [...servicesCache].sort((a, b) => a.name.localeCompare(b.name));
}

export function updateServiceStatus(name: string, status: string, errorMessage?: string, resolvedBy?: string): void {
  const service = servicesCache.find(s => s.name === name);
  if (service) {
    service.status = status;
    service.last_checked = new Date().toISOString();
    service.error_message = errorMessage || null;
    service.resolved_by = resolvedBy || null;
  }
}

export function getActiveIncidents(): IncidentRow[] {
  return incidentsCache.filter(i => !i.resolved_at).map(i => {
    const service = servicesCache.find(s => s.id === i.service_id);
    return { ...i, service_name: service?.name };
  });
}

export function getResolvedIncidents(): IncidentRow[] {
  return incidentsCache.filter(i => i.resolved_at).map(i => {
    const service = servicesCache.find(s => s.id === i.service_id);
    return { ...i, service_name: service?.name };
  });
}

export function createIncident(serviceId: number, description: string): number {
  const incident: IncidentRow = {
    id: nextIncidentId++,
    service_id: serviceId,
    description,
    created_at: new Date().toISOString(),
    resolved_at: null,
    resolved_by: null,
  };
  incidentsCache.push(incident);
  return incident.id;
}

export function resolveIncident(incidentId: number, resolvedBy: string): void {
  const incident = incidentsCache.find(i => i.id === incidentId);
  if (incident) {
    incident.resolved_at = new Date().toISOString();
    incident.resolved_by = resolvedBy;
  }
}

export function getServiceById(id: number): ServiceRow | undefined {
  return servicesCache.find(s => s.id === id);
}