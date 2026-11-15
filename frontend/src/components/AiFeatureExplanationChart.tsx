import React from 'react';
import { HelpCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface AiFeatureExplanationChartProps {
  deviations?: Record<string, number> | null;
  className?: string;
  maxDisplay?: number;
}

const FEATURE_LABELS: Record<string, { label: string; unit: string; category: string }> = {
  vx_rms: { label: 'Lateral RMS Vibration', unit: 'g', category: 'Vibration' },
  vy_rms: { label: 'Longitudinal RMS Vibration', unit: 'g', category: 'Vibration' },
  vz_rms: { label: 'Vertical RMS Vibration', unit: 'g', category: 'Vibration' },
  v_total_rms: { label: 'Spatial Total RMS', unit: 'g', category: 'Vibration' },
  vx_mean: { label: 'Lateral Mean Acceleration', unit: 'g', category: 'Vibration' },
  vy_mean: { label: 'Longitudinal Mean Acceleration', unit: 'g', category: 'Vibration' },
  vz_mean: { label: 'Vertical Mean Acceleration', unit: 'g', category: 'Vibration' },
  vx_std: { label: 'Lateral Vibration Std Dev', unit: 'g', category: 'Vibration' },
  vy_std: { label: 'Longitudinal Vibration Std Dev', unit: 'g', category: 'Vibration' },
  vz_std: { label: 'Vertical Vibration Std Dev', unit: 'g', category: 'Vibration' },
  vx_p2p: { label: 'Lateral Peak-to-Peak Amplitude', unit: 'g', category: 'Vibration' },
  vy_p2p: { label: 'Longitudinal Peak-to-Peak Amplitude', unit: 'g', category: 'Vibration' },
  vz_p2p: { label: 'Vertical Peak-to-Peak Amplitude', unit: 'g', category: 'Vibration' },
  vz_kurtosis: { label: 'Vertical Kurtosis (Shock Peaks)', unit: 'ratio', category: 'Shape' },
  vz_crest_factor: { label: 'Vertical Crest Factor (Impulsiveness)', unit: 'ratio', category: 'Shape' },
  temp_mean: { label: 'Mean Rail Surface Temperature', unit: '°C', category: 'Thermal' },
  temp_max: { label: 'Peak Rail Temperature', unit: '°C', category: 'Thermal' },
  temp_min: { label: 'Minimum Rail Temperature', unit: '°C', category: 'Thermal' },
  temp_slope_c_per_min: { label: 'Temperature Gradient Slope', unit: '°C/min', category: 'Thermal' },
  hum_mean: { label: 'Mean Relative Humidity', unit: '%', category: 'Environment' },
  hum_std: { label: 'Humidity Standard Deviation', unit: '%', category: 'Environment' },
  train_speed_mean: { label: 'Mean Train Transit Speed', unit: 'km/h', category: 'Operational' },
  window_duration_seconds: { label: 'Window Duration', unit: 's', category: 'Temporal' },
};

export const AiFeatureExplanationChart: React.FC<AiFeatureExplanationChartProps> = ({
  deviations,
  className = '',
  maxDisplay = 10,
}) => {
  if (!deviations || Object.keys(deviations).length === 0) {
    return (
      <div className={`p-4 rounded-xl border border-slate-800 bg-[#0d1322] text-center text-xs text-slate-400 ${className}`}>
        <p>No feature deviation data available for this prediction.</p>
      </div>
    );
  }

  // Sort by absolute z-score deviation descending
  const sortedFeatures = Object.entries(deviations)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, maxDisplay);

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Feature Explainability (Nominal Baseline Z-Scores)
          </span>
          <div className="group relative cursor-help">
            <HelpCircle className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300 transition-colors" />
            <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden w-72 rounded-lg bg-slate-900 border border-slate-700 p-2.5 text-[11px] text-slate-300 shadow-xl group-hover:block z-50">
              <p className="font-semibold text-slate-200 mb-1">Standardized Feature Deviation (z-score):</p>
              <p className="font-mono text-[10px] text-cyan-300 mb-1">z = (x - μ_nominal) / σ_nominal</p>
              <p>
                Measures how many standard deviations a feature diverges from the synthetic nominal baseline.
                Higher absolute values indicate strongest statistical contribution to fault diagnosis.
              </p>
            </div>
          </div>
        </div>
        <span className="text-[10px] font-mono text-slate-400">
          Showing top {sortedFeatures.length} deviations
        </span>
      </div>

      <div className="space-y-2">
        {sortedFeatures.map(([fname, zScore]) => {
          const meta = FEATURE_LABELS[fname] || { label: fname, unit: '', category: 'Metric' };
          const absZ = Math.abs(zScore);

          // Color classification based on standard deviations
          let barColor = 'bg-emerald-500';
          let textColor = 'text-emerald-400';
          let borderStyle = 'border-emerald-500/30';
          let labelText = 'Nominal';

          if (absZ >= 3.0) {
            barColor = 'bg-rose-500';
            textColor = 'text-rose-400';
            borderStyle = 'border-rose-500/30';
            labelText = 'Severe Deviation (>3σ)';
          } else if (absZ >= 1.5) {
            barColor = 'bg-amber-500';
            textColor = 'text-amber-400';
            borderStyle = 'border-amber-500/30';
            labelText = 'Moderate Deviation (>1.5σ)';
          }

          // Visual width clamped to 100%
          const barWidth = Math.min(100, Math.max(4, (absZ / 6.0) * 100));

          return (
            <div
              key={fname}
              className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-all text-xs"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {zScore > 0.1 ? (
                    <TrendingUp className="w-3.5 h-3.5 text-rose-400" />
                  ) : zScore < -0.1 ? (
                    <TrendingDown className="w-3.5 h-3.5 text-blue-400" />
                  ) : (
                    <Minus className="w-3.5 h-3.5 text-slate-500" />
                  )}
                  <span className="font-medium text-slate-200">{meta.label}</span>
                  <span className="text-[10px] font-mono text-slate-500">[{meta.category}]</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${borderStyle} ${textColor}`}>
                    {labelText}
                  </span>
                  <span className={`font-mono font-bold text-xs ${textColor}`}>
                    {zScore > 0 ? `+${zScore.toFixed(2)}` : zScore.toFixed(2)}σ
                  </span>
                </div>
              </div>

              {/* Deviation bar */}
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-800 text-[10px] text-slate-400 leading-relaxed">
        <span className="font-semibold text-slate-300">Non-Causal Statistical Explainability:</span> Standardized deviations
        illustrate statistical divergence from the calibrated synthetic nominal baseline. They provide transparent feature
        insights for operations engineers and do not certify physical root causation.
      </div>
    </div>
  );
};
