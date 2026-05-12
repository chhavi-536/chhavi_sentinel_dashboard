'use client';

import { useState, useEffect, useRef } from 'react';

interface Service {
  id: number;
  name: string;
  status: string;
  last_checked: string | null;
  error_message: string | null;
}

interface Incident {
  id: number;
  service_name: string;
  description: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

interface ResolutionHistory {
  id: number;
  service_name: string;
  detected_at: string;
  resolved_at: string | null;
  bug_type: string;
  bug_description: string;
  fix_applied: string;
  fix_successful: number;
  attempts: number;
}

function StatusBadge({ status }: { status: string }) {
  const statusLower = status?.toLowerCase() || 'healthy';
  const colors: Record<string, string> = {
    healthy: 'bg-green-500/20 text-green-400 border-green-500/30',
    warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${colors[statusLower] || colors.healthy}`}>
      {status}
    </span>
  );
}

function HealthIndicator({ health }: { health: { status: string; healthy: number; total: number } }) {
  const statusLower = health.status?.toLowerCase() || 'green';
  const colors: Record<string, string> = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  };
  const labels: Record<string, string> = {
    green: 'All Systems Operational',
    yellow: 'Degraded Performance',
    red: 'Critical Issues',
  };
  return (
    <div className="flex items-center gap-4">
      <div className={`w-4 h-4 rounded-full ${colors[statusLower]} animate-pulse`} />
      <div>
        <div className="text-lg font-semibold">{labels[statusLower] || labels.green}</div>
        <div className="text-sm text-gray-400">{health.healthy}/{health.total} services healthy</div>
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatUptime(startTime: number): string {
  const elapsed = Date.now() - startTime;
  const hours = Math.floor(elapsed / 3600000);
  const minutes = Math.floor((elapsed % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

export default function Dashboard() {
  const [services, setServices] = useState<Service[]>([]);
  const [activeIncidents, setActiveIncidents] = useState<Incident[]>([]);
  const [resolutionHistory, setResolutionHistory] = useState<ResolutionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState({ status: 'green', healthy: 0, total: 0 });
  const [lastCheckAgo, setLastCheckAgo] = useState(0);
  const [lastResolved, setLastResolved] = useState<{ service: string; time: string } | null>(null);
  const [startTime] = useState(Date.now());
  const [morningSummary, setMorningSummary] = useState<{
    total: number;
    resolved: number;
    failed: number;
    avgTime: number;
    mostBreakage: string;
  } | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const incidentIdRef = useRef(1);
  const lastCheckRef = useRef(Date.now());

  const fetchAll = async () => {
    try {
      const now = Date.now();
      setLastCheckAgo(Math.floor((now - lastCheckRef.current) / 1000));
      lastCheckRef.current = now;

      const [servicesRes, historyRes] = await Promise.all([
        fetch('/api/services'),
        fetch('/api/resolutions'),
      ]);

      const servicesData = await servicesRes.json();
      const historyData = await historyRes.json();

      setServices(servicesData);
      setResolutionHistory(historyData);

      // PROBLEM 4 FIX: Recalculate active incidents fresh from services (not accumulated)
      const freshIncidents: Incident[] = [];
      for (const svc of servicesData) {
        if (svc.status === 'CRITICAL') {
          freshIncidents.push({
            id: svc.id,
            service_name: svc.name,
            description: svc.error_message || 'Service unreachable',
            created_at: svc.last_checked || new Date().toISOString(),
            resolved_at: null,
            resolved_by: null,
          });
        }
      }
      setActiveIncidents(freshIncidents);

      const healthy = servicesData.filter((s: Service) => s.status === 'HEALTHY').length;
      const total = servicesData.length;
      let healthStatus: string = 'green';
      if (healthy === 0) healthStatus = 'red';
      else if (healthy < total) healthStatus = 'yellow';

      setHealth({ status: healthStatus, healthy, total });
      setLoading(false);

      // PROBLEM 4 FIX: Morning summary should count unique incidents from TODAY only
      const today = new Date().toISOString().split('T')[0]; // Get today's date string

      if (historyData.length > 0) {
        const latest = historyData[0];
        setLastResolved({ service: latest.service_name, time: new Date(latest.resolved_at || 0).toLocaleTimeString() });

        // Filter to today's incidents only
        const todayIncidents = historyData.filter((h: ResolutionHistory) =>
          h.detected_at && h.detected_at.startsWith(today)
        );

        // Count unique services that had incidents today (not total rows)
        const uniqueServiceIncidents = new Set(todayIncidents.map((h: ResolutionHistory) => h.service_name)).size;
        const totalIncidents = uniqueServiceIncidents; // Use unique count, not total rows

        const resolved = todayIncidents.filter((h: ResolutionHistory) => h.fix_successful === 1).length;
        const failed = totalIncidents - resolved;

        const withTimes = historyData.filter((h: ResolutionHistory) => h.resolved_at && h.detected_at);
        let avgTime = 0;
        if (withTimes.length > 0) {
          const totalTime = withTimes.reduce((sum: number, h: ResolutionHistory) => {
            return sum + (new Date(h.resolved_at!).getTime() - new Date(h.detected_at).getTime());
          }, 0);
          avgTime = totalTime / withTimes.length;
        }

        const serviceCounts: Record<string, number> = {};
        historyData.forEach((h: ResolutionHistory) => {
          serviceCounts[h.service_name] = (serviceCounts[h.service_name] || 0) + 1;
        });
        const mostBreakage = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';

        setMorningSummary({ total: totalIncidents, resolved, failed, avgTime, mostBreakage });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  useEffect(() => {
    fetchAll();
    intervalRef.current = setInterval(fetchAll, 5000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  const sortedHistory = [...resolutionHistory].sort((a, b) =>
    new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime()
  );

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                Sentinel
              </h1>
              <p className="text-gray-400">Incident Monitoring & Resolution System</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm font-medium border border-green-500/30 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                Auto-Pilot ON
              </span>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-6 text-sm text-gray-400">
            <div>Last checked: <span className="text-white">{lastCheckAgo} seconds ago</span></div>
            {lastResolved && (
              <div>Last resolved: <span className="text-white">{lastResolved.service}</span> at <span className="text-white">{lastResolved.time}</span></div>
            )}
            <div>System running for: <span className="text-white">{formatUptime(startTime)}</span></div>
          </div>
        </header>

        {morningSummary && (
          <section className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-xl p-6 border border-purple-500/30 mb-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-purple-500 rounded-full" />
              Morning Summary
            </h2>
            <div className="grid grid-cols-5 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-white">{morningSummary.total}</div>
                <div className="text-sm text-gray-400">Total Incidents</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-400">{morningSummary.resolved}</div>
                <div className="text-sm text-gray-400">Resolved</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-red-400">{morningSummary.failed}</div>
                <div className="text-sm text-gray-400">Failed</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-400">{formatDuration(morningSummary.avgTime)}</div>
                <div className="text-sm text-gray-400">Avg Resolution</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-400">{morningSummary.mostBreakage}</div>
                <div className="text-sm text-gray-400">Most Breakage</div>
              </div>
            </div>
          </section>
        )}

        <div className="grid gap-6">
          <section className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              Active Incidents ({activeIncidents.length})
            </h2>
            {activeIncidents.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No active incidents - Auto-Pilot is monitoring</p>
            ) : (
              <div className="space-y-3">
                {activeIncidents.map(incident => (
                  <div key={incident.id} className="flex items-center justify-between bg-gray-700/50 rounded-lg p-4">
                    <div>
                      <div className="font-medium">{incident.service_name}</div>
                      <div className="text-sm text-gray-400">{incident.description}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(incident.created_at).toLocaleString()}
                      </div>
                    </div>
                    <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-lg text-sm border border-yellow-500/30">
                      Auto-Resolving...
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-purple-500 rounded-full" />
              Nightly History
            </h2>
            {sortedHistory.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No resolution history yet</p>
            ) : (
              <div className="space-y-3">
                {sortedHistory.map(incident => {
                  const duration = incident.resolved_at && incident.detected_at
                    ? new Date(incident.resolved_at).getTime() - new Date(incident.detected_at).getTime()
                    : null;
                  const statusColor = incident.fix_successful === 1
                    ? 'border-green-500/30 bg-green-500/10'
                    : incident.attempts > 1
                    ? 'border-yellow-500/30 bg-yellow-500/10'
                    : 'border-red-500/30 bg-red-500/10';
                  const badgeColor = incident.fix_successful === 1
                    ? 'bg-green-500/20 text-green-400'
                    : incident.attempts > 1
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-red-500/20 text-red-400';

                  return (
                    <div key={incident.id} className={`rounded-lg p-4 border ${statusColor}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{incident.service_name}</span>
                          <span className={`px-2 py-0.5 rounded text-xs ${badgeColor}`}>
                            {incident.fix_successful === 1 ? 'Resolved' : incident.attempts > 1 ? `${incident.attempts} attempts` : 'Failed'}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(incident.detected_at).toLocaleString()}
                          {duration && ` → ${formatDuration(duration)}`}
                        </div>
                      </div>
                      <div className="text-sm text-gray-400 mb-1">
                        <span className="text-red-400">{incident.bug_type}:</span> {incident.bug_description}
                      </div>
                      <div className="text-sm text-purple-400">
                        Fix: {incident.fix_applied}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full" />
              System Health
            </h2>
            <HealthIndicator health={health} />
            <div className="mt-4 grid grid-cols-3 gap-4">
              {services.map(service => (
                <div key={service.id} className="bg-gray-700/30 rounded-lg p-3 text-center">
                  <div className="text-sm text-gray-400 mb-1">{service.name}</div>
                  <StatusBadge status={service.status} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}