import {
  AlertListResponse,
  DashboardSummary,
  HealthResponse,
  ModelInfoResponse,
  PredictionHistoryResponse,
  PredictResponse,
  SimulatorStatus,
  TelemetryHistoryResponse,
  TelemetryReading,
} from '../types/telemetry';

const API_BASE = '/api';

/**
 * Handle API responses with robust error handling.
 */
async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`API Error [${res.status}]: ${errorText || res.statusText}`);
  }
  return res.json();
}

export const api = {
  async getHealth(): Promise<HealthResponse> {
    const res = await fetch(`${API_BASE}/health`);
    return handleResponse<HealthResponse>(res);
  },

  async getDashboardSummary(): Promise<DashboardSummary> {
    const res = await fetch(`${API_BASE}/v1/dashboard/summary`);
    return handleResponse<DashboardSummary>(res);
  },

  async getLatestTelemetry(trackId?: string): Promise<TelemetryReading[]> {
    const url = trackId
      ? `${API_BASE}/v1/telemetry/latest?track_id=${encodeURIComponent(trackId)}`
      : `${API_BASE}/v1/telemetry/latest`;
    const res = await fetch(url);
    return handleResponse<TelemetryReading[]>(res);
  },

  async getTelemetryHistory(trackId?: string, limit: number = 30): Promise<TelemetryHistoryResponse> {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (trackId) {
      params.append('track_id', trackId);
    }
    const res = await fetch(`${API_BASE}/v1/telemetry/history?${params.toString()}`);
    return handleResponse<TelemetryHistoryResponse>(res);
  },

  async getAlerts(severity?: string): Promise<AlertListResponse> {
    const url = severity
      ? `${API_BASE}/v1/alerts?severity=${encodeURIComponent(severity)}`
      : `${API_BASE}/v1/alerts`;
    const res = await fetch(url);
    return handleResponse<AlertListResponse>(res);
  },

  async acknowledgeAlert(alertId: string): Promise<{ status: string; alert_id: string; acknowledged: boolean }> {
    const res = await fetch(`${API_BASE}/v1/alerts/${encodeURIComponent(alertId)}/acknowledge`, {
      method: 'PATCH',
    });
    return handleResponse(res);
  },

  async getSimulatorStatus(): Promise<SimulatorStatus> {
    const res = await fetch(`${API_BASE}/v1/simulator/status`);
    return handleResponse<SimulatorStatus>(res);
  },

  async controlSimulator(request: {
    action: string;
    profile?: string;
    interval_seconds?: number;
  }): Promise<SimulatorStatus> {
    const res = await fetch(`${API_BASE}/v1/simulator/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    return handleResponse<SimulatorStatus>(res);
  },

  // ===========================================================================
  // Machine Learning APIs (Phase 3)
  // ===========================================================================

  async getModelInfo(): Promise<ModelInfoResponse> {
    const res = await fetch(`${API_BASE}/v1/ml/model-info`);
    return handleResponse<ModelInfoResponse>(res);
  },

  async predictTrackFault(trackId?: string, windowSize: number = 20): Promise<PredictResponse> {
    const res = await fetch(`${API_BASE}/v1/ml/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        track_id: trackId || undefined,
        window_size: windowSize,
      }),
    });
    return handleResponse<PredictResponse>(res);
  },

  async getPredictionHistory(limit: number = 30): Promise<PredictionHistoryResponse> {
    const res = await fetch(`${API_BASE}/v1/ml/predictions/history?limit=${limit}`);
    return handleResponse<PredictionHistoryResponse>(res);
  },
};
