import {
  AlertListResponse,
  DashboardSummary,
  HealthResponse,
  ModelInfoResponse,
  PredictionDetailResponse,
  PredictionHistoryResponse,
  PredictResponse,
  SimulatorStatus,
  TelemetryAnalysisResponse,
  TelemetryHistoryResponse,
  TelemetryReading,
  TrackAnalytics,
  TrackSegmentItem,
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

  async getTelemetryHistory(
    trackId?: string,
    limit: number = 30,
    source?: 'database' | 'buffer',
    timeRange?: string,
  ): Promise<TelemetryHistoryResponse> {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (trackId) {
      params.append('track_id', trackId);
    }
    if (source) {
      params.append('source', source);
    }
    if (timeRange) {
      params.append('time_range', timeRange);
    }
    const res = await fetch(`${API_BASE}/v1/telemetry/history?${params.toString()}`);
    return handleResponse<TelemetryHistoryResponse>(res);
  },

  async getTelemetryExportCsvUrl(trackId?: string, timeRange?: string): Promise<string> {
    const params = new URLSearchParams();
    if (trackId) params.append('track_id', trackId);
    if (timeRange) params.append('time_range', timeRange);
    return `${API_BASE}/v1/telemetry/export/csv?${params.toString()}`;
  },

  async downloadTelemetryCsv(trackId?: string, timeRange?: string): Promise<void> {
    const params = new URLSearchParams();
    if (trackId) params.append('track_id', trackId);
    if (timeRange) params.append('time_range', timeRange);
    const url = `${API_BASE}/v1/telemetry/export/csv?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`CSV Export failed [${res.status}]: ${res.statusText}`);
    }
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    const filename = `railway_telemetry_${(trackId || 'all_tracks').replace(/-/g, '_').toLowerCase()}_${timeRange || 'all'}.csv`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  },

  async getAdvancedAnalysis(trackId: string = 'TRK-01'): Promise<TelemetryAnalysisResponse> {
    const res = await fetch(`${API_BASE}/v1/telemetry/analysis?track_id=${encodeURIComponent(trackId)}`);
    return handleResponse<TelemetryAnalysisResponse>(res);
  },

  async getTracks(): Promise<TrackSegmentItem[]> {
    const res = await fetch(`${API_BASE}/v1/tracks`);
    return handleResponse<TrackSegmentItem[]>(res);
  },

  async getTrackAnalytics(trackId: string): Promise<TrackAnalytics> {
    const res = await fetch(`${API_BASE}/v1/tracks/${encodeURIComponent(trackId)}/analytics`);
    return handleResponse<TrackAnalytics>(res);
  },

  async getAlerts(severity?: string): Promise<AlertListResponse> {
    const url = severity
      ? `${API_BASE}/v1/alerts?severity=${encodeURIComponent(severity)}`
      : `${API_BASE}/v1/alerts`;
    const res = await fetch(url);
    return handleResponse<AlertListResponse>(res);
  },

  async getFilteredAlerts(params: {
    severity?: string;
    status?: string;
    track_id?: string;
    search?: string;
    limit?: number;
  }): Promise<AlertListResponse> {
    const query = new URLSearchParams();
    if (params.severity && params.severity !== 'ALL') query.append('severity', params.severity);
    if (params.status && params.status !== 'ALL') query.append('status', params.status);
    if (params.track_id) query.append('track_id', params.track_id);
    if (params.search) query.append('search', params.search);
    if (params.limit) query.append('limit', params.limit.toString());
    const res = await fetch(`${API_BASE}/v1/alerts?${query.toString()}`);
    return handleResponse<AlertListResponse>(res);
  },

  async acknowledgeAlert(alertId: string): Promise<{ status: string; alert_id: string; acknowledged: boolean }> {
    const res = await fetch(`${API_BASE}/v1/alerts/${encodeURIComponent(alertId)}/acknowledge`, {
      method: 'PATCH',
    });
    return handleResponse(res);
  },

  async resolveAlert(
    alertId: string,
    resolvedBy: string = 'Operator',
  ): Promise<{ status: string; alert_id: string; resolved: boolean; is_resolved: boolean; acknowledged: boolean; resolved_by: string; resolved_at: string }> {
    const res = await fetch(`${API_BASE}/v1/alerts/${encodeURIComponent(alertId)}/resolve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved_by: resolvedBy }),
    });
    return handleResponse(res);
  },

  async getSimulatorStatus(): Promise<SimulatorStatus> {
    const res = await fetch(`${API_BASE}/v1/simulator/status`);
    return handleResponse<SimulatorStatus>(res);
  },

  async resetSimulator(): Promise<SimulatorStatus> {
    const res = await fetch(`${API_BASE}/v1/simulator/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
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

  async getFilteredPredictions(params: {
    trackId?: string;
    fault?: string;
    isAnomaly?: boolean;
    limit?: number;
    offset?: number;
    source?: string;
  }): Promise<PredictionHistoryResponse> {
    const query = new URLSearchParams();
    if (params.trackId) query.append('track_id', params.trackId);
    if (params.fault && params.fault !== 'ALL') query.append('fault', params.fault);
    if (params.isAnomaly !== undefined) query.append('is_anomaly', String(params.isAnomaly));
    if (params.limit) query.append('limit', params.limit.toString());
    if (params.offset !== undefined) query.append('offset', params.offset.toString());
    if (params.source) query.append('source', params.source);
    const res = await fetch(`${API_BASE}/v1/ml/predictions/history?${query.toString()}`);
    return handleResponse<PredictionHistoryResponse>(res);
  },

  async getPredictionDetail(predictionId: string): Promise<PredictionDetailResponse> {
    const res = await fetch(`${API_BASE}/v1/ml/predictions/${encodeURIComponent(predictionId)}`);
    return handleResponse<PredictionDetailResponse>(res);
  },
};
