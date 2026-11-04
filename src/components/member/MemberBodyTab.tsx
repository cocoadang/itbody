import React, { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BodyMeasurement } from '../../types';

const METRICS = [
  { key: 'weightKg', label: '체중', unit: 'kg' },
  { key: 'skeletalMuscleMassKg', label: '골격근량', unit: 'kg' },
  { key: 'bodyFatPercentage', label: '체지방률', unit: '%' },
  { key: 'waistCm', label: '허리둘레', unit: 'cm' }
] as const;

type MetricKey = (typeof METRICS)[number]['key'];

export const MemberBodyTab: React.FC<{ measurements: BodyMeasurement[] }> = ({ measurements }) => {
  const sorted = useMemo(() => [...measurements].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)), [measurements]);
  const available = METRICS.filter((m) => sorted.some((r) => typeof r[m.key] === 'number'));
  const [metric, setMetric] = useState<MetricKey>(available[0]?.key || 'weightKg');
  const def = METRICS.find((m) => m.key === metric)!;
  const points = sorted
    .filter((r) => typeof r[metric] === 'number')
    .map((r) => ({ date: r.measuredAt.slice(5).replace('-', '/'), full: r.measuredAt, value: r[metric] as number }));
  const first = points[0]?.value;
  const last = points[points.length - 1]?.value;
  const diff = first !== undefined && last !== undefined ? Math.round((last - first) * 10) / 10 : null;

  if (sorted.length === 0) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-stone-900">몸 변화</h2>
        <p className="bg-white rounded-xl border border-stone-200 p-8 text-center text-sm text-stone-500">아직 측정 기록이 없습니다. 트레이너와 측정하면 여기에서 변화를 볼 수 있어요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-stone-900">몸 변화</h2>
      <div className="flex gap-1.5 overflow-x-auto">
        {available.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetric(m.key)}
            className={`px-3 py-1.5 rounded-full text-sm border whitespace-nowrap ${metric === m.key ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-700 border-stone-300'}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-stone-200 p-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-sm text-stone-500">{def.label}</span>
          <span className="text-right">
            <span className="text-2xl font-bold text-stone-900">{last}{def.unit}</span>
            {diff !== null && points.length > 1 && (
              <span className={`ml-2 text-sm font-semibold ${diff === 0 ? 'text-stone-500' : diff < 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                {diff > 0 ? '+' : ''}{diff}{def.unit}
              </span>
            )}
          </span>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} width={44} tickFormatter={(v: number) => String(Math.round(v * 10) / 10)} />
              <Tooltip formatter={(v) => [`${v}${def.unit}`, def.label]} labelFormatter={(_, p) => p?.[0]?.payload?.full || ''} />
              <Line type="monotone" dataKey="value" stroke="#1c1917" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {points.length > 1 && <p className="text-xs text-stone-500 mt-2">{points[0].full} 첫 측정부터 {points.length}번 측정했어요.</p>}
      </div>
    </div>
  );
};
