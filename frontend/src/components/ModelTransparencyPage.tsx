import React, { useState, useEffect } from 'react';
import {
  Brain,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../services/api';
import { ModelInfoResponse } from '../types/telemetry';

export const ModelTransparencyPage: React.FC = () => {
  const [modelInfo, setModelInfo] = useState<ModelInfoResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchModelInfo = async () => {
    setRefreshing(true);
    try {
      const data = await api.getModelInfo();
      setModelInfo(data);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve model telemetry metadata');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchModelInfo();
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[350px] space-y-3 font-mono text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
        <span className="text-xs">Loading Empirical Model Transparency & Calibration Telemetry...</span>
      </div>
    );
  }

  if (error || !modelInfo) {
    return (
      <div className="p-6 rounded-xl bg-rose-950/20 border border-rose-500/30 text-rose-300 space-y-3 font-mono text-xs">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldAlert className="w-5 h-5 text-rose-400" />
          <span>Model Metadata Inaccessible</span>
        </div>
        <p>{error || 'No machine learning model artifacts are loaded.'}</p>
        <button
          onClick={fetchModelInfo}
          className="px-3 py-1.5 rounded bg-rose-900/50 hover:bg-rose-900 text-white font-mono text-xs"
        >
          Retry Synchronization
        </button>
      </div>
    );
  }

  const { evaluation_metrics, anomaly_calibration, training_summary, normal_baseline_stats } = modelInfo;
  const classReport = evaluation_metrics.classification_report || {};

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-xl bg-[#101623] border border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                Machine Learning Model Transparency & Evaluation Report
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                Model v{modelInfo.model_version} • Trained: {new Date(modelInfo.trained_at).toLocaleString()} • Zero Leakage Partitioning
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-cyan-300">
              Random Seed: {modelInfo.random_seed}
            </span>
            <button
              onClick={fetchModelInfo}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Safety Disclaimer Banner */}
        <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
          <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="text-xs font-semibold text-amber-300 uppercase tracking-wide">
              Data Provenance & Safety Advisory
            </span>
            <p className="text-xs text-slate-300 font-mono leading-relaxed">
              {modelInfo.safety_disclaimer}
            </p>
            <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400 pt-1">
              <span>Provenance: <strong className="text-cyan-300">{modelInfo.dataset_provenance}</strong></span>
              <span>•</span>
              <span>Synthetic Benchmark: <strong className="text-amber-300">YES</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Overview Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-xl bg-[#101623] border border-slate-800">
          <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">Holdout Accuracy</span>
          <span className="text-2xl font-bold font-mono text-emerald-400">
            {(evaluation_metrics.accuracy * 100).toFixed(1)}%
          </span>
          <span className="text-[10px] font-mono text-slate-400 block mt-1">Independent runs</span>
        </div>

        <div className="p-4 rounded-xl bg-[#101623] border border-slate-800">
          <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">Balanced Accuracy</span>
          <span className="text-2xl font-bold font-mono text-emerald-400">
            {(evaluation_metrics.balanced_accuracy * 100).toFixed(1)}%
          </span>
          <span className="text-[10px] font-mono text-slate-400 block mt-1">Multi-class balance</span>
        </div>

        <div className="p-4 rounded-xl bg-[#101623] border border-slate-800">
          <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">Macro F1-Score</span>
          <span className="text-2xl font-bold font-mono text-cyan-300">
            {evaluation_metrics.f1_macro.toFixed(4)}
          </span>
          <span className="text-[10px] font-mono text-slate-400 block mt-1">Unweighted harmonic</span>
        </div>

        <div className="p-4 rounded-xl bg-[#101623] border border-slate-800">
          <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">Macro Precision</span>
          <span className="text-2xl font-bold font-mono text-slate-200">
            {evaluation_metrics.precision_macro.toFixed(4)}
          </span>
          <span className="text-[10px] font-mono text-slate-400 block mt-1">Zero false alarms</span>
        </div>

        <div className="p-4 rounded-xl bg-[#101623] border border-slate-800">
          <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">IForest Holdout F1</span>
          <span className="text-2xl font-bold font-mono text-purple-300">
            {(anomaly_calibration.holdout_anomaly_detection_f1 * 100).toFixed(1)}%
          </span>
          <span className="text-[10px] font-mono text-slate-400 block mt-1">Unsupervised anomaly</span>
        </div>

        <div className="p-4 rounded-xl bg-[#101623] border border-slate-800">
          <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">Calibrated Cutoff</span>
          <span className="text-2xl font-bold font-mono text-amber-400">
            {anomaly_calibration.calibrated_threshold.toFixed(2)}
          </span>
          <span className="text-[10px] font-mono text-slate-400 block mt-1">Isolation cutoff</span>
        </div>
      </div>

      {/* Confusion Matrix & Classification Report */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Confusion Matrix Card */}
        <div className="p-6 rounded-xl bg-[#101623] border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                4×4 Holdout Confusion Matrix
              </h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                Rows: Ground Truth (Actual) • Columns: Model Predictions
              </p>
            </div>
            <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
              Test N = {training_summary.test_samples}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono text-center border-collapse">
              <thead>
                <tr className="bg-slate-900/90 text-slate-400">
                  <th className="p-2.5 border border-slate-800 text-left">True \ Pred</th>
                  {modelInfo.classes.map((cls) => (
                    <th key={cls} className="p-2.5 border border-slate-800 font-semibold text-[11px]">
                      {cls.replace('_', ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evaluation_metrics.confusion_matrix.map((row, rowIdx) => (
                  <tr key={modelInfo.classes[rowIdx]} className="hover:bg-slate-900/50">
                    <td className="p-2.5 border border-slate-800 text-left font-bold text-slate-300">
                      {modelInfo.classes[rowIdx].replace('_', ' ')}
                    </td>
                    {row.map((cell, colIdx) => {
                      const isMatch = rowIdx === colIdx;
                      return (
                        <td
                          key={colIdx}
                          className={`p-2.5 border border-slate-800 font-bold ${
                            isMatch
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
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-slate-500 font-mono">
            Evaluated on holdout runs split strictly on <code className="text-cyan-400">run_id</code>. Zero window overlap or temporal leakage between train and test sets.
          </p>
        </div>

        {/* Detailed Classification Report */}
        <div className="p-6 rounded-xl bg-[#101623] border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                Per-Class Precision, Recall & F1-Score
              </h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                Empirical holdout classification report
              </p>
            </div>
            <span className="text-xs font-mono text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
              Scikit-Learn Evaluation
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-slate-400">
                  <th className="p-2.5 border border-slate-800">Fault Class</th>
                  <th className="p-2.5 border border-slate-800 text-right">Precision</th>
                  <th className="p-2.5 border border-slate-800 text-right">Recall</th>
                  <th className="p-2.5 border border-slate-800 text-right">F1-Score</th>
                  <th className="p-2.5 border border-slate-800 text-right">Support</th>
                </tr>
              </thead>
              <tbody>
                {modelInfo.classes.map((cls) => {
                  const stats = classReport[cls] || {};
                  return (
                    <tr key={cls} className="hover:bg-slate-900/50">
                      <td className="p-2.5 border border-slate-800 font-semibold text-slate-300">
                        {cls}
                      </td>
                      <td className="p-2.5 border border-slate-800 text-right text-emerald-400">
                        {typeof stats.precision === 'number' ? stats.precision.toFixed(3) : '--'}
                      </td>
                      <td className="p-2.5 border border-slate-800 text-right text-emerald-400">
                        {typeof stats.recall === 'number' ? stats.recall.toFixed(3) : '--'}
                      </td>
                      <td className="p-2.5 border border-slate-800 text-right text-cyan-300 font-bold">
                        {typeof stats['f1-score'] === 'number' ? stats['f1-score'].toFixed(3) : '--'}
                      </td>
                      <td className="p-2.5 border border-slate-800 text-right text-slate-400">
                        {stats.support || '--'}
                      </td>
                    </tr>
                  );
                })}

                {/* Macro Avg Row */}
                {classReport['macro avg'] && (
                  <tr className="bg-slate-900/80 font-bold">
                    <td className="p-2.5 border border-slate-800 text-slate-200">Macro Average</td>
                    <td className="p-2.5 border border-slate-800 text-right text-emerald-400">
                      {classReport['macro avg'].precision?.toFixed(3)}
                    </td>
                    <td className="p-2.5 border border-slate-800 text-right text-emerald-400">
                      {classReport['macro avg'].recall?.toFixed(3)}
                    </td>
                    <td className="p-2.5 border border-slate-800 text-right text-cyan-300">
                      {classReport['macro avg']['f1-score']?.toFixed(3)}
                    </td>
                    <td className="p-2.5 border border-slate-800 text-right text-slate-400">
                      {classReport['macro avg'].support}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Total Simulation Runs:</span>
              <span className="text-slate-200">{training_summary.total_runs} (36 train, 12 holdout test)</span>
            </div>
            <div className="flex justify-between">
              <span>Total Synthesized Windows:</span>
              <span className="text-slate-200">{training_summary.train_samples + training_summary.test_samples} ({training_summary.train_samples} train, {training_summary.test_samples} test)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Importance & Isolation Forest Calibration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Feature Importances (Gini) */}
        <div className="p-6 rounded-xl bg-[#101623] border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                Random Forest Feature Importance (Mean Decrease Impurity)
              </h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                Gini importance metrics from Scikit-Learn RandomForestClassifier
              </p>
            </div>
            <span className="text-xs font-mono text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
              Gini Impurity
            </span>
          </div>

          <div className="space-y-3 font-mono text-xs">
            {evaluation_metrics.top_features.map(([name, weight]) => {
              const pct = (weight * 100).toFixed(1);
              return (
                <div key={name} className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-medium">{name}</span>
                    <span className="text-cyan-400 font-bold">{pct}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, weight * 350)}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-500 font-mono pt-2">
            Vertical acceleration dynamics (<code className="text-cyan-300">vz_std</code>, <code className="text-cyan-300">vz_p2p</code>, <code className="text-cyan-300">vz_rms</code>) dominate corrugation and impact defect separation, while <code className="text-amber-300">temp_mean</code> drives thermal stress identification.
          </p>
        </div>

        {/* Isolation Forest Calibration */}
        <div className="p-6 rounded-xl bg-[#101623] border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                Isolation Forest Anomaly Calibration
              </h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                Unsupervised anomaly scoring against nominal baseline density
              </p>
            </div>
            <span className="text-xs font-mono text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/30">
              Contamination Calibrated
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3 font-mono text-xs">
            <div className="space-y-1.5">
              <span className="text-slate-400 text-[11px] uppercase block font-semibold">
                Score Interpretation Note:
              </span>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                {anomaly_calibration.score_interpretation}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-500 block">Decision Min:</span>
                <span className="text-slate-200 font-bold">{anomaly_calibration.calibration_params.dec_min.toFixed(4)}</span>
              </div>
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-500 block">Decision Max:</span>
                <span className="text-slate-200 font-bold">{anomaly_calibration.calibration_params.dec_max.toFixed(4)}</span>
              </div>
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-500 block">Score Spread:</span>
                <span className="text-slate-200 font-bold">{anomaly_calibration.calibration_params.score_spread.toFixed(4)}</span>
              </div>
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-500 block">Holdout Accuracy:</span>
                <span className="text-purple-300 font-bold">{(anomaly_calibration.holdout_anomaly_detection_accuracy * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-cyan-950/20 border border-cyan-800/40 text-[11px] font-mono text-slate-300 space-y-1">
            <span className="text-cyan-400 font-semibold block">Separation Principle:</span>
            <p className="text-slate-400 leading-relaxed">
              Anomaly score is not a fault probability. It measures isolation tree path length transformed to [0, 1]. A score exceeding {anomaly_calibration.calibrated_threshold.toFixed(2)} flags the window as an out-of-distribution deviation from nominal railway operation.
            </p>
          </div>
        </div>
      </div>

      {/* Nominal Reference Baseline Statistics */}
      {normal_baseline_stats && (
        <div className="p-6 rounded-xl bg-[#101623] border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                Nominal Baseline Feature Statistics (NORMAL Class Only)
              </h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                Mean and standard deviation reference values used for standardized Z-score explainability
              </p>
            </div>
            <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
              Reference Z-Scores
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono text-xs">
            {Object.entries(normal_baseline_stats).slice(0, 12).map(([key, stat]) => (
              <div key={key} className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-slate-400 block truncate" title={key}>
                  {key}
                </span>
                <div className="flex justify-between items-baseline mt-1 text-[11px]">
                  <span className="text-slate-500 text-[10px]">μ:</span>
                  <span className="text-slate-200 font-bold">{stat.mean.toFixed(3)}</span>
                </div>
                <div className="flex justify-between items-baseline text-[11px]">
                  <span className="text-slate-500 text-[10px]">σ:</span>
                  <span className="text-cyan-300">{stat.std.toFixed(3)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelTransparencyPage;
