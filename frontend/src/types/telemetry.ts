export interface TelemetryReading {
  id: string;
  track_segment_id: string;
  track_name: string;
  timestamp: string;
  vibration_x: number;
  vibration_y: number;
  vibration_z: number;
  vibration_rms: number;
  temperature_c: number;
  humidity_pct: number;
  train_speed_kmh: number;
  status: 'NORMAL' | 'WARNING' | 'CRITICAL';
  simulation_profile: string;
  is_simulated: boolean;
  data_source: string;
}

export interface TelemetryHistoryResponse {
  track_segment_id?: string | null;
  total_records: number;
  data_source: string;
  is_simulated: boolean;
  readings: TelemetryReading[];
}

export interface TrackStatusSummary {
  track_segment_id: string;
  track_name: string;
  status: 'NORMAL' | 'WARNING' | 'CRITICAL';
  latest_rms: number;
  latest_temp: number;
  latest_speed: number;
  active_alerts: number;
}

export interface DashboardSummary {
  project: string;
  timestamp: string;
  data_source: string;
  is_simulated: boolean;
  overall_health_score: number;
  network_status: 'NORMAL' | 'ATTENTION' | 'CRITICAL';
  total_tracks_monitored: number;
  healthy_tracks_count: number;
  warning_tracks_count: number;
  critical_tracks_count: number;
  active_alerts_count: number;
  system_average_vibration_rms: number;
  system_average_temperature_c: number;
  system_average_humidity_pct: number;
  simulation_running: boolean;
  tracks: TrackStatusSummary[];
}

export interface Alert {
  id: string;
  track_segment_id: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: string;
  acknowledged: boolean;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  is_resolved?: boolean;
  resolved_at?: string | null;
  resolved_by?: string | null;
  is_simulated: boolean;
  data_source: string;
}

export interface AlertListResponse {
  total: number;
  active_count: number;
  acknowledged_count: number;
  resolved_count?: number;
  data_source: string;
  is_simulated: boolean;
  alerts: Alert[];
}

export interface SimulatorStatus {
  is_running: boolean;
  interval_seconds: number;
  total_readings_generated: number;
  active_profile: string;
  available_profiles: string[];
  monitored_tracks: string[];
  data_source: string;
  is_simulated: boolean;
}

export interface HealthResponse {
  status: string;
  project: string;
  version: string;
  timestamp: string;
  environment: string;
  data_source: string;
  active_modules: string[];
}

// =============================================================================
// Machine Learning Schemas (Phase 3)
// =============================================================================

export interface ModelInfoResponse {
  model_version: string;
  trained_at: string;
  dataset_provenance: string;
  is_simulated: boolean;
  safety_disclaimer: string;
  random_seed: number;
  classes: string[];
  feature_names: string[];
  training_summary: {
    total_runs: number;
    train_runs: number;
    test_runs: number;
    train_samples: number;
    test_samples: number;
  };
  evaluation_metrics: {
    accuracy: number;
    balanced_accuracy: number;
    precision_macro: number;
    recall_macro: number;
    f1_macro: number;
    confusion_matrix: number[][];
    classification_report: Record<string, any>;
    top_features: [string, number][];
  };
  anomaly_calibration: {
    model: string;
    calibrated_threshold: number;
    score_interpretation: string;
    holdout_anomaly_detection_accuracy: number;
    holdout_anomaly_detection_f1: number;
    calibration_params: {
      dec_min: number;
      dec_max: number;
      score_spread: number;
    };
  };
  normal_baseline_stats?: Record<string, { mean: number; std: number }>;
}

export interface PredictResponse {
  prediction_id: string;
  track_segment_id: string;
  timestamp: string;
  predicted_fault: string;
  confidence_score: number;
  class_probabilities: Record<string, number>;
  anomaly_score: number;
  anomaly_threshold: number;
  is_anomaly: boolean;
  window_size: number;
  features_snapshot: Record<string, number>;
  feature_deviations?: Record<string, number>;
  maintenance_recommendation: string;
  model_version?: string;
  is_simulated: boolean;
  data_source: string;
  safety_disclaimer: string;
}

export interface PredictionHistoryItem {
  prediction_id: string;
  track_segment_id: string;
  timestamp: string;
  predicted_fault: string;
  confidence_score: number;
  anomaly_score: number;
  is_anomaly: boolean;
  is_simulated: boolean;
}

export interface PredictionHistoryResponse {
  total: number;
  data_source: string;
  is_simulated: boolean;
  predictions: PredictionHistoryItem[];
  limit?: number;
  offset?: number;
}

export interface PredictionDetailResponse extends PredictResponse {
  model_version: string;
}

// =============================================================================
// Track Analytics & Historical Analysis Schemas (Phase 5)
// =============================================================================

export interface TrackSegmentItem {
  id: string;
  code: string;
  name: string;
  line_type: string;
  base_speed_kmh: number;
  nominal_temperature_c: number;
  nominal_humidity_pct: number;
  health_status: string;
  is_simulated: boolean;
  data_source: string;
}

export interface TrackAnalytics {
  track_id: string;
  track_name: string;
  line_type: string;
  base_speed_kmh: number;
  nominal_temperature_c: number;
  nominal_humidity_pct: number;
  health_status: string;
  total_telemetry_records: number;
  vibration_rms: { mean: number; min: number; max: number; latest: number };
  vibration_z: { mean: number; max: number; latest: number };
  temperature_c: { mean: number; min: number; max: number; latest: number };
  humidity_pct: { mean: number; latest: number };
  speed_kmh: { mean: number; max: number; latest: number };
  alerts_summary: { total: number; active: number; acknowledged: number; resolved: number };
  latest_prediction?: PredictResponse | null;
  data_source: string;
  is_simulated: boolean;
}

export interface TelemetryAnalysisResponse {
  track_segment_id: string;
  sample_count: number;
  window_duration_seconds: number;
  timestamp_latest: string;
  vibration_metrics: {
    vx_rms: number;
    vy_rms: number;
    vz_rms: number;
    v_total_rms: number;
    vz_kurtosis: number;
    vz_crest_factor: number;
    lateral_to_vertical_ratio: number;
    instantaneous: {
      vx: number;
      vy: number;
      vz: number;
    };
  };
  thermal_metrics: {
    temperature_c: number;
    temp_mean: number;
    temp_max: number;
    temp_min: number;
    temp_slope_c_per_min: number;
    humidity_pct: number;
    train_speed_kmh: number;
    demonstration_thermal_status: string;
    demonstration_thresholds_note: string;
  };
  is_simulated: boolean;
  data_source: string;
}
