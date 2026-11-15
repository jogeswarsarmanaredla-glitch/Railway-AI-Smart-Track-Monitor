import React, { useState, useEffect } from 'react';
import {
  Brain,
  Eye,
  RefreshCw,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import {
  PredictionDetailResponse,
  PredictionHistoryItem,
  TrackSegmentItem,
} from '../types/telemetry';
import { AiFeatureExplanationChart } from './AiFeatureExplanationChart';

export const PredictionHistoryPage: React.FC = () => {
  const [predictions, setPredictions] = useState<PredictionHistoryItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedTrack, setSelectedTrack] = useState<string>('');
  const [selectedFault, setSelectedFault] = useState<string>('ALL');
  const [anomalyFilter, setAnomalyFilter] = useState<'ALL' | 'ANOMALY' | 'NOMINAL'>('ALL');
  const [tracks, setTracks] = useState<TrackSegmentItem[]>([]);

  // Selected Detail Modal State
  const [selectedPredId, setSelectedPredId] = useState<string | null>(null);
  const [predDetail, setPredDetail] = useState<PredictionDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Load tracks list for dropdown
  useEffect(() => {
    api.getTracks().then(setTracks).catch(() => null);
  }, []);

  // Fetch filtered prediction history
  const fetchPredictions = async () => {
    setLoading(true);
    try {
      const isAnomalyParam =
        anomalyFilter === 'ANOMALY' ? true : anomalyFilter === 'NOMINAL' ? false : undefined;

      const res = await api.getFilteredPredictions({
        trackId: selectedTrack || undefined,
        fault: selectedFault !== 'ALL' ? selectedFault : undefined,
        isAnomaly: isAnomalyParam,
        limit: 50,
      });

      setPredictions(res.predictions);
      setTotalCount(res.total);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to query prediction history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPredictions();
  }, [selectedTrack, selectedFault, anomalyFilter]);

  // Load detail for modal
  const openDetailModal = async (predId: string) => {
    setSelectedPredId(predId);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const detail = await api.getPredictionDetail(predId);
      setPredDetail(detail);
    } catch (err: unknown) {
      setDetailError(err instanceof Error ? err.message : `Failed to load details for ${predId}`);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetailModal = () => {
    setSelectedPredId(null);
    setPredDetail(null);
    setDetailError(null);
  };

  // Badge helper
  const getFaultBadge = (fault: string) => {
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
    <div className="space-y-6">
      {/* Top Banner & Multi-Criteria Filtering */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0c1220] border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              PostgreSQL AI Diagnostics Log
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400">
              Persistent ML Inferences
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">AI Prediction History & Auditing</h2>
          <p className="text-xs text-slate-400">
            Historical fault classifications, Isolation Forest anomaly indices, and calibrated feature snapshots.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Track Filter */}
          <select
            value={selectedTrack}
            onChange={(e) => setSelectedTrack(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500/50"
          >
            <option value="">All Tracks</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id}
              </option>
            ))}
          </select>

          {/* Fault Class Filter */}
          <select
            value={selectedFault}
            onChange={(e) => setSelectedFault(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500/50"
          >
            <option value="ALL">All Fault Classes</option>
            <option value="NORMAL">NORMAL</option>
            <option value="RAIL_CORRUGATION">RAIL CORRUGATION</option>
            <option value="IMPACT_DEFECT">IMPACT DEFECT</option>
            <option value="THERMAL_STRESS">THERMAL STRESS</option>
          </select>

          {/* Anomaly Flag Toggle */}
          <div className="flex items-center rounded-xl bg-slate-900 border border-slate-800 p-1 text-xs">
            {(['ALL', 'ANOMALY', 'NOMINAL'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setAnomalyFilter(filter)}
                className={`px-3 py-1.5 rounded-lg font-mono font-medium transition-all ${
                  anomalyFilter === filter
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={fetchPredictions}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all disabled:opacity-50"
            title="Refresh prediction records"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
          {error}
        </div>
      )}

      {/* Prediction History Table */}
      {loading ? (
        <div className="p-16 text-center text-slate-500 text-xs flex flex-col items-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
          <span>Loading historical inferences from PostgreSQL...</span>
        </div>
      ) : predictions.length === 0 ? (
        <div className="p-16 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl bg-[#0c1220]">
          <Brain className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="font-semibold text-slate-400 text-sm">No prediction records match the selected filters.</p>
          <p className="text-[11px] text-slate-500 mt-1">
            Run an AI diagnostic on the AI Fault Detection page or reset filter criteria.
          </p>
        </div>
      ) : (
        <div className="p-5 rounded-2xl bg-[#0c1220] border border-slate-800 shadow-lg space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h3 className="text-sm font-bold text-slate-200">
              Persistent Inference Records ({predictions.length} of {totalCount} total)
            </h3>
            <span className="text-[10px] font-mono text-cyan-400">
              Click any prediction row to inspect 23-feature explainability
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase">
                  <th className="py-2.5 px-3">Prediction ID</th>
                  <th className="py-2.5 px-3">Timestamp (UTC)</th>
                  <th className="py-2.5 px-3">Track</th>
                  <th className="py-2.5 px-3">Predicted Fault</th>
                  <th className="py-2.5 px-3 text-right">Confidence</th>
                  <th className="py-2.5 px-3 text-right">Anomaly Score</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {predictions.map((p) => {
                  return (
                    <tr
                      key={p.prediction_id}
                      onClick={() => openDetailModal(p.prediction_id)}
                      className="hover:bg-slate-900/60 cursor-pointer transition-colors group"
                    >
                      <td className="py-2.5 px-3 font-bold text-cyan-400">{p.prediction_id}</td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-400">
                        {new Date(p.timestamp).toISOString().replace('T', ' ').slice(0, 19)}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-200">{p.track_segment_id}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getFaultBadge(p.predicted_fault)}`}>
                          {p.predicted_fault}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-100">
                        {(p.confidence_score * 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        <span className={p.is_anomaly ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                          {p.anomaly_score.toFixed(4)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                            p.is_anomaly
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          }`}
                        >
                          {p.is_anomaly ? 'ANOMALY' : 'NOMINAL'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetailModal(p.prediction_id);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-cyan-500/10 hover:text-cyan-300 border border-slate-700/80 text-[11px] text-slate-300 transition-all flex items-center gap-1 ml-auto"
                        >
                          <Eye className="w-3 h-3 text-cyan-400" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* PREDICTION DETAIL MODAL                                              */}
      {/* ==================================================================== */}
      {selectedPredId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#0b0f19] border border-cyan-500/30 p-6 shadow-2xl space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                    Inference Snapshot Detail
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">ID: {selectedPredId}</span>
                </div>
                <h3 className="text-lg font-bold text-slate-100">AI Diagnostic Explainability Record</h3>
              </div>
              <button
                onClick={closeDetailModal}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailLoading ? (
              <div className="p-16 text-center text-slate-500 text-xs flex flex-col items-center gap-3">
                <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
                <span>Loading prediction snapshot from database...</span>
              </div>
            ) : detailError ? (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                {detailError}
              </div>
            ) : predDetail ? (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
                  <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase block mb-1">Classification</span>
                    <span className={`text-base font-bold px-2 py-0.5 rounded border ${getFaultBadge(predDetail.predicted_fault)}`}>
                      {predDetail.predicted_fault}
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-2">
                      Top Probability: {(predDetail.confidence_score * 100).toFixed(1)}%
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase block mb-1">Isolation Forest Anomaly Score</span>
                    <span className={`text-lg font-bold ${predDetail.is_anomaly ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {predDetail.anomaly_score.toFixed(4)}
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-1">
                      Threshold: {predDetail.anomaly_threshold} ({predDetail.is_anomaly ? 'ANOMALY' : 'NOMINAL BASELINE'})
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase block mb-1">Track & Window</span>
                    <span className="text-sm font-bold text-slate-200 block">{predDetail.track_segment_id}</span>
                    <span className="text-[11px] text-slate-400 block mt-1">
                      Rolling Window: {predDetail.window_size} continuous readings
                    </span>
                  </div>
                </div>

                {/* Class Probabilities Distribution */}
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                    Class Probability Distribution (Calibrated Random Forest)
                  </span>
                  <div className="space-y-2">
                    {Object.entries(predDetail.class_probabilities).map(([cls, prob]) => {
                      const pct = Math.round(prob * 100);
                      const isTop = cls === predDetail.predicted_fault;
                      return (
                        <div key={cls} className="space-y-1 text-xs font-mono">
                          <div className="flex justify-between text-slate-300">
                            <span className={isTop ? 'font-bold text-cyan-300' : 'text-slate-400'}>{cls}</span>
                            <span className={isTop ? 'font-bold text-cyan-300' : 'text-slate-400'}>{pct}%</span>
                          </div>
                          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${isTop ? 'bg-cyan-500' : 'bg-slate-600'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Feature Deviations Explainability Chart */}
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                  <AiFeatureExplanationChart deviations={predDetail.feature_deviations} maxDisplay={8} />
                </div>

                {/* Maintenance Recommendation Advisory */}
                <div className="p-4 rounded-xl bg-slate-900/60 border border-amber-500/20 text-xs space-y-1">
                  <span className="font-semibold text-amber-300 uppercase font-mono text-[10px] tracking-wider block">
                    Maintenance Action Advisory
                  </span>
                  <p className="text-slate-300 leading-relaxed">{predDetail.maintenance_recommendation}</p>
                  <p className="text-[10px] text-slate-500 italic mt-2">{predDetail.safety_disclaimer}</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
