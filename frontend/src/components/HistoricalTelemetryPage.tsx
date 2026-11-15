import React, { useState, useEffect, useMemo } from 'react';
import {
  Database,
  Download,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { api } from '../services/api';
import { TelemetryReading, TrackSegmentItem } from '../types/telemetry';

export const HistoricalTelemetryPage: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | 'all'>('24h');
  const [selectedTrack, setSelectedTrack] = useState<string>(''); // empty = All
  const [tracks, setTracks] = useState<TrackSegmentItem[]>([]);
  const [readings, setReadings] = useState<TelemetryReading[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [downloadingCsv, setDownloadingCsv] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load track list
  useEffect(() => {
    api.getTracks().then(setTracks).catch(() => null);
  }, []);

  // Fetch historical telemetry from PostgreSQL based on filters
  const fetchHistoricalData = async () => {
    setLoading(true);
    try {
      const res = await api.getTelemetryHistory(
        selectedTrack || undefined,
        500,
        'database',
        timeRange,
      );
      setReadings(res.readings);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to query PostgreSQL historical telemetry');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistoricalData();
  }, [timeRange, selectedTrack]);

  // Handle CSV export download
  const handleExportCsv = async () => {
    setDownloadingCsv(true);
    try {
      await api.downloadTelemetryCsv(selectedTrack || undefined, timeRange);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'CSV export failed');
    } finally {
      setDownloadingCsv(false);
    }
  };

  // Prepare chart series data
  const chartData = useMemo(() => {
    return readings.map((r) => {
      const d = new Date(r.timestamp);
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return {
        timestamp: r.timestamp,
        time: timeStr,
        trackId: r.track_segment_id,
        rms: r.vibration_rms,
        vx: r.vibration_x,
        vy: r.vibration_y,
        vz: r.vibration_z,
        temp: r.temperature_c,
        hum: r.humidity_pct,
        speed: r.train_speed_kmh,
        status: r.status,
      };
    });
  }, [readings]);

  return (
    <div className="space-y-6">
      {/* Control Header & Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0c1220] border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              PostgreSQL Telemetry History
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 flex items-center gap-1">
              <Database className="w-3 h-3 text-cyan-400" />
              Persistent Storage
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">Historical Sensor Telemetry</h2>
          <p className="text-xs text-slate-400">
            Query and analyze historical multi-axis vibration, thermometry, and operational speeds over selectable time horizons.
          </p>
        </div>

        {/* Filter Controls & CSV Export */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Time Range Selector */}
          <div className="flex items-center rounded-xl bg-slate-900 border border-slate-800 p-1 text-xs">
            {(['1h', '6h', '24h', 'all'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 rounded-lg font-mono font-medium transition-all ${
                  timeRange === range
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {range.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Track Filter Dropdown */}
          <select
            value={selectedTrack}
            onChange={(e) => setSelectedTrack(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500/50"
          >
            <option value="">All Track Segments</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id} ({t.name.split(' ')[0]})
              </option>
            ))}
          </select>

          {/* Refresh Button */}
          <button
            onClick={fetchHistoricalData}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all disabled:opacity-50"
            title="Refresh database records"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>

          {/* CSV Export Button */}
          <button
            onClick={handleExportCsv}
            disabled={downloadingCsv}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition-all shadow-sm hover:shadow-emerald-500/10 disabled:opacity-50"
          >
            {downloadingCsv ? (
              <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
            ) : (
              <Download className="w-4 h-4 text-emerald-400" />
            )}
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Security Note on CSV Export */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900/50 border border-slate-800/80 text-[11px] text-slate-400">
        <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
        <span>
          CSV exports follow RFC 4180 standards with automatic formula injection mitigation (cells starting with <code className="text-cyan-300 font-mono">=</code>, <code className="text-cyan-300 font-mono">+</code>, <code className="text-cyan-300 font-mono">-</code>, or <code className="text-cyan-300 font-mono">@</code> are escaped for safe spreadsheet handling).
        </span>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
          {error}
        </div>
      )}

      {/* Historical Telemetry Charts */}
      {loading ? (
        <div className="p-16 text-center text-slate-500 text-xs flex flex-col items-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
          <span>Loading historical telemetry records from PostgreSQL...</span>
        </div>
      ) : readings.length === 0 ? (
        <div className="p-16 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl bg-[#0c1220]">
          <Database className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="font-semibold text-slate-400 text-sm">No historical records found for this time range.</p>
          <p className="text-[11px] text-slate-500 mt-1">
            Try switching the time range filter to "24H" or "ALL", or run the simulation to generate telemetry.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 1. Vibration Dynamics Chart */}
          <div className="p-5 rounded-2xl bg-[#0c1220] border border-slate-800 shadow-lg space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <div>
                <h3 className="text-sm font-bold text-slate-200">Historical Vibration Dynamics (g)</h3>
                <span className="text-[10px] text-slate-400">
                  Showing {readings.length} records • Lateral (Vx), Longitudinal (Vy), Vertical (Vz), and Spatial RMS
                </span>
              </div>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                PostgreSQL Queried
              </span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
                  <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} domain={['auto', 'auto']} unit="g" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '11px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Line type="monotone" dataKey="rms" stroke="#38bdf8" name="RMS Vibration" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="vz" stroke="#a855f7" name="Vz (Vertical)" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="vx" stroke="#f43f5e" name="Vx (Lateral)" strokeWidth={1} dot={false} opacity={0.7} />
                  <Line type="monotone" dataKey="vy" stroke="#10b981" name="Vy (Longitudinal)" strokeWidth={1} dot={false} opacity={0.7} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 2. Temperature & Humidity Chart */}
          <div className="p-5 rounded-2xl bg-[#0c1220] border border-slate-800 shadow-lg space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <div>
                <h3 className="text-sm font-bold text-slate-200">Historical Environmental Tracking</h3>
                <span className="text-[10px] text-slate-400">
                  Rail Surface Temperature (°C) and Ambient Relative Humidity (%)
                </span>
              </div>
              <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                Thermal & Humidity
              </span>
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
                  <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="temp" stroke="#f59e0b" tick={{ fontSize: 10 }} domain={['auto', 'auto']} unit="°C" />
                  <YAxis yAxisId="hum" orientation="right" stroke="#06b6d4" tick={{ fontSize: 10 }} domain={[0, 100]} unit="%" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '11px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Line yAxisId="temp" type="monotone" dataKey="temp" stroke="#f59e0b" name="Rail Temperature (°C)" strokeWidth={2} dot={false} />
                  <Line yAxisId="hum" type="monotone" dataKey="hum" stroke="#06b6d4" name="Humidity (%)" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Historical Data Table */}
          <div className="p-5 rounded-2xl bg-[#0c1220] border border-slate-800 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-slate-200">Recent PostgreSQL Historical Telemetry Log</h3>
              <span className="text-[10px] font-mono text-slate-500">
                Displaying newest {Math.min(readings.length, 25)} of {readings.length} records
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase">
                    <th className="py-2 px-3">Timestamp (UTC)</th>
                    <th className="py-2 px-3">Track</th>
                    <th className="py-2 px-3 text-right">RMS (g)</th>
                    <th className="py-2 px-3 text-right">Vz (g)</th>
                    <th className="py-2 px-3 text-right">Temp (°C)</th>
                    <th className="py-2 px-3 text-right">Hum (%)</th>
                    <th className="py-2 px-3 text-right">Speed (km/h)</th>
                    <th className="py-2 px-3">Profile</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {readings.slice(-25).reverse().map((r) => {
                    const statusColor =
                      r.status === 'CRITICAL'
                        ? 'text-rose-400 bg-rose-500/10'
                        : r.status === 'WARNING'
                        ? 'text-amber-400 bg-amber-500/10'
                        : 'text-emerald-400 bg-emerald-500/10';

                    return (
                      <tr key={r.id} className="hover:bg-slate-900/50 transition-colors">
                        <td className="py-2 px-3 text-[11px] text-slate-400">
                          {new Date(r.timestamp).toISOString().replace('T', ' ').slice(0, 19)}
                        </td>
                        <td className="py-2 px-3 font-semibold text-cyan-300">{r.track_segment_id}</td>
                        <td className="py-2 px-3 text-right font-bold text-slate-100">{r.vibration_rms.toFixed(3)}</td>
                        <td className="py-2 px-3 text-right text-purple-300">{r.vibration_z.toFixed(3)}</td>
                        <td className="py-2 px-3 text-right text-amber-300">{r.temperature_c.toFixed(1)}</td>
                        <td className="py-2 px-3 text-right text-cyan-300">{r.humidity_pct.toFixed(1)}</td>
                        <td className="py-2 px-3 text-right text-slate-300">{r.train_speed_kmh.toFixed(1)}</td>
                        <td className="py-2 px-3 text-slate-400 capitalize">{r.simulation_profile}</td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${statusColor}`}>
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
