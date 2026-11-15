import React, { useState, useEffect } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import { Alert, TrackSegmentItem } from '../types/telemetry';

interface AdvancedAlertsSectionProps {
  onAlertUpdated?: () => void;
}

export const AdvancedAlertsSection: React.FC<AdvancedAlertsSectionProps> = ({ onAlertUpdated }) => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [summaryCounts, setSummaryCounts] = useState<{
    total: number;
    active: number;
    acknowledged: number;
    resolved: number;
  }>({ total: 0, active: 0, acknowledged: 0, resolved: 0 });

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED'>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [trackFilter, setTrackFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [tracks, setTracks] = useState<TrackSegmentItem[]>([]);

  // Resolve Modal State
  const [resolvingAlert, setResolvingAlert] = useState<Alert | null>(null);
  const [operatorName, setOperatorName] = useState<string>('Track Engineer');
  const [actionInProgress, setActionInProgress] = useState<boolean>(false);

  // Load tracks list
  useEffect(() => {
    api.getTracks().then(setTracks).catch(() => null);
  }, []);

  // Fetch filtered alerts
  const fetchAlerts = async () => {
    setRefreshing(true);
    try {
      const res = await api.getFilteredAlerts({
        severity: severityFilter,
        status: statusFilter,
        track_id: trackFilter || undefined,
        search: searchQuery.trim() || undefined,
        limit: 100,
      });

      setAlerts(res.alerts);
      setSummaryCounts({
        total: res.total,
        active: res.active_count,
        acknowledged: res.acknowledged_count,
        resolved: res.resolved_count || 0,
      });
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve safety alerts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [statusFilter, severityFilter, trackFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAlerts();
  };

  const handleAcknowledge = async (alertId: string) => {
    setActionInProgress(true);
    try {
      await api.acknowledgeAlert(alertId);
      await fetchAlerts();
      if (onAlertUpdated) onAlertUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to acknowledge alert');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleResolveConfirm = async () => {
    if (!resolvingAlert) return;
    setActionInProgress(true);
    try {
      await api.resolveAlert(resolvingAlert.id, operatorName.trim() || 'Track Inspector');
      setResolvingAlert(null);
      await fetchAlerts();
      if (onAlertUpdated) onAlertUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resolve alert');
    } finally {
      setActionInProgress(false);
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'HIGH':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'MEDIUM':
        return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
      default:
        return 'bg-slate-700/40 text-slate-300 border-slate-600/40';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Counters */}
      <div className="p-6 rounded-xl bg-[#101623] border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">
              Railway Safety Incidents & Alert Management
            </h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              GET /api/v1/alerts • Multi-criteria incident triage, acknowledgment and resolution
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchAlerts}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh Alerts</span>
            </button>
          </div>
        </div>

        {/* Counter Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div
            onClick={() => setStatusFilter('ALL')}
            className={`p-3 rounded-lg border cursor-pointer transition-all ${
              statusFilter === 'ALL'
                ? 'bg-slate-800 border-cyan-500/50 shadow-sm'
                : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
            }`}
          >
            <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">Total Incidents</span>
            <span className="text-xl font-bold font-mono text-slate-100">{summaryCounts.total}</span>
          </div>

          <div
            onClick={() => setStatusFilter('ACTIVE')}
            className={`p-3 rounded-lg border cursor-pointer transition-all ${
              statusFilter === 'ACTIVE'
                ? 'bg-rose-950/30 border-rose-500/50 shadow-sm'
                : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
            }`}
          >
            <span className="text-[10px] font-mono uppercase text-rose-400 block mb-1">Active (Open)</span>
            <span className="text-xl font-bold font-mono text-rose-400">{summaryCounts.active}</span>
          </div>

          <div
            onClick={() => setStatusFilter('ACKNOWLEDGED')}
            className={`p-3 rounded-lg border cursor-pointer transition-all ${
              statusFilter === 'ACKNOWLEDGED'
                ? 'bg-amber-950/30 border-amber-500/50 shadow-sm'
                : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
            }`}
          >
            <span className="text-[10px] font-mono uppercase text-amber-400 block mb-1">Acknowledged</span>
            <span className="text-xl font-bold font-mono text-amber-400">{summaryCounts.acknowledged}</span>
          </div>

          <div
            onClick={() => setStatusFilter('RESOLVED')}
            className={`p-3 rounded-lg border cursor-pointer transition-all ${
              statusFilter === 'RESOLVED'
                ? 'bg-emerald-950/30 border-emerald-500/50 shadow-sm'
                : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
            }`}
          >
            <span className="text-[10px] font-mono uppercase text-emerald-400 block mb-1">Resolved</span>
            <span className="text-xl font-bold font-mono text-emerald-400">{summaryCounts.resolved}</span>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-2">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 text-xs font-mono">
            {(['ALL', 'ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded border transition-colors ${
                  statusFilter === s
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-semibold'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Secondary Dropdown Filters and Search */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Severity Filter */}
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 py-1.5 px-2.5 font-mono focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical Only</option>
              <option value="HIGH">High Only</option>
              <option value="MEDIUM">Medium Only</option>
              <option value="LOW">Low Only</option>
            </select>

            {/* Track Filter */}
            <select
              value={trackFilter}
              onChange={(e) => setTrackFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 py-1.5 px-2.5 font-mono focus:outline-none focus:border-cyan-500"
            >
              <option value="">All Tracks</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id}: {t.name}
                </option>
              ))}
            </select>

            {/* Text Search */}
            <form onSubmit={handleSearchSubmit} className="flex items-center relative">
              <input
                type="text"
                placeholder="Search description, metric..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 py-1.5 pl-7 pr-2.5 font-mono w-48 sm:w-56 focus:outline-none focus:border-cyan-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 pointer-events-none" />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    fetchAlerts();
                  }}
                  className="absolute right-2 text-slate-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-3.5 rounded-lg bg-rose-950/20 border border-rose-500/30 text-rose-300 font-mono text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>{error}</span>
          </div>
          <button onClick={fetchAlerts} className="underline text-xs">Retry</button>
        </div>
      )}

      {/* Alerts List */}
      <div className="p-6 rounded-xl bg-[#101623] border border-slate-800 space-y-3">
        {loading ? (
          <div className="p-8 text-center text-slate-400 font-mono text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
            <span>Synchronizing alert database...</span>
          </div>
        ) : alerts.length === 0 ? (
          <div className="p-12 text-center rounded-lg bg-slate-900/60 border border-slate-800 text-slate-500 text-xs font-mono space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-400/60 mx-auto" />
            <p className="text-slate-300 font-semibold">No alerts match the active filter criteria.</p>
            <p className="text-slate-500">Track operations and telemetry parameters are within nominal safety limits.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => {
              const isResolved = alert.is_resolved;
              const isAcknowledged = alert.acknowledged;

              return (
                <div
                  key={alert.id}
                  className={`p-4 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    isResolved
                      ? 'bg-slate-900/30 border-slate-800/60 opacity-60'
                      : alert.severity === 'CRITICAL'
                      ? 'bg-rose-950/20 border-rose-500/40 hover:border-rose-500/70'
                      : alert.severity === 'HIGH'
                      ? 'bg-amber-950/20 border-amber-500/40 hover:border-amber-500/70'
                      : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Left Column: Details */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${getSeverityBadge(alert.severity)}`}>
                        {alert.severity}
                      </span>
                      <span className="text-xs font-mono text-cyan-400 font-bold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">
                        {alert.track_segment_id}
                      </span>
                      <span className="text-xs font-semibold text-slate-200">
                        {alert.title}
                      </span>

                      {/* Status Tags */}
                      {isResolved ? (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Resolved
                        </span>
                      ) : isAcknowledged ? (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                          <CheckSquare className="w-3 h-3" /> Acknowledged
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                          <AlertOctagon className="w-3 h-3" /> Open / Active
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed font-mono">
                      {alert.description}
                    </p>

                    {/* Telemetry trigger and timestamps */}
                    <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono text-slate-500 pt-1">
                      <span>Trigger: <strong className="text-slate-300">{alert.metric} = {alert.value}</strong> (Threshold: {alert.threshold})</span>
                      <span>•</span>
                      <span>Logged: <strong className="text-slate-400">{new Date(alert.timestamp).toLocaleString()}</strong></span>

                      {/* Acknowledged info */}
                      {isAcknowledged && alert.acknowledged_at && (
                        <>
                          <span>•</span>
                          <span className="text-amber-400/90">
                            Acked: {new Date(alert.acknowledged_at).toLocaleTimeString()}
                            {alert.acknowledged_by ? ` by ${alert.acknowledged_by}` : ''}
                          </span>
                        </>
                      )}

                      {/* Resolved info */}
                      {isResolved && alert.resolved_at && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-400/90">
                            Resolved: {new Date(alert.resolved_at).toLocaleTimeString()}
                            {alert.resolved_by ? ` by ${alert.resolved_by}` : ''}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Actions */}
                  <div className="flex items-center gap-2 self-start md:self-center">
                    {/* Acknowledge Button */}
                    {!isAcknowledged && !isResolved && (
                      <button
                        onClick={() => handleAcknowledge(alert.id)}
                        disabled={actionInProgress}
                        className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono border border-slate-700 transition-colors flex items-center gap-1 disabled:opacity-50"
                        title="Acknowledge alert inspection receipt"
                      >
                        <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                        <span>Acknowledge</span>
                      </button>
                    )}

                    {/* Resolve Button */}
                    {!isResolved ? (
                      <button
                        onClick={() => setResolvingAlert(alert)}
                        disabled={actionInProgress}
                        className="px-3 py-1.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-mono border border-emerald-500/30 transition-colors flex items-center gap-1 disabled:opacity-50"
                        title="Mark issue as resolved after track maintenance"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Resolve</span>
                      </button>
                    ) : (
                      <span className="text-[11px] font-mono text-emerald-400/80 px-2 py-1 rounded bg-slate-950 border border-slate-800 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Closed
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Resolve Confirmation Modal */}
      {resolvingAlert && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0e1422] border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h4 className="text-sm font-semibold text-slate-200">
                  Resolve Safety Incident
                </h4>
              </div>
              <button
                onClick={() => setResolvingAlert(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1 font-mono text-xs">
              <div className="flex items-center gap-2">
                <span className="text-cyan-400 font-bold">{resolvingAlert.track_segment_id}</span>
                <span className="text-slate-300 font-semibold">{resolvingAlert.title}</span>
              </div>
              <p className="text-slate-400 text-[11px]">{resolvingAlert.description}</p>
            </div>

            <div className="space-y-1.5 font-mono text-xs">
              <label className="text-slate-400 block text-[11px] uppercase">
                Resolving Engineer / Inspector Sign-Off:
              </label>
              <input
                type="text"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                placeholder="e.g. Lead Track Engineer / J. Smith"
                className="w-full bg-[#070a11] border border-slate-700 rounded-lg py-2 px-3 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[10px] text-slate-500 block">
                Sign-off identity and UTC resolution timestamp are permanently logged in PostgreSQL.
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setResolvingAlert(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResolveConfirm}
                disabled={actionInProgress}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs font-mono flex items-center gap-1.5 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm Resolution</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdvancedAlertsSection;
