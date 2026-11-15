import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  Database,
  RefreshCw,
  Thermometer,
  Zap,
} from 'lucide-react';
import { api } from '../services/api';
import { TrackAnalytics, TrackSegmentItem } from '../types/telemetry';

export const TrackAnalyticsPage: React.FC = () => {
  const [tracks, setTracks] = useState<TrackSegmentItem[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string>('TRK-01');
  const [analytics, setAnalytics] = useState<TrackAnalytics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load tracks list on mount
  useEffect(() => {
    api
      .getTracks()
      .then((data) => {
        setTracks(data);
        if (data.length > 0 && !selectedTrackId) {
          setSelectedTrackId(data[0].id);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load track segments');
      });
  }, []);

  // Fetch individual track analytics whenever selectedTrackId changes
  const fetchAnalytics = async (trackId: string) => {
    setRefreshing(true);
    try {
      const data = await api.getTrackAnalytics(trackId);
      setAnalytics(data);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to load analytics for ${trackId}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (selectedTrackId) {
      fetchAnalytics(selectedTrackId);
    }
  }, [selectedTrackId]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Track Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0c1220] border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              PostgreSQL Persistent Analytics
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400">
              Synthetic Simulation Provenance
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">Railway Track Analytics</h2>
          <p className="text-xs text-slate-400">
            Real-time telemetry aggregations, structural vibration statistics, and historical alert profiles per track segment.
          </p>
        </div>

        {/* Track Selector Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {tracks.map((track) => {
            const isSelected = track.id === selectedTrackId;
            return (
              <button
                key={track.id}
                onClick={() => setSelectedTrackId(track.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                  isSelected
                    ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20 font-bold'
                    : 'bg-slate-900/90 text-slate-300 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/80'
                }`}
              >
                <span>{track.code}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${isSelected ? 'bg-slate-900/20 text-slate-900' : 'bg-slate-800 text-slate-400'}`}>
                  {track.id}
                </span>
              </button>
            );
          })}

          <button
            onClick={() => fetchAnalytics(selectedTrackId)}
            disabled={refreshing}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all ml-1 disabled:opacity-50"
            title="Refresh track analytics"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !analytics ? (
        <div className="p-12 text-center text-slate-500 text-xs flex flex-col items-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
          <span>Aggregating PostgreSQL telemetry for {selectedTrackId}...</span>
        </div>
      ) : analytics ? (
        <>
          {/* Track Structural Parameters Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-[#0d1322] border border-slate-800/80">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block mb-1">
                Track Segment & Code
              </span>
              <div className="text-lg font-bold text-slate-100">{analytics.track_name}</div>
              <div className="text-xs font-mono text-cyan-400 mt-1">
                ID: {analytics.track_id} | {analytics.line_type}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#0d1322] border border-slate-800/80">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block mb-1">
                Operating Baseline Speed
              </span>
              <div className="text-lg font-bold text-slate-100">{analytics.base_speed_kmh} km/h</div>
              <div className="text-xs font-mono text-slate-400 mt-1">
                Latest: {analytics.speed_kmh.latest.toFixed(1)} km/h (Max: {analytics.speed_kmh.max.toFixed(1)})
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#0d1322] border border-slate-800/80">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block mb-1">
                Nominal Environmental Benchmark
              </span>
              <div className="text-lg font-bold text-slate-100">
                {analytics.nominal_temperature_c}°C / {analytics.nominal_humidity_pct}%
              </div>
              <div className="text-xs font-mono text-slate-400 mt-1">
                Current: {analytics.temperature_c.latest.toFixed(1)}°C / {analytics.humidity_pct.latest.toFixed(1)}%
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#0d1322] border border-slate-800/80">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block mb-1">
                PostgreSQL Stored Records
              </span>
              <div className="text-lg font-bold text-emerald-400 font-mono">
                {analytics.total_telemetry_records.toLocaleString()}
              </div>
              <div className="text-xs font-mono text-slate-400 mt-1 flex items-center gap-1.5">
                <Database className="w-3 h-3 text-cyan-400" />
                Persistent Storage Active
              </div>
            </div>
          </div>

          {/* Aggregated Statistical Metrics Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 1. Vibration Dynamics */}
            <div className="p-5 rounded-2xl bg-[#0c1220] border border-slate-800 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <Activity className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-bold text-slate-200">Vibration Dynamics (g)</h3>
                </div>
                <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                  3-Axis Accelerometer
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/60 text-xs">
                  <span className="text-slate-400">Vibration RMS (Spatial)</span>
                  <div className="font-mono text-right">
                    <span className="font-bold text-slate-100">{analytics.vibration_rms.latest.toFixed(3)}g</span>
                    <span className="text-[10px] text-slate-500 block">
                      Mean: {analytics.vibration_rms.mean.toFixed(3)}g | Max: {analytics.vibration_rms.max.toFixed(3)}g
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/60 text-xs">
                  <span className="text-slate-400">Vertical Acceleration (Vz)</span>
                  <div className="font-mono text-right">
                    <span className="font-bold text-slate-100">{analytics.vibration_z.latest.toFixed(3)}g</span>
                    <span className="text-[10px] text-slate-500 block">
                      Mean: {analytics.vibration_z.mean.toFixed(3)}g | Peak: {analytics.vibration_z.max.toFixed(3)}g
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900/30 border border-slate-800 text-[11px] text-slate-400">
                  RMS range: <span className="font-mono text-cyan-300">[{analytics.vibration_rms.min.toFixed(3)}g - {analytics.vibration_rms.max.toFixed(3)}g]</span> over {analytics.total_telemetry_records} recorded sensor readings.
                </div>
              </div>
            </div>

            {/* 2. Thermal & Humidity Distribution */}
            <div className="p-5 rounded-2xl bg-[#0c1220] border border-slate-800 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <Thermometer className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-slate-200">Thermal & Humidity Profile</h3>
                </div>
                <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  Rail Thermometry
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/60 text-xs">
                  <span className="text-slate-400">Rail Surface Temperature</span>
                  <div className="font-mono text-right">
                    <span className="font-bold text-amber-400">{analytics.temperature_c.latest.toFixed(1)}°C</span>
                    <span className="text-[10px] text-slate-500 block">
                      Mean: {analytics.temperature_c.mean.toFixed(1)}°C | Max: {analytics.temperature_c.max.toFixed(1)}°C
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/60 text-xs">
                  <span className="text-slate-400">Relative Humidity</span>
                  <div className="font-mono text-right">
                    <span className="font-bold text-cyan-400">{analytics.humidity_pct.latest.toFixed(1)}%</span>
                    <span className="text-[10px] text-slate-500 block">
                      Mean: {analytics.humidity_pct.mean.toFixed(1)}%
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900/30 border border-slate-800 text-[11px] text-slate-400">
                  Temperature extremes: <span className="font-mono text-amber-300">[{analytics.temperature_c.min.toFixed(1)}°C to {analytics.temperature_c.max.toFixed(1)}°C]</span>.
                </div>
              </div>
            </div>

            {/* 3. Historical Alert Breakdown */}
            <div className="p-5 rounded-2xl bg-[#0c1220] border border-slate-800 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <h3 className="text-sm font-bold text-slate-200">Incident Alerts Breakdown</h3>
                </div>
                <span className="text-[10px] font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                  PostgreSQL Alerts
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800/80 text-center">
                  <span className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Total Created</span>
                  <span className="text-lg font-bold font-mono text-slate-100">{analytics.alerts_summary.total}</span>
                </div>

                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-center">
                  <span className="text-[10px] uppercase font-mono text-rose-300 block mb-1">Active Incidents</span>
                  <span className="text-lg font-bold font-mono text-rose-400">{analytics.alerts_summary.active}</span>
                </div>

                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center">
                  <span className="text-[10px] uppercase font-mono text-amber-300 block mb-1">Acknowledged</span>
                  <span className="text-lg font-bold font-mono text-amber-400">{analytics.alerts_summary.acknowledged}</span>
                </div>

                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center">
                  <span className="text-[10px] uppercase font-mono text-emerald-300 block mb-1">Resolved</span>
                  <span className="text-lg font-bold font-mono text-emerald-400">{analytics.alerts_summary.resolved}</span>
                </div>
              </div>

              <div className="text-[10px] text-slate-500 text-center">
                All records stored with strict UTC provenance in PostgreSQL 18.6.
              </div>
            </div>
          </div>

          {/* Latest AI Prediction for this Track (if available) */}
          {analytics.latest_prediction && (
            <div className="p-5 rounded-2xl bg-[#0c1220] border border-cyan-500/30 space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <Zap className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-bold text-slate-200">Latest AI Diagnostic Inference for {analytics.track_id}</h3>
                </div>
                <span className="text-[10px] font-mono text-cyan-400">
                  {new Date(analytics.latest_prediction.timestamp).toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-400 block mb-1 text-[10px] uppercase font-mono">Predicted Fault Class</span>
                  <span className="text-sm font-bold font-mono text-cyan-300">
                    {analytics.latest_prediction.predicted_fault}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Confidence: {(analytics.latest_prediction.confidence_score * 100).toFixed(1)}%
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-400 block mb-1 text-[10px] uppercase font-mono">Anomaly Score (Isolation Forest)</span>
                  <span className={`text-sm font-bold font-mono ${analytics.latest_prediction.is_anomaly ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {analytics.latest_prediction.anomaly_score.toFixed(4)}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Threshold: {analytics.latest_prediction.anomaly_threshold} ({analytics.latest_prediction.is_anomaly ? 'ANOMALY DETECTED' : 'NOMINAL BASELINE'})
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-400 block mb-1 text-[10px] uppercase font-mono">Advisory Recommendation</span>
                  <p className="text-[11px] text-slate-300 leading-snug">
                    {analytics.latest_prediction.maintenance_recommendation}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
};
