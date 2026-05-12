import fs from 'fs';
import path from 'path';

interface Service {
  id: number;
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  lastChecked: string | null;
  errorMessage: string | null;
}

interface Incident {
  id: number;
  serviceId: number;
  description: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  serviceName?: string;
}

interface Resolution {
  id: number;
  incidentId: number;
  fixApplied: string;
  timestamp: string;
  success: number;
  serviceName?: string;
  incidentDescription?: string;
}

interface Database {
  services: Service[];
  incidents: Incident[];
  resolutions: Resolution[];
  nextIds: { services: number; incidents: number; resolutions: number };
}

const dbPath = path.join(process.cwd(), 'sentinel-data.json');

function loadDb(): Database {
  if (fs.existsSync(dbPath)) {
    return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
  }
  const initialDb: Database = {
    services: [
      { id: 1, name: 'auth-service', status: 'healthy', lastChecked: null, errorMessage: null },
      { id: 2, name: 'data-service', status: 'healthy', lastChecked: null, errorMessage: null },
      { id: 3, name: 'payment-service', status: 'healthy', lastChecked: null, errorMessage: null },
    ],
    incidents: [],
    resolutions: [],
    nextIds: { services: 4, incidents: 1, resolutions: 1 },
  };
  saveDb(initialDb);
  return initialDb;
}

function saveDb(db: Database): void {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

export function getAllServices(): Service[] {
  const db = loadDb();
  return db.services.sort((a, b) => a.name.localeCompare(b.name));
}

export function getServiceByName(name: string): Service | undefined {
  const db = loadDb();
  return db.services.find(s => s.name === name);
}

export function updateServiceStatus(name: string, status: string, errorMessage?: string): void {
  const db = loadDb();
  const service = db.services.find(s => s.name === name);
  if (service) {
    service.status = status as Service['status'];
    service.lastChecked = new Date().toISOString();
    service.errorMessage = errorMessage || null;
    saveDb(db);
  }
}

export function getActiveIncidents(): Incident[] {
  const db = loadDb();
  return db.incidents
    .filter(i => !i.resolvedAt)
    .map(i => {
      const service = db.services.find(s => s.id === i.serviceId);
      return { ...i, serviceName: service?.name || `Service #${i.serviceId}` };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function createIncident(serviceId: number, description: string): number {
  const db = loadDb();
  const incident: Incident = {
    id: db.nextIds.incidents++,
    serviceId,
    description,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolvedBy: null,
  };
  db.incidents.push(incident);
  saveDb(db);
  return incident.id;
}

export function resolveIncident(incidentId: number, resolvedBy: string): void {
  const db = loadDb();
  const incident = db.incidents.find(i => i.id === incidentId);
  if (incident) {
    incident.resolvedAt = new Date().toISOString();
    incident.resolvedBy = resolvedBy;
    saveDb(db);
  }
}

export function addResolution(incidentId: number, fixApplied: string, success: boolean): void {
  const db = loadDb();
  const resolution: Resolution = {
    id: db.nextIds.resolutions++,
    incidentId,
    fixApplied,
    timestamp: new Date().toISOString(),
    success: success ? 1 : 0,
  };
  db.resolutions.push(resolution);
  saveDb(db);
}

export function getResolvedByClaude(): Resolution[] {
  const db = loadDb();
  return db.resolutions
    .filter(r => r.success === 1)
    .map(r => {
      const incident = db.incidents.find(i => i.id === r.incidentId);
      const service = db.services.find(s => s.id === incident?.serviceId);
      return {
        ...r,
        serviceName: service?.name || `Service #${r.incidentId}`,
        incidentDescription: incident?.description,
      };
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 20);
}

export function getSystemHealth(): { status: 'green' | 'yellow' | 'red'; healthy: number; total: number } {
  const db = loadDb();
  const healthy = db.services.filter(s => s.status === 'healthy').length;
  const total = db.services.length;

  let status: 'green' | 'yellow' | 'red' = 'green';
  if (healthy === 0) status = 'red';
  else if (healthy < total) status = 'yellow';

  return { status, healthy, total };
}