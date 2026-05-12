// Shared in-memory store for dashboard API routes
// This is initialized with default services and synced by update-status.js via SQLite

export interface Service {
  id: number;
  name: string;
  status: string;
  last_checked: string | null;
  error_message: string | null;
  resolved_by: string | null;
}

export interface Incident {
  id: number;
  service_id: number;
  description: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  service_name?: string;
}

export const services: Service[] = [
  { id: 1, name: 'auth-service', status: 'HEALTHY', last_checked: null, error_message: null, resolved_by: null },
  { id: 2, name: 'data-service', status: 'HEALTHY', last_checked: null, error_message: null, resolved_by: null },
  { id: 3, name: 'payment-service', status: 'HEALTHY', last_checked: null, error_message: null, resolved_by: null },
];

export const incidents: Incident[] = [];

export let nextIncidentId = 1;

export function getAllServices(): Service[] {
  return [...services].sort((a, b) => a.name.localeCompare(b.name));
}

export function getActiveIncidents(): Incident[] {
  return incidents.filter(i => !i.resolved_at).map(i => {
    const service = services.find(s => s.id === i.service_id);
    return { ...i, service_name: service?.name };
  });
}

export function getResolvedIncidents(): Incident[] {
  return incidents.filter(i => i.resolved_at).map(i => {
    const service = services.find(s => s.id === i.service_id);
    return { ...i, service_name: service?.name };
  });
}

export function createIncident(serviceId: number, description: string): number {
  const incident: Incident = {
    id: nextIncidentId++,
    service_id: serviceId,
    description,
    created_at: new Date().toISOString(),
    resolved_at: null,
    resolved_by: null,
  };
  incidents.push(incident);
  return incident.id;
}

export function resolveIncident(incidentId: number, resolvedBy: string): void {
  const incident = incidents.find(i => i.id === incidentId);
  if (incident) {
    incident.resolved_at = new Date().toISOString();
    incident.resolved_by = resolvedBy;
  }
}

export function updateServiceStatus(name: string, status: string, errorMessage?: string, resolvedBy?: string): void {
  const service = services.find(s => s.name === name);
  if (service) {
    service.status = status;
    service.last_checked = new Date().toISOString();
    service.error_message = errorMessage || null;
    service.resolved_by = resolvedBy || null;
  }
}