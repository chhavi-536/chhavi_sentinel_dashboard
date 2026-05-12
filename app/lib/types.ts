export interface ServiceRow {
  id: number;
  name: string;
  status: string;
  last_checked: string | null;
  error_message: string | null;
  resolved_by: string | null;
}

export interface IncidentRow {
  id: number;
  service_id: number;
  description: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  service_name?: string;
}