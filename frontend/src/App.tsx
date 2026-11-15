import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  BarChart3,
  Brain,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Gauge,
  History,
  Pause,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  StepForward,
  Thermometer,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { api } from './services/api';
import {
  DashboardSummary,
  HealthResponse,
  ModelInfoResponse,
  PredictionHistoryItem,
  PredictResponse,
  SimulatorStatus,
  TelemetryReading,
} from './types/telemetry';
import { TrackAnalyticsPage } from './components/TrackAnalyticsPage';
import { HistoricalTelemetryPage } from './components/HistoricalTelemetryPage';
import { PredictionHistoryPage } from './components/PredictionHistoryPage';
import { ModelTransparencyPage } from './components/ModelTransparencyPage';
import { AdvancedAlertsSection } from './components/AdvancedAlertsSection';
import { AiFeatureExplanationChart } from './components/AiFeatureExplanationChart';

export const App: React.FC = () => {
  // Navigation & View State
  const [activeTab, setActiveTab] = useState<
    | 'overview'
    | 'tracks'
    | 'vibration'
    | 'env'
    | 'historical'
    | 'faults'
    | 'prediction-history'
    | 'alerts'
    | 'transparency'
    | 'simulator'
  >('overview');
  const [selectedTrack, setSelectedTrack] = useState<string>(''); // empty = All tracks

  // Backend Data State
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [historyReadings, setHistoryReadings] = useState<TelemetryReading[]>([]);
  const [latestReadings, setLatestReadings] = useState<TelemetryReading[]>([]);
  const [simulatorStatus, setSimulatorStatus] = useState<SimulatorStatus | null>(null);

  // Machine Learning State (Phase 3)
  const [modelInfo, setModelInfo] = useState<ModelInfoResponse | null>(null);
  const [activePrediction, setActivePrediction] = useState<PredictResponse | null>(null);
  const [predictionHistory, setPredictionHistory] = useState<PredictionHistoryItem[]>([]);
  const [mlLoading, setMlLoading] = useState<boolean>(false);
  const [mlWarmingUp, setMlWarmingUp] = useState<{
    message: string;
    validSamples: number;
    requiredSamples: number;
    trackId: string;
  } | null>(null);

  // UX State
  const [isAutoPolling, setIsAutoPolling] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  // Master fetch function
  const fetchAllData = useCallback(async () => {
    try {
      const [healthData, summaryData, historyData, latestData, simData] = await Promise.all([
        api.getHealth().catch(() => null),
        api.getDashboardSummary(),
        api.getTelemetryHistory(selectedTrack || undefined, 35),
        api.getLatestTelemetry(selectedTrack || undefined),
        api.getSimulatorStatus(),
      ]);

      setHealth(healthData);
      setSummary(summaryData);
      setHistoryReadings(historyData.readings);
      setLatestReadings(latestData);
      setSimulatorStatus(simData);
      setError(null);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to synchronize with backend';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedTrack]);

  // Initial fetch and auto-polling interval
  useEffect(() => {
    fetchAllData();
    if (!isAutoPolling) return;

    const interval = setInterval(() => {
      fetchAllData();
    }, 2500);

    return () => clearInterval(interval);
  }, [fetchAllData, isAutoPolling]);

  // Fetch ML Model Info on Mount
  useEffect(() => {
    api.getModelInfo().then(setModelInfo).catch(() => null);
  }, []);

  // Run AI Diagnostic Inference
  const runDiagnosticInference = useCallback(async () => {
    setMlLoading(true);
    const target = selectedTrack || 'TRK-01';
    try {
      const pred = await api.predictTrackFault(target, 20);
      setActivePrediction(pred);
      setMlWarmingUp(null);
      // Retrieve updated prediction history
      const hist = await api.getPredictionHistory(20);
      setPredictionHistory(hist.predictions);
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : String(err);
      if (errStr.includes('409')) {
        try {
          const jsonStart = errStr.indexOf('{');
          if (jsonStart !== -1) {
            const parsed = JSON.parse(errStr.slice(jsonStart));
            const d = parsed.detail;
            setMlWarmingUp({
              message: d?.message || 'Continuous telemetry buffer warming up...',
              validSamples: d?.valid_samples ?? 0,
              requiredSamples: d?.required_samples ?? 20,
              trackId: d?.track_segment_id || target,
            });
          } else {
            setMlWarmingUp({
              message: 'Buffer warming up: awaiting continuous telemetry window.',
              validSamples: 0,
              requiredSamples: 20,
              trackId: target,
            });
          }
        } catch {
          setMlWarmingUp({
            message: 'Buffer warming up: awaiting continuous telemetry window.',
            validSamples: 0,
            requiredSamples: 20,
            trackId: target,
          });
        }
      } else {
        console.error('Inference error:', err);
      }
    } finally {
      setMlLoading(false);
    }
  }, [selectedTrack]);

  // Auto-run inference when viewing the faults tab or when active track changes
  useEffect(() => {
    if (activeTab === 'faults') {
      runDiagnosticInference();
    }
  }, [activeTab, selectedTrack, runDiagnosticInference]);

  // Simulator actions
  const handleSimulatorControl = async (action: string, profile?: string) => {
    setActionLoading(true);
    try {
      const updated = await api.controlSimulator({ action, profile });
      setSimulatorStatus(updated);
      await fetchAllData();
      if (activeTab === 'faults') {
        setTimeout(runDiagnosticInference, 500);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Simulator command failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Format telemetry readings for Recharts
  const chartData = useMemo(() => {
    return historyReadings.map((r) => {
      const date = new Date(r.timestamp);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return {
        time: timeStr,
        trackId: r.track_segment_id,
        vx: r.vibration_x,
        vy: r.vibration_y,
        vz: r.vibration_z,
        rms: r.vibration_rms,
        temp: r.temperature_c,
        hum: r.humidity_pct,
        speed: r.train_speed_kmh,
        status: r.status,
      };
    });
  }, [historyReadings]);

  // Active track selection display
  const activeReading = useMemo(() => {
    if (!latestReadings.length) return null;
    return latestReadings[0];
  }, [latestReadings]);

  // Diagnostic badge styling helper
  const getFaultBadgeStyle = (fault: string) => {
    switch (fault) {
      case 'NORMAL':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'RAIL_CORRUGATION':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'IMPACT_DEFECT':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      case 'THERMAL_STRESS':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="flex h-screen w-screen bg-[#070a11] text-slate-100 overflow-hidden font-sans">
      {/* ==================================================================== */}
      {/* SIDEBAR NAVIGATION                                                   */}
      {/* ==================================================================== */}
      <aside className="w-64 flex-shrink-0 bg-[#0b0f19] border-r border-slate-800 flex flex-col justify-between">
        <div>
          {/* Logo / System Title */}
          <div className="h-16 flex items-center px-6 border-b border-slate-800/80 gap-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-wider text-slate-100 uppercase">Railway AI</h1>
              <span className="text-[10px] font-mono text-cyan-400 block tracking-wider">SMART TRACK MONITOR</span>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="p-4 space-y-1 overflow-y-auto max-h-[calc(100vh-270px)]">
            <button
              onClick={() => setActiveTab('overview')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'overview'
                  ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Gauge className="w-4 h-4 text-cyan-400" />
              <span>Track Health Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('tracks')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'tracks'
                  ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <BarChart3 className="w-4 h-4 text-blue-400" />
              <span>Track Analytics</span>
            </button>

            <button
              onClick={() => setActiveTab('vibration')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'vibration'
                  ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Radio className="w-4 h-4 text-purple-400" />
              <span>Vibration Telemetry</span>
            </button>

            <button
              onClick={() => setActiveTab('env')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'env'
                  ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Thermometer className="w-4 h-4 text-amber-400" />
              <span>Thermal & Humidity</span>
            </button>

            <button
              onClick={() => setActiveTab('historical')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'historical'
                  ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Historical & CSV</span>
            </button>

            <button
              onClick={() => setActiveTab('faults')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'faults'
                  ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <Brain className="w-4 h-4 text-cyan-400" />
                <span>AI Diagnostics</span>
              </div>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                Phase 3/5
              </span>
            </button>

            <button
              onClick={() => setActiveTab('prediction-history')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'prediction-history'
                  ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <History className="w-4 h-4 text-sky-400" />
              <span>Prediction Audit</span>
            </button>

            <button
              onClick={() => setActiveTab('alerts')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'alerts'
                  ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>Incident Alerts</span>
              </div>
              {summary && summary.active_alerts_count > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  {summary.active_alerts_count}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('transparency')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'transparency'
                  ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-teal-400" />
              <span>Model Transparency</span>
            </button>

            <button
              onClick={() => setActiveTab('simulator')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'simulator'
                  ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Sliders className="w-4 h-4 text-emerald-400" />
              <span>Simulator Control</span>
            </button>
          </nav>

          {/* Track Segment Selector */}
          <div className="px-4 py-3 mx-4 rounded-lg bg-slate-900/90 border border-slate-800/90">
            <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1.5">
              Active Monitored Track
            </label>
            <select
              value={selectedTrack}
              onChange={(e) => setSelectedTrack(e.target.value)}
              className="w-full bg-[#070a11] border border-slate-700 rounded-md text-xs text-slate-200 py-1.5 px-2 focus:outline-none focus:border-cyan-500"
            >
              <option value="">All Tracks (Combined Network)</option>
              <option value="TRK-01">TRK-01: North Corridor Express</option>
              <option value="TRK-02">TRK-02: East Freight Loop</option>
              <option value="TRK-03">TRK-03: Mountain Pass Section</option>
              <option value="TRK-04">TRK-04: South Coastal Transit</option>
            </select>
          </div>
        </div>

        {/* Phase 3 System Status Card */}
        <div className="p-4 border-t border-slate-800/80 space-y-2">
          <div className="bg-slate-900/80 rounded-lg p-3 border border-slate-800">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-slate-300">Phase 3 ML Active</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                RF + IForest
              </span>
            </div>
            <p className="text-[10px] text-slate-500 leading-tight">
              Holdout Accuracy: {modelInfo ? `${(modelInfo.evaluation_metrics.accuracy * 100).toFixed(1)}%` : '--'} (Zero-Leakage)
            </p>
          </div>
        </div>
      </aside>

      {/* ==================================================================== */}
      {/* MAIN CONTENT AREA                                                    */}
      {/* ==================================================================== */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-[#0b0f19] border-b border-slate-800 flex items-center justify-between px-8 z-10">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-semibold text-slate-200">
              Railway Track Diagnostic & AI Monitoring Console
            </h2>

            {/* MANDATORY PROMINENT SIMULATION DATA BADGE */}
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
              <span>DATA SOURCE: SYNTHETIC SIMULATION BENCHMARK (MOCK)</span>
            </div>
          </div>

          {/* Status Controls */}
          <div className="flex items-center gap-3">
            {/* Live Polling Toggle */}
            <button
              onClick={() => setIsAutoPolling(!isAutoPolling)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono border transition-colors ${
                isAutoPolling
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
              title="Toggle automatic real-time telemetry polling"
            >
              {isAutoPolling ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5" />}
              <span>{isAutoPolling ? 'Live Stream: 2.5s' : 'Stream Paused'}</span>
            </button>

            {/* Manual Refresh Button */}
            <button
              onClick={fetchAllData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            {/* Backend Connection Indicator */}
            {health ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>API Connected</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono">
                <AlertOctagon className="w-3.5 h-3.5" />
                <span>API Offline</span>
              </div>
            )}
          </div>
        </header>

        {/* Global Error Banner */}
        {error && (
          <div className="bg-rose-900/40 border-b border-rose-700/50 px-8 py-2 text-xs font-mono text-rose-300 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>Synchronization Warning: {error}</span>
            </span>
            <button onClick={fetchAllData} className="underline hover:text-white">Retry</button>
          </div>
        )}

        {/* Dashboard Body */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {/* ================================================================ */}
          {/* TOP KPI CARDS                                                    */}
          {/* ================================================================ */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: System Vibration RMS */}
            <div className="p-4 rounded-xl bg-[#101623] border border-slate-800 hover:border-cyan-500/40 transition-colors">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium tracking-wide">SYSTEM VIBRATION RMS</span>
                <Radio className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-slate-100">
                  {summary ? summary.system_average_vibration_rms.toFixed(3) : '0.000'}
                </span>
                <span className="text-xs text-slate-400">g</span>
              </div>
              <span className="text-[11px] text-cyan-400 font-mono mt-1 block">
                {activeReading ? `Vx: ${activeReading.vibration_x}g | Vy: ${activeReading.vibration_y}g | Vz: ${activeReading.vibration_z}g` : 'Averaged 3-axis'}
              </span>
            </div>

            {/* KPI 2: Rail Surface Temperature */}
            <div className="p-4 rounded-xl bg-[#101623] border border-slate-800 hover:border-amber-500/40 transition-colors">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium tracking-wide">RAIL SURFACE TEMP</span>
                <Thermometer className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-slate-100">
                  {summary ? summary.system_average_temperature_c.toFixed(1) : '--'}
                </span>
                <span className="text-xs text-slate-400">°C</span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono mt-1 block">
                Humidity: {summary ? `${summary.system_average_humidity_pct}%` : '--%'}
              </span>
            </div>

            {/* KPI 3: Overall Track Health Index */}
            <div className="p-4 rounded-xl bg-[#101623] border border-slate-800 hover:border-emerald-500/40 transition-colors">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium tracking-wide">NETWORK HEALTH INDEX</span>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-2xl font-bold font-mono ${
                    summary && summary.overall_health_score > 85
                      ? 'text-emerald-400'
                      : summary && summary.overall_health_score > 60
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {summary ? summary.overall_health_score.toFixed(1) : '--'}
                </span>
                <span className="text-xs text-slate-400">/ 100</span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono mt-1 block">
                Status: {summary?.network_status || 'NOMINAL'}
              </span>
            </div>

            {/* KPI 4: Active Alerts */}
            <div className="p-4 rounded-xl bg-[#101623] border border-slate-800 hover:border-rose-500/40 transition-colors">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium tracking-wide">ACTIVE INCIDENT ALERTS</span>
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-2xl font-bold font-mono ${
                    summary && summary.active_alerts_count > 0 ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {summary ? summary.active_alerts_count : 0}
                </span>
                <span className="text-xs text-slate-400">unacknowledged</span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono mt-1 block">
                Tracks Monitored: {summary ? summary.total_tracks_monitored : 4}
              </span>
            </div>
          </div>

          {/* ================================================================ */}
          {/* TAB 1: OVERVIEW & REAL-TIME CHARTS                               */}
          {/* ================================================================ */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Interactive Telemetry Chart (Recharts) */}
              <div className="p-6 rounded-xl bg-[#101623] border border-slate-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-200">
                        Live 3-Axis Vibration Acceleration Telemetry (Vx, Vy, Vz)
                      </h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                        {selectedTrack || 'ALL TRACKS'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      Units: g-force (m/s² equivalent) • Retrieved live from GET /api/v1/telemetry/history
                    </p>
                  </div>

                  {/* Legend */}
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <span className="flex items-center gap-1.5 text-cyan-400">
                      <span className="w-2.5 h-0.5 bg-cyan-400 inline-block"></span> Lateral (Vx)
                    </span>
                    <span className="flex items-center gap-1.5 text-purple-400">
                      <span className="w-2.5 h-0.5 bg-purple-400 inline-block"></span> Longitudinal (Vy)
                    </span>
                    <span className="flex items-center gap-1.5 text-amber-400">
                      <span className="w-2.5 h-0.5 bg-amber-400 inline-block"></span> Vertical Impact (Vz)
                    </span>
                  </div>
                </div>

                {/* Chart Box */}
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="time" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 11 }} />
                      <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 11 }} domain={[0, 'auto']} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0b0f19',
                          borderColor: '#334155',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        labelStyle={{ color: '#94a3b8' }}
                      />
                      <Line type="monotone" dataKey="vx" stroke="#06b6d4" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                      <Line type="monotone" dataKey="vy" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                      <Line type="monotone" dataKey="vz" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Monitored Track Segments Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-200">
                    Track Segment Status Matrix (GET /api/v1/dashboard/summary)
                  </h3>
                  <span className="text-xs text-slate-500 font-mono">Last Synced: {lastRefreshed}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {summary?.tracks.map((track) => (
                    <div
                      key={track.track_segment_id}
                      onClick={() => setSelectedTrack(selectedTrack === track.track_segment_id ? '' : track.track_segment_id)}
                      className={`p-4 rounded-xl bg-[#101623] border cursor-pointer transition-all ${
                        selectedTrack === track.track_segment_id
                          ? 'border-cyan-500 bg-cyan-950/20'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-mono font-bold text-cyan-300">{track.track_segment_id}</span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                            track.status === 'NORMAL'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : track.status === 'WARNING'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {track.status}
                        </span>
                      </div>

                      <h4 className="text-xs font-medium text-slate-200 truncate mb-3" title={track.track_name}>
                        {track.track_name}
                      </h4>

                      <div className="space-y-1.5 font-mono text-[11px] text-slate-400">
                        <div className="flex justify-between">
                          <span>RMS Acceleration:</span>
                          <span className="text-slate-200">{track.latest_rms.toFixed(3)}g</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Surface Temp:</span>
                          <span className="text-slate-200">{track.latest_temp.toFixed(1)}°C</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Train Speed:</span>
                          <span className="text-slate-200">{track.latest_speed.toFixed(0)} km/h</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Active Alerts:</span>
                          <span className={track.active_alerts > 0 ? 'text-rose-400 font-bold' : 'text-slate-500'}>
                            {track.active_alerts}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* TAB 2: VIBRATION TELEMETRY DEEP-DIVE                             */}
          {/* ================================================================ */}
          {activeTab === 'vibration' && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl bg-[#101623] border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">
                      Multi-Axis Acceleration Signal (Vx, Vy, Vz)
                    </h3>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      Physical sensors mounted on bogie/axle-box • Continuous synthetic acceleration telemetry
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-400">Filter Segment:</span>
                    <select
                      value={selectedTrack}
                      onChange={(e) => setSelectedTrack(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 py-1 px-2 font-mono"
                    >
                      <option value="">All Tracks</option>
                      <option value="TRK-01">TRK-01</option>
                      <option value="TRK-02">TRK-02</option>
                      <option value="TRK-03">TRK-03</option>
                      <option value="TRK-04">TRK-04</option>
                    </select>
                  </div>
                </div>

                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="time" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 11 }} />
                      <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0b0f19',
                          borderColor: '#334155',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Line type="monotone" dataKey="vx" stroke="#06b6d4" strokeWidth={2} name="Lateral (Vx)" dot={{ r: 2 }} isAnimationActive={false} />
                      <Line type="monotone" dataKey="vy" stroke="#8b5cf6" strokeWidth={2} name="Longitudinal (Vy)" dot={{ r: 2 }} isAnimationActive={false} />
                      <Line type="monotone" dataKey="vz" stroke="#f59e0b" strokeWidth={2} name="Vertical Impact (Vz)" dot={{ r: 2 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Vector RMS Acceleration Chart */}
              <div className="p-6 rounded-xl bg-[#101623] border border-slate-800 space-y-4">
                <h3 className="text-sm font-semibold text-slate-200">
                  Vector Magnitude RMS Energy: √(Vx² + Vy² + Vz²)/3
                </h3>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="time" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 11 }} />
                      <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0b0f19',
                          borderColor: '#334155',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Line type="monotone" dataKey="rms" stroke="#10b981" strokeWidth={2.5} name="Total RMS (g)" dot={{ r: 2 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* TAB 3: ENVIRONMENTAL MONITORING (Temp & Humidity)                */}
          {/* ================================================================ */}
          {activeTab === 'env' && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl bg-[#101623] border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">
                      Rail Surface Temperature (°C) vs Ambient Humidity (%)
                    </h3>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      Monitored for thermal expansion buckling hazard and moisture conductivity
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <span className="text-amber-400">● Rail Surface Temp (°C)</span>
                    <span className="text-sky-400">● Relative Humidity (%)</span>
                  </div>
                </div>

                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="time" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 11 }} />
                      <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 11 }} domain={[0, 100]} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0b0f19',
                          borderColor: '#334155',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Line type="monotone" dataKey="temp" stroke="#f59e0b" strokeWidth={2} name="Temperature (°C)" dot={{ r: 2 }} isAnimationActive={false} />
                      <Line type="monotone" dataKey="hum" stroke="#38bdf8" strokeWidth={2} name="Humidity (%)" dot={{ r: 2 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* TAB 4: PHASE 3 AI FAULT DETECTION & DIAGNOSTIC CONSOLE           */}
          {/* ================================================================ */}
          {activeTab === 'faults' && (
            <div className="space-y-6">
              {/* Header Action Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-[#101623] border border-slate-800 gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                    <Brain className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">
                      Multi-Class Track Fault Classification & Anomaly Detection
                    </h3>
                    <p className="text-xs text-slate-500 font-mono">
                      Rolling window feature extraction (W=20) scored via RandomForest + IsolationForest
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={runDiagnosticInference}
                    disabled={mlLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs font-mono transition-colors disabled:opacity-50"
                  >
                    <Sparkles className={`w-4 h-4 ${mlLoading ? 'animate-spin' : ''}`} />
                    <span>Score Current Buffer</span>
                  </button>
                </div>
              </div>

              {/* Buffer Warming Up Banner (Sampling Continuity Guard) */}
              {mlWarmingUp && (
                <div className="p-5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                        <Clock className="w-5 h-5 animate-pulse" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-amber-300">Continuous Telemetry Buffer Warming Up</h4>
                        <p className="text-xs text-slate-400 font-mono">
                          Track {mlWarmingUp.trackId}: {mlWarmingUp.validSamples} / {mlWarmingUp.requiredSamples} contiguous readings available. Dormancy gap detected.
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded border bg-amber-500/20 text-amber-300 border-amber-500/40 self-start sm:self-auto">
                      WARMING UP ({mlWarmingUp.validSamples}/{mlWarmingUp.requiredSamples})
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono text-slate-400">
                      <span>Contiguous Sampling Progress</span>
                      <span>
                        {Math.round((mlWarmingUp.validSamples / mlWarmingUp.requiredSamples) * 100)}% ({mlWarmingUp.requiredSamples - mlWarmingUp.validSamples} ticks remaining)
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-amber-400 h-full transition-all duration-500"
                        style={{ width: `${Math.min(100, (mlWarmingUp.validSamples / mlWarmingUp.requiredSamples) * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}

              {/* Main AI Diagnostic Output Card */}
              {activePrediction && (
                <div className="p-6 rounded-xl bg-[#101623] border border-slate-800 space-y-6">
                  {/* Top Diagnostic Row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Diagnosis 1: Predicted Fault */}
                    <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                      <span className="text-xs font-mono text-slate-400 uppercase block">AI Fault Classification</span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-mono font-bold px-3 py-1 rounded-md border ${getFaultBadgeStyle(
                            activePrediction.predicted_fault
                          )}`}
                        >
                          {activePrediction.predicted_fault}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-slate-400 pt-1">
                        Track: <span className="text-cyan-300 font-bold">{activePrediction.track_segment_id}</span> • Window: {activePrediction.window_size} samples
                      </div>
                    </div>

                    {/* Diagnosis 2: Classifier Confidence */}
                    <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                      <span className="text-xs font-mono text-slate-400 uppercase block">Calibrated Classifier Confidence</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold font-mono text-cyan-300">
                          {(activePrediction.confidence_score * 100).toFixed(1)}%
                        </span>
                        <span className="text-xs text-slate-500 font-mono">predict_proba</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-cyan-400 h-full transition-all duration-500"
                          style={{ width: `${activePrediction.confidence_score * 100}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Diagnosis 3: IsolationForest Anomaly Score */}
                    <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-slate-400 uppercase">IsolationForest Anomaly Index</span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                            activePrediction.is_anomaly
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          }`}
                        >
                          {activePrediction.is_anomaly ? 'ANOMALOUS' : 'NOMINAL BASELINE'}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`text-2xl font-bold font-mono ${
                            activePrediction.is_anomaly ? 'text-rose-400' : 'text-emerald-400'
                          }`}
                        >
                          {activePrediction.anomaly_score.toFixed(3)}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">
                          Limit: {activePrediction.anomaly_threshold.toFixed(2)}
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${
                            activePrediction.is_anomaly ? 'bg-rose-500' : 'bg-emerald-400'
                          }`}
                          style={{ width: `${Math.min(100, activePrediction.anomaly_score * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  {/* Multi-Class Probability Distribution */}
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                    <span className="text-xs font-medium text-slate-300 block">Class Probability Distribution:</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {Object.entries(activePrediction.class_probabilities).map(([cls, prob]) => (
                        <div key={cls} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                          <div className="flex justify-between text-xs font-mono mb-1">
                            <span className="text-slate-400">{cls}</span>
                            <span className="text-slate-200 font-bold">{(prob * 100).toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-cyan-500 h-full transition-all duration-500"
                              style={{ width: `${prob * 100}%` }}
                            ></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Non-Operational Safety Recommendation Advisory */}
                  <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/80 flex items-start gap-3">
                    <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span className="text-xs font-semibold text-amber-300 uppercase tracking-wide">
                        Non-Operational Benchmark Inspection Advisory
                      </span>
                      <p className="text-xs text-slate-300 leading-relaxed font-mono">
                        {activePrediction.maintenance_recommendation}
                      </p>
                      <span className="text-[10px] text-slate-500 font-mono block pt-1">
                        {activePrediction.safety_disclaimer}
                      </span>
                    </div>
                  </div>

                  {/* Live Extracted Features Snapshot */}
                  <div className="space-y-3">
                    <span className="text-xs font-medium text-slate-300 block">
                      Live Extracted Signal Features Snapshot (W=20 readings):
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 font-mono text-xs">
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Vz Kurtosis</span>
                        <span className="text-slate-200 font-bold">{activePrediction.features_snapshot.vz_kurtosis}</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Vz Crest Factor</span>
                        <span className="text-slate-200 font-bold">{activePrediction.features_snapshot.vz_crest_factor}</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Spatial RMS</span>
                        <span className="text-cyan-300 font-bold">{activePrediction.features_snapshot.v_total_rms}g</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Temp Mean</span>
                        <span className="text-amber-300 font-bold">{activePrediction.features_snapshot.temp_mean}°C</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Temp Slope</span>
                        <span className="text-slate-200 font-bold">{activePrediction.features_snapshot.temp_slope_c_per_min} °C/min</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Window Duration</span>
                        <span className="text-slate-200 font-bold">{activePrediction.features_snapshot.window_duration_seconds}s</span>
                      </div>
                    </div>
                  </div>

                  {/* AI Feature Explainability (Standardized Nominal Baseline Z-Scores) */}
                  {activePrediction.feature_deviations && (
                    <div className="pt-2 border-t border-slate-800">
                      <AiFeatureExplanationChart deviations={activePrediction.feature_deviations} />
                    </div>
                  )}
                </div>
              )}

              {/* Empirical Model Evaluation Matrix (Real Holdout Results) */}
              {modelInfo && (
                <div className="p-6 rounded-xl bg-[#101623] border border-slate-800 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-200">
                        Empirical Holdout Model Evaluation Matrix (GET /api/v1/ml/model-info)
                      </h3>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">
                        Evaluated strictly on independent holdout test runs with zero window leakage
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-cyan-300">
                      Seed: {modelInfo.random_seed} • Model v{modelInfo.model_version}
                    </span>
                  </div>

                  {/* High Level Holdout KPI Badges */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-slate-500 block text-[11px]">Holdout Accuracy:</span>
                      <span className="text-emerald-400 font-bold text-lg">
                        {(modelInfo.evaluation_metrics.accuracy * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-slate-500 block text-[11px]">Holdout F1-Macro:</span>
                      <span className="text-cyan-300 font-bold text-lg">
                        {modelInfo.evaluation_metrics.f1_macro.toFixed(4)}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-slate-500 block text-[11px]">IsolationForest Accuracy:</span>
                      <span className="text-purple-300 font-bold text-lg">
                        {(modelInfo.anomaly_calibration.holdout_anomaly_detection_accuracy * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="text-slate-500 block text-[11px]">Anomaly Threshold:</span>
                      <span className="text-amber-400 font-bold text-lg">
                        {modelInfo.anomaly_calibration.calibrated_threshold.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Confusion Matrix Visualization */}
                  <div className="space-y-2 pt-2">
                    <span className="text-xs font-medium text-slate-300 block">
                      Holdout Confusion Matrix (Actual Rows vs Predicted Columns):
                    </span>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs font-mono text-center border-collapse">
                        <thead>
                          <tr className="bg-slate-900/80 text-slate-400">
                            <th className="p-2 border border-slate-800 text-left">True \ Pred</th>
                            {modelInfo.classes.map((cls) => (
                              <th key={cls} className="p-2 border border-slate-800">{cls}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {modelInfo.evaluation_metrics.confusion_matrix.map((row, rowIdx) => (
                            <tr key={modelInfo.classes[rowIdx]} className="hover:bg-slate-900/40">
                              <td className="p-2 border border-slate-800 text-left font-bold text-slate-300">
                                {modelInfo.classes[rowIdx]}
                              </td>
                              {row.map((cell, colIdx) => (
                                <td
                                  key={colIdx}
                                  className={`p-2 border border-slate-800 font-bold ${
                                    rowIdx === colIdx
                                      ? cell > 0
                                        ? 'bg-emerald-500/20 text-emerald-300'
                                        : 'text-slate-600'
                                      : cell > 0
                                      ? 'bg-rose-500/20 text-rose-300'
                                      : 'text-slate-700'
                                  }`}
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Prediction History Table */}
              <div className="p-6 rounded-xl bg-[#101623] border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-200">
                    AI Inference Prediction History (GET /api/v1/ml/predictions/history)
                  </h3>
                  <span className="text-xs text-slate-500 font-mono">Buffered predictions</span>
                </div>

                {predictionHistory.length === 0 ? (
                  <div className="p-6 text-center text-xs font-mono text-slate-500 rounded-lg bg-slate-900 border border-slate-800">
                    No predictions logged in current session. Click "Score Current Buffer" above to run inference.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-900 text-slate-400">
                          <th className="p-2.5 border border-slate-800">Prediction ID</th>
                          <th className="p-2.5 border border-slate-800">Track Segment</th>
                          <th className="p-2.5 border border-slate-800">Predicted Fault</th>
                          <th className="p-2.5 border border-slate-800">Classifier Confidence</th>
                          <th className="p-2.5 border border-slate-800">Anomaly Index</th>
                          <th className="p-2.5 border border-slate-800">Anomaly State</th>
                          <th className="p-2.5 border border-slate-800">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {predictionHistory.map((item) => (
                          <tr key={item.prediction_id} className="hover:bg-slate-900/50">
                            <td className="p-2.5 border border-slate-800 text-slate-400">{item.prediction_id}</td>
                            <td className="p-2.5 border border-slate-800 text-cyan-300 font-bold">{item.track_segment_id}</td>
                            <td className="p-2.5 border border-slate-800">
                              <span className={`px-2 py-0.5 rounded text-[10px] border ${getFaultBadgeStyle(item.predicted_fault)}`}>
                                {item.predicted_fault}
                              </span>
                            </td>
                            <td className="p-2.5 border border-slate-800 text-slate-200">
                              {(item.confidence_score * 100).toFixed(1)}%
                            </td>
                            <td className="p-2.5 border border-slate-800 text-slate-300">
                              {item.anomaly_score.toFixed(3)}
                            </td>
                            <td className="p-2.5 border border-slate-800">
                              <span className={item.is_anomaly ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                                {item.is_anomaly ? '● Anomaly' : '● Baseline'}
                              </span>
                            </td>
                            <td className="p-2.5 border border-slate-800 text-slate-500">
                              {new Date(item.timestamp).toLocaleTimeString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* TAB: TRACK SEGMENT ANALYTICS (Phase 5)                           */}
          {/* ================================================================ */}
          {activeTab === 'tracks' && <TrackAnalyticsPage />}

          {/* ================================================================ */}
          {/* TAB: HISTORICAL TELEMETRY & CSV EXPORT (Phase 5)                 */}
          {/* ================================================================ */}
          {activeTab === 'historical' && <HistoricalTelemetryPage />}

          {/* ================================================================ */}
          {/* TAB: PREDICTION AUDIT & EXPLAINABILITY (Phase 5)                 */}
          {/* ================================================================ */}
          {activeTab === 'prediction-history' && <PredictionHistoryPage />}

          {/* ================================================================ */}
          {/* TAB 5: ADVANCED ALERTS MANAGEMENT                                */}
          {/* ================================================================ */}
          {activeTab === 'alerts' && (
            <AdvancedAlertsSection onAlertUpdated={fetchAllData} />
          )}

          {/* ================================================================ */}
          {/* TAB: MODEL TRANSPARENCY & HOLD-OUT METRICS (Phase 5)             */}
          {/* ================================================================ */}
          {activeTab === 'transparency' && <ModelTransparencyPage />}

          {/* ================================================================ */}
          {/* TAB 6: SIMULATOR CONTROL BENCH                                   */}
          {/* ================================================================ */}
          {activeTab === 'simulator' && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl bg-[#101623] border border-slate-800 space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">
                    Synthetic Sensor Simulator Engine Control
                  </h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    POST /api/v1/simulator/control • Dynamically inject track faults and adjust generation speed
                  </p>
                </div>

                {/* State Overview */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 block mb-1">Engine State:</span>
                    <span className={simulatorStatus?.is_running ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                      {simulatorStatus?.is_running ? 'ACTIVE (STREAMING)' : 'PAUSED'}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 block mb-1">Active Scenario Profile:</span>
                    <span className="text-cyan-300 font-bold uppercase">{simulatorStatus?.active_profile}</span>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-slate-400 block mb-1">Total Synthesized Readings:</span>
                    <span className="text-slate-200 font-bold">{simulatorStatus?.total_readings_generated}</span>
                  </div>
                </div>

                {/* Engine Actions */}
                <div className="space-y-3">
                  <span className="text-xs font-medium text-slate-300 block">Simulation Execution Controls:</span>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => handleSimulatorControl(simulatorStatus?.is_running ? 'stop' : 'start')}
                      disabled={actionLoading}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono font-medium transition-colors ${
                        simulatorStatus?.is_running
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
                      }`}
                    >
                      {simulatorStatus?.is_running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      <span>{simulatorStatus?.is_running ? 'Pause Simulator' : 'Start Simulator'}</span>
                    </button>

                    <button
                      onClick={() => handleSimulatorControl('step')}
                      disabled={actionLoading}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono border border-slate-700 transition-colors"
                    >
                      <StepForward className="w-4 h-4 text-cyan-400" />
                      <span>Single Step (Tick All Tracks)</span>
                    </button>

                    <button
                      onClick={() => handleSimulatorControl('reset')}
                      disabled={actionLoading}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono border border-slate-700 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4 text-amber-400" />
                      <span>Reset Buffer History</span>
                    </button>
                  </div>
                </div>

                {/* Scenario Profiles Injection */}
                <div className="space-y-3 pt-4 border-t border-slate-800">
                  <span className="text-xs font-medium text-slate-300 block">Inject Track Scenario Profile:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { id: 'nominal', title: 'Nominal Baseline', desc: 'Standard operating vibration and thermal ranges', color: 'emerald' },
                      { id: 'corrugation', title: 'Rail Corrugation', desc: 'Periodic vertical oscillations (Vz ~0.50-0.70g)', color: 'amber' },
                      { id: 'impact_defect', title: 'Wheel Flat / Impact', desc: 'Sharp vertical acceleration peaks (Vz >0.85g)', color: 'rose' },
                      { id: 'thermal_stress', title: 'Thermal Expansion Stress', desc: 'High rail surface temperature (>45°C)', color: 'orange' },
                    ].map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleSimulatorControl('set_profile', p.id)}
                        disabled={actionLoading}
                        className={`p-3.5 rounded-xl border text-left transition-all ${
                          simulatorStatus?.active_profile === p.id
                            ? 'bg-cyan-500/10 border-cyan-500/50 shadow-sm'
                            : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-slate-200">{p.title}</span>
                          {simulatorStatus?.active_profile === p.id && (
                            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-tight">{p.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
