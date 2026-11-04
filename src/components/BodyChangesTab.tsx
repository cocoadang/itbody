import React, { useState, useMemo } from 'react';
import {
  Activity,
  Plus,
  TrendingUp,
  Calendar,
  Edit2,
  Trash2,
  Target,
  Dumbbell,
  AlertCircle,
  ChevronRight,
  Info,
  CheckCircle2
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import type {
  BodyMeasurement,
  Member,
  MemberGoal,
  PtSession,
  UserRole
} from '../types';
import {
  calculateMetricComparison,
  calculateExerciseProgress,
  calculateGoalProgress
} from '../utils/progressCalculations';
import {
  createBodyMeasurement,
  updateBodyMeasurement,
  deleteBodyMeasurement
} from '../services/dataService';
import { DateInputField } from './DateInputField';
import { isValidDate } from '../utils/dateInputUtils';
import { localToday } from '../utils/dateInputUtils';

interface BodyChangesTabProps {
  member: Member;
  measurements: BodyMeasurement[];
  goals: MemberGoal[];
  sessions: PtSession[];
  userRole: UserRole;
  currentTrainerId?: string | null;
  onRefresh: () => Promise<void>;
}

type ChartMetric = 'weightKg' | 'skeletalMuscleMassKg' | 'bodyFatPercentage';

export const BodyChangesTab: React.FC<BodyChangesTabProps> = ({
  member,
  measurements,
  goals,
  sessions,
  userRole,
  currentTrainerId,
  onRefresh
}) => {
  const [selectedChartMetric, setSelectedChartMetric] = useState<ChartMetric>('weightKg');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMeasurement, setEditingMeasurement] = useState<BodyMeasurement | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const canEdit = userRole === 'CENTER_ADMIN' || userRole === 'TRAINER';

  // 1. Metric Comparisons (Step 3)
  const weightComp = useMemo(
    () => calculateMetricComparison(measurements, 'weightKg'),
    [measurements]
  );
  const muscleComp = useMemo(
    () => calculateMetricComparison(measurements, 'skeletalMuscleMassKg'),
    [measurements]
  );
  const fatComp = useMemo(
    () => calculateMetricComparison(measurements, 'bodyFatPercentage'),
    [measurements]
  );

  // Circumferences
  const waistComp = useMemo(() => calculateMetricComparison(measurements, 'waistCm'), [measurements]);
  const hipComp = useMemo(() => calculateMetricComparison(measurements, 'hipCm'), [measurements]);
  const chestComp = useMemo(() => calculateMetricComparison(measurements, 'chestCm'), [measurements]);
  const thighComp = useMemo(() => calculateMetricComparison(measurements, 'thighCm'), [measurements]);
  const armComp = useMemo(() => calculateMetricComparison(measurements, 'armCm'), [measurements]);

  // 2. Chart data (Step 4)
  const chartData = useMemo(() => {
    const sorted = [...measurements].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
    return sorted
      .filter((m) => m[selectedChartMetric] !== undefined && m[selectedChartMetric] !== null)
      .map((m) => ({
        date: m.measuredAt,
        value: m[selectedChartMetric] as number
      }));
  }, [measurements, selectedChartMetric]);

  const metricLabels: Record<ChartMetric, { label: string; unit: string }> = {
    weightKg: { label: '체중', unit: 'kg' },
    skeletalMuscleMassKg: { label: '골격근량', unit: 'kg' },
    bodyFatPercentage: { label: '체지방률', unit: '%' }
  };

  // 3. Exercise Progress (Step 5 & 6)
  const exProgressBase = useMemo(() => calculateExerciseProgress(sessions), [sessions]);
  const [selectedExercise, setSelectedExercise] = useState<string>(() => {
    return exProgressBase.availableExercises[0] || '';
  });

  // Keep selected exercise in sync if available exercises change
  const currentExercise = exProgressBase.availableExercises.includes(selectedExercise)
    ? selectedExercise
    : exProgressBase.availableExercises[0] || '';

  const currentExerciseProgress = useMemo(() => {
    if (!currentExercise) return null;
    return calculateExerciseProgress(sessions, currentExercise).summary;
  }, [sessions, currentExercise]);

  // 4. Goal Progress (Step 7 & 8)
  const goalProgressList = useMemo(() => {
    return goals.map((g) => ({
      goal: g,
      progress: calculateGoalProgress(g, measurements, sessions)
    }));
  }, [goals, measurements, sessions]);

  // 5. Sorted History list (descending by measuredAt)
  const historyList = useMemo(() => {
    return [...measurements].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
  }, [measurements]);

  const handleOpenAdd = () => {
    setEditingMeasurement(null);
    setIsModalOpen(true);
    setActionError(null);
  };

  const handleOpenEdit = (m: BodyMeasurement) => {
    setEditingMeasurement(m);
    setIsModalOpen(true);
    setActionError(null);
  };

  const handleDelete = async (measurementId: string) => {
    if (userRole === 'TRAINER' && (!currentTrainerId || member.trainerId !== currentTrainerId)) {
      setActionError('본인 담당 회원의 신체 측정 기록만 삭제할 수 있습니다.');
      return;
    }
    try {
      setIsSubmitting(true);
      await deleteBodyMeasurement(member.centerId, measurementId, userRole, currentTrainerId);
      setDeleteConfirmId(null);
      await onRefresh();
    } catch (e: any) {
      setActionError(e?.message || '측정 기록 삭제 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Tab Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-stone-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-semibold text-stone-900">신체변화 및 수행능력 분석</h3>
          </div>
          <p className="text-sm text-stone-500 mt-1">
            기록된 객관적 측정 데이터를 바탕으로 시작점부터 현재까지의 변화량과 운동 능력을 중립적으로 표시합니다.
          </p>
        </div>

        {canEdit && (
          <button
            id="btn-add-body-measurement"
            onClick={handleOpenAdd}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-stone-900 hover:bg-stone-800 text-white text-sm font-medium rounded-xl transition shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>신체 측정 기록</span>
          </button>
        )}
      </div>

      {actionError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* STEP 3: Current Progress Summary (시작 vs 현재 변화) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-base font-semibold text-stone-900 flex items-center gap-2">
            <Activity className="w-4 h-4 text-teal-600" />
            신체 지표 변화 요약 (시작점 vs 현재)
          </h4>
          {measurements.length > 0 && (
            <span className="text-xs text-stone-500">
              총 {measurements.length}회 측정 ({measurements[0]?.measuredAt} ~{' '}
              {measurements[measurements.length - 1]?.measuredAt})
            </span>
          )}
        </div>

        {measurements.length === 0 ? (
          <div className="p-8 text-center bg-stone-50/70 rounded-2xl border border-dashed border-stone-300">
            <Activity className="w-8 h-8 text-stone-400 mx-auto mb-2" />
            <p className="text-stone-700 font-medium text-sm">등록된 신체 측정 기록이 없습니다</p>
            <p className="text-xs text-stone-500 mt-1">
              [+ 신체 측정 기록] 버튼을 눌러 인바디 또는 둘레 측정값을 등록하세요.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 체중 */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs flex flex-col justify-between min-w-0">
              <div>
                <div className="flex items-center justify-between flex-wrap gap-1.5 text-stone-500 text-xs font-medium mb-2 min-w-0">
                  <span className="truncate">체중 (Weight)</span>
                  {weightComp.hasData && weightComp.count > 1 ? (
                    <span className="inline-flex items-center gap-1 font-mono text-stone-700 bg-stone-100 px-2 py-0.5 rounded-md shrink-0">
                      <span>{weightComp.trendIcon}</span>
                      <span>{weightComp.deltaFormatted} kg</span>
                    </span>
                  ) : weightComp.hasData && weightComp.count === 1 ? (
                    <span className="text-[10px] text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md shrink-0">
                      첫 측정 기준
                    </span>
                  ) : null}
                </div>
                {weightComp.hasData ? (
                  <div>
                    <div className="flex items-baseline gap-2 flex-wrap min-w-0">
                      <span className="text-2xl font-bold text-stone-900 font-mono break-words">
                        {weightComp.currentValue}
                      </span>
                      <span className="text-sm text-stone-500">kg</span>
                    </div>
                    {weightComp.count > 1 ? (
                      <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between flex-wrap gap-1 text-xs text-stone-500 min-w-0">
                        <span>시작 ({weightComp.earliestDate}):</span>
                        <span className="font-mono font-medium text-stone-700">
                          {weightComp.startValue} kg
                        </span>
                      </div>
                    ) : (
                      <div className="mt-3 pt-3 border-t border-stone-100 text-[11px] text-stone-400">
                        첫 측정 기준값입니다. 다음 측정 시 변화량이 표시됩니다.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-2 text-xs text-stone-400">기록된 체중 데이터 없음</div>
                )}
              </div>
            </div>

            {/* 골격근량 */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs flex flex-col justify-between min-w-0">
              <div>
                <div className="flex items-center justify-between flex-wrap gap-1.5 text-stone-500 text-xs font-medium mb-2 min-w-0">
                  <span className="truncate">골격근량 (SMM)</span>
                  {muscleComp.hasData && muscleComp.count > 1 ? (
                    <span className="inline-flex items-center gap-1 font-mono text-stone-700 bg-stone-100 px-2 py-0.5 rounded-md shrink-0">
                      <span>{muscleComp.trendIcon}</span>
                      <span>{muscleComp.deltaFormatted} kg</span>
                    </span>
                  ) : muscleComp.hasData && muscleComp.count === 1 ? (
                    <span className="text-[10px] text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md shrink-0">
                      첫 측정 기준
                    </span>
                  ) : null}
                </div>
                {muscleComp.hasData ? (
                  <div>
                    <div className="flex items-baseline gap-2 flex-wrap min-w-0">
                      <span className="text-2xl font-bold text-stone-900 font-mono break-words">
                        {muscleComp.currentValue}
                      </span>
                      <span className="text-sm text-stone-500">kg</span>
                    </div>
                    {muscleComp.count > 1 ? (
                      <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between flex-wrap gap-1 text-xs text-stone-500 min-w-0">
                        <span>시작 ({muscleComp.earliestDate}):</span>
                        <span className="font-mono font-medium text-stone-700">
                          {muscleComp.startValue} kg
                        </span>
                      </div>
                    ) : (
                      <div className="mt-3 pt-3 border-t border-stone-100 text-[11px] text-stone-400">
                        첫 측정 기준값입니다. 다음 측정 시 변화량이 표시됩니다.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-2 text-xs text-stone-400">기록된 골격근량 데이터 없음</div>
                )}
              </div>
            </div>

            {/* 체지방률 */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs flex flex-col justify-between min-w-0 sm:col-span-2 lg:col-span-1">
              <div>
                <div className="flex items-center justify-between flex-wrap gap-1.5 text-stone-500 text-xs font-medium mb-2 min-w-0">
                  <span className="truncate">체지방률 (Body Fat %)</span>
                  {fatComp.hasData && fatComp.count > 1 ? (
                    <span className="inline-flex items-center gap-1 font-mono text-stone-700 bg-stone-100 px-2 py-0.5 rounded-md shrink-0">
                      <span>{fatComp.trendIcon}</span>
                      <span>{fatComp.deltaFormatted} %p</span>
                    </span>
                  ) : fatComp.hasData && fatComp.count === 1 ? (
                    <span className="text-[10px] text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md shrink-0">
                      첫 측정 기준
                    </span>
                  ) : null}
                </div>
                {fatComp.hasData ? (
                  <div>
                    <div className="flex items-baseline gap-2 flex-wrap min-w-0">
                      <span className="text-2xl font-bold text-stone-900 font-mono break-words">
                        {fatComp.currentValue}
                      </span>
                      <span className="text-sm text-stone-500">%</span>
                    </div>
                    {fatComp.count > 1 ? (
                      <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between flex-wrap gap-1 text-xs text-stone-500 min-w-0">
                        <span>시작 ({fatComp.earliestDate}):</span>
                        <span className="font-mono font-medium text-stone-700">
                          {fatComp.startValue} %
                        </span>
                      </div>
                    ) : (
                      <div className="mt-3 pt-3 border-t border-stone-100 text-[11px] text-stone-400">
                        첫 측정 기준값입니다. 다음 측정 시 변화량이 표시됩니다.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-2 text-xs text-stone-400">기록된 체지방률 데이터 없음</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Circumference highlights if any exist */}
        {(waistComp.hasData || hipComp.hasData || chestComp.hasData || thighComp.hasData || armComp.hasData) && (
          <div className="bg-stone-50/70 p-4 rounded-xl border border-stone-200/80">
            <span className="text-xs font-semibold text-stone-600 block mb-2">신체 둘레 변화 (cm)</span>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              {waistComp.hasData && (
                <div className="bg-white p-2.5 rounded-lg border border-stone-200/60">
                  <span className="text-stone-500 block">허리</span>
                  <div className="font-mono font-medium text-stone-900 mt-0.5">
                    {waistComp.currentValue} cm
                    {waistComp.count > 1 && (
                      <span className="text-stone-500 font-normal ml-1">({waistComp.deltaFormatted})</span>
                    )}
                  </div>
                </div>
              )}
              {hipComp.hasData && (
                <div className="bg-white p-2.5 rounded-lg border border-stone-200/60">
                  <span className="text-stone-500 block">엉덩이</span>
                  <div className="font-mono font-medium text-stone-900 mt-0.5">
                    {hipComp.currentValue} cm
                    {hipComp.count > 1 && (
                      <span className="text-stone-500 font-normal ml-1">({hipComp.deltaFormatted})</span>
                    )}
                  </div>
                </div>
              )}
              {chestComp.hasData && (
                <div className="bg-white p-2.5 rounded-lg border border-stone-200/60">
                  <span className="text-stone-500 block">가슴</span>
                  <div className="font-mono font-medium text-stone-900 mt-0.5">
                    {chestComp.currentValue} cm
                    {chestComp.count > 1 && (
                      <span className="text-stone-500 font-normal ml-1">({chestComp.deltaFormatted})</span>
                    )}
                  </div>
                </div>
              )}
              {thighComp.hasData && (
                <div className="bg-white p-2.5 rounded-lg border border-stone-200/60">
                  <span className="text-stone-500 block">허벅지</span>
                  <div className="font-mono font-medium text-stone-900 mt-0.5">
                    {thighComp.currentValue} cm
                    {thighComp.count > 1 && (
                      <span className="text-stone-500 font-normal ml-1">({thighComp.deltaFormatted})</span>
                    )}
                  </div>
                </div>
              )}
              {armComp.hasData && (
                <div className="bg-white p-2.5 rounded-lg border border-stone-200/60">
                  <span className="text-stone-500 block">팔</span>
                  <div className="font-mono font-medium text-stone-900 mt-0.5">
                    {armComp.currentValue} cm
                    {armComp.count > 1 && (
                      <span className="text-stone-500 font-normal ml-1">({armComp.deltaFormatted})</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* STEP 4: Time-series Chart (시계열 변화 그래프) */}
      <div className="bg-white p-6 rounded-2xl border border-stone-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-stone-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-teal-600" />
              시계열 추이 그래프
            </h4>
            <p className="text-xs text-stone-500 mt-0.5">
              실제 측정일자의 기록 데이터만 표시하며 임의 보간하지 않습니다.
            </p>
          </div>

          {/* Metric Selector Tabs */}
          <div className="inline-flex p-1 bg-stone-100 rounded-xl">
            {(['weightKg', 'skeletalMuscleMassKg', 'bodyFatPercentage'] as ChartMetric[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedChartMetric(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                  selectedChartMetric === key
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                {metricLabels[key].label} ({metricLabels[key].unit})
              </button>
            ))}
          </div>
        </div>

        {/* Chart rendering or Empty state */}
        {chartData.length < 2 ? (
          <div className="py-16 text-center bg-stone-50/50 rounded-xl border border-dashed border-stone-200">
            <Info className="w-6 h-6 text-stone-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-stone-700">
              변화를 확인하려면 측정 기록이 2개 이상 필요합니다.
            </p>
            <p className="text-xs text-stone-400 mt-1">
              현재 해당 지표의 유효 측정 데이터: {chartData.length}건
            </p>
          </div>
        ) : (
          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  tickLine={false}
                  axisLine={{ stroke: '#E5E7EB' }}
                />
                <YAxis
                  domain={['dataMin - 1', 'dataMax + 1']}
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  tickLine={false}
                  axisLine={{ stroke: '#E5E7EB' }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-stone-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg">
                          <span className="text-stone-300 block">{data.date}</span>
                          <span className="font-mono font-semibold text-sm">
                            {data.value} {metricLabels[selectedChartMetric].unit}
                          </span>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#0D9488"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#0D9488', stroke: '#fff', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: '#0F766E' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* STEP 5 & 6: Exercise Progress (운동 수행능력 Progress) */}
      <div className="bg-white p-6 rounded-2xl border border-stone-200/80 shadow-xs space-y-5">
        <div>
          <h4 className="text-base font-semibold text-stone-900 flex items-center gap-2">
            <Dumbbell className="w-4 h-4 text-teal-600" />
            운동 수행능력 Progress (PT 수업 일지 기반)
          </h4>
          <p className="text-xs text-stone-500 mt-0.5">
            완료된 PT 수업에 트레이너가 기록한 세트/중량/반복수 데이터를 단일 진실 공급원(SSOT)으로 자동 집계합니다.
          </p>
        </div>

        {exProgressBase.availableExercises.length === 0 ? (
          <div className="py-12 text-center bg-stone-50/50 rounded-xl border border-dashed border-stone-200">
            <Dumbbell className="w-6 h-6 text-stone-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-stone-700">
              완료된 PT 수업 일지에 기록된 운동 데이터가 없습니다.
            </p>
            <p className="text-xs text-stone-400 mt-1">
              PT 수업 탭에서 수업 일지에 수행 운동 세트를 기록하면 자동으로 여기에 분석됩니다.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Exercise Selector Chips */}
            <div className="flex flex-wrap gap-2">
              {exProgressBase.availableExercises.map((exName) => (
                <button
                  key={exName}
                  type="button"
                  onClick={() => setSelectedExercise(exName)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                    currentExercise === exName
                      ? 'bg-stone-900 text-white shadow-xs'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {exName}
                </button>
              ))}
            </div>

            {currentExerciseProgress && (
              <div className="space-y-4 pt-2">
                {/* Exercise Metric Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-stone-50 p-4 rounded-xl border border-stone-200/70">
                    <span className="text-xs text-stone-500 block">최고 중량 (Max Weight)</span>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-xl font-bold font-mono text-stone-900">
                        {currentExerciseProgress.overallMaxWeight}
                      </span>
                      <span className="text-xs text-stone-500">kg</span>
                      {currentExerciseProgress.weightDelta !== undefined &&
                        currentExerciseProgress.sessionRecords.length > 1 && (
                          <span className="text-xs font-mono font-medium text-stone-700 ml-auto bg-white px-2 py-0.5 rounded border border-stone-200">
                            {currentExerciseProgress.weightDeltaFormatted} kg
                          </span>
                        )}
                    </div>
                  </div>

                  <div className="bg-stone-50 p-4 rounded-xl border border-stone-200/70">
                    <span className="text-xs text-stone-500 block">최고 반복수 (Max Reps)</span>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-xl font-bold font-mono text-stone-900">
                        {currentExerciseProgress.overallMaxReps}
                      </span>
                      <span className="text-xs text-stone-500">회</span>
                    </div>
                  </div>

                  <div className="bg-stone-50 p-4 rounded-xl border border-stone-200/70">
                    <span className="text-xs text-stone-500 block">총 누적 볼륨 (Total Volume)</span>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-xl font-bold font-mono text-stone-900">
                        {currentExerciseProgress.overallTotalVolume.toLocaleString()}
                      </span>
                      <span className="text-xs text-stone-500">kg (중량×횟수)</span>
                    </div>
                  </div>
                </div>

                {/* Session Records History for this exercise */}
                <div className="border border-stone-200 rounded-xl overflow-hidden">
                  <div className="bg-stone-100/70 px-4 py-2 text-xs font-semibold text-stone-700 border-b border-stone-200">
                    {currentExercise} 세션별 수행 기록 ({currentExerciseProgress.sessionRecords.length}회 수행)
                  </div>
                  <div className="divide-y divide-stone-100 text-xs">
                    {currentExerciseProgress.sessionRecords.map((rec) => (
                      <div
                        key={rec.sessionId}
                        className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-stone-50/60"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-stone-900">
                            PT #{rec.sessionNumber}회차
                          </span>
                          <span className="text-stone-400 font-mono">{rec.date}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {rec.sets.map((s) => (
                            <span
                              key={s.setNumber}
                              className="px-2 py-0.5 rounded bg-white border border-stone-200 text-stone-700 font-mono"
                            >
                              S{s.setNumber}: {s.weight > 0 ? `${s.weight}kg` : 'BW'} × {s.reps}회
                            </span>
                          ))}
                          {rec.sessionVolume > 0 && (
                            <span className="text-stone-500 font-mono ml-2">
                              볼륨: {rec.sessionVolume}kg
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* STEP 7 & 8: Goal Progress (목표 달성 현황) */}
      <div className="bg-white p-6 rounded-2xl border border-stone-200/80 shadow-xs space-y-4">
        <div>
          <h4 className="text-base font-semibold text-stone-900 flex items-center gap-2">
            <Target className="w-4 h-4 text-teal-600" />
            목표 달성 현황 (Goal Progress)
          </h4>
          <p className="text-xs text-stone-500 mt-0.5">
            등록된 정량 목표와 실제 측정 데이터를 자동으로 연결하여 잔여 수치와 진척률을 계산합니다.
          </p>
        </div>

        {goalProgressList.length === 0 ? (
          <div className="py-8 text-center bg-stone-50/50 rounded-xl border border-dashed border-stone-200">
            <p className="text-sm font-medium text-stone-700">등록된 회원 목표가 없습니다.</p>
            <p className="text-xs text-stone-400 mt-1">
              목표 관리 탭에서 목표를 등록하면 여기에 자동으로 진척도가 집계됩니다.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {goalProgressList.map(({ goal, progress }) => (
              <div
                key={goal.goalId}
                className="p-4 rounded-xl border border-stone-200/80 bg-stone-50/50 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-stone-900">{goal.title}</span>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-stone-200 text-stone-700">
                      {goal.category}
                    </span>
                    {goal.status === 'ACHIEVED' && (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> 달성 완료
                      </span>
                    )}
                  </div>

                  {progress.canCalculate && (
                    <div className="text-xs text-stone-600 font-mono">
                      {progress.remaining !== undefined && progress.remaining > 0 ? (
                        <span>
                          목표까지 남은 수치:{' '}
                          <strong className="text-stone-900 font-semibold">
                            {progress.remaining} {progress.unit}
                          </strong>
                        </span>
                      ) : (
                        <span className="text-emerald-600 font-semibold">목표 수치 달성!</span>
                      )}
                    </div>
                  )}
                </div>

                {progress.canCalculate ? (
                  <div className="space-y-1.5">
                    {/* Progress Bar */}
                    <div className="w-full bg-stone-200 h-2.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          progress.isAchieved ? 'bg-emerald-600' : 'bg-teal-600'
                        }`}
                        style={{ width: `${progress.progressPercent}%` }}
                      />
                    </div>

                    {/* Baseline vs Current vs Target breakdown */}
                    <div className="flex items-center justify-between text-xs text-stone-500 font-mono pt-1">
                      <span>
                        시작: {progress.startValue} {progress.unit}
                      </span>
                      <span>
                        현재: <strong className="text-stone-800">{progress.currentValue}</strong>{' '}
                        {progress.unit} ({progress.actualPercent}%)
                      </span>
                      <span>
                        목표: {progress.targetValue} {progress.unit}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-stone-500 flex items-center gap-1.5 pt-1">
                    <Info className="w-3.5 h-3.5 text-stone-400" />
                    <span>
                      {progress.status === 'NO_TARGET'
                        ? '정성 목표로 수치 진척률이 계산되지 않습니다.'
                        : progress.status === 'INSUFFICIENT_DATA'
                        ? '진척도를 계산하기 위한 측정 기록 또는 운동 일지가 부족합니다.'
                        : '수치 비교 대기 중'}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* STEP 10: Measurement History List (측정 히스토리) */}
      <div className="bg-white p-6 rounded-2xl border border-stone-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-base font-semibold text-stone-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-600" />
              측정 히스토리 (총 {historyList.length}회)
            </h4>
            <p className="text-xs text-stone-500 mt-0.5">
              전체 측정 기록을 최신순으로 확인하고 수정 및 삭제할 수 있습니다.
            </p>
          </div>
        </div>

        {historyList.length === 0 ? (
          <div className="py-8 text-center text-xs text-stone-400">등록된 측정 기록이 없습니다.</div>
        ) : (
          <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden">
            {historyList.map((m) => (
              <div
                key={m.measurementId}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-stone-50/50"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-stone-900 text-sm font-mono">
                      {m.measuredAt}
                    </span>
                    {m.memo && (
                      <span className="text-xs text-stone-500 bg-stone-100 px-2 py-0.5 rounded">
                        {m.memo}
                      </span>
                    )}
                  </div>

                  {/* Metrics Row */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-stone-600 font-mono">
                    {m.weightKg !== undefined && (
                      <span>
                        체중: <strong>{m.weightKg}kg</strong>
                      </span>
                    )}
                    {m.skeletalMuscleMassKg !== undefined && (
                      <span>
                        골격근량: <strong>{m.skeletalMuscleMassKg}kg</strong>
                      </span>
                    )}
                    {m.bodyFatPercentage !== undefined && (
                      <span>
                        체지방률: <strong>{m.bodyFatPercentage}%</strong>
                      </span>
                    )}
                    {m.bodyFatMassKg !== undefined && (
                      <span>체지방량: {m.bodyFatMassKg}kg</span>
                    )}
                    {m.waistCm !== undefined && <span>허리: {m.waistCm}cm</span>}
                    {m.hipCm !== undefined && <span>엉덩이: {m.hipCm}cm</span>}
                    {m.chestCm !== undefined && <span>가슴: {m.chestCm}cm</span>}
                    {m.thighCm !== undefined && <span>허벅지: {m.thighCm}cm</span>}
                    {m.armCm !== undefined && <span>팔: {m.armCm}cm</span>}
                  </div>
                </div>

                {canEdit && (
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(m)}
                      className="p-1.5 text-stone-500 hover:text-stone-900 rounded-lg hover:bg-stone-100 transition"
                      title="수정"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(m.measurementId)}
                      className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                      title="삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl space-y-4 border border-stone-200">
            <h4 className="text-base font-semibold text-stone-900">측정 기록 삭제 확인</h4>
            <p className="text-xs text-stone-600">
              해당 측정 기록을 삭제하시겠습니까? 삭제된 기록은 복구할 수 없으며 관련 분석 지표가 재계산됩니다.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-100 rounded-xl"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-4 py-2 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-xl"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Measurement Add / Edit Modal */}
      {isModalOpen && (
        <MeasurementModal
          member={member}
          measurement={editingMeasurement}
          userRole={userRole}
          currentTrainerId={currentTrainerId}
          onClose={() => setIsModalOpen(false)}
          onSuccess={async () => {
            setIsModalOpen(false);
            await onRefresh();
          }}
        />
      )}
    </div>
  );
};

interface MeasurementModalProps {
  member: Member;
  measurement: BodyMeasurement | null;
  userRole?: UserRole;
  currentTrainerId?: string | null;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

const MeasurementModal: React.FC<MeasurementModalProps> = ({
  member,
  measurement,
  userRole,
  currentTrainerId,
  onClose,
  onSuccess
}) => {
  const [measuredAt, setMeasuredAt] = useState(
    measurement?.measuredAt || localToday()
  );
  const [weightKg, setWeightKg] = useState(measurement?.weightKg?.toString() || '');
  const [skeletalMuscleMassKg, setSkeletalMuscleMassKg] = useState(
    measurement?.skeletalMuscleMassKg?.toString() || ''
  );
  const [bodyFatMassKg, setBodyFatMassKg] = useState(
    measurement?.bodyFatMassKg?.toString() || ''
  );
  const [bodyFatPercentage, setBodyFatPercentage] = useState(
    measurement?.bodyFatPercentage?.toString() || ''
  );
  const [waistCm, setWaistCm] = useState(measurement?.waistCm?.toString() || '');
  const [hipCm, setHipCm] = useState(measurement?.hipCm?.toString() || '');
  const [chestCm, setChestCm] = useState(measurement?.chestCm?.toString() || '');
  const [thighCm, setThighCm] = useState(measurement?.thighCm?.toString() || '');
  const [armCm, setArmCm] = useState(measurement?.armCm?.toString() || '');
  const [memo, setMemo] = useState(measurement?.memo || '');

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!measuredAt || !isValidDate(measuredAt)) {
      setError('유효한 측정일자를 입력해주세요 (YYYY-MM-DD).');
      return;
    }

    const parseNum = (val: string): number | undefined => {
      if (!val.trim()) return undefined;
      const n = parseFloat(val);
      if (isNaN(n) || n < 0) return undefined;
      return Number(n.toFixed(2));
    };

    let parsedWeight = parseNum(weightKg);
    let parsedMuscle = parseNum(skeletalMuscleMassKg);
    let parsedFatMass = parseNum(bodyFatMassKg);
    let parsedFatPct = parseNum(bodyFatPercentage);

    // Number Validations:
    if (parsedWeight !== undefined && (parsedWeight <= 0 || parsedWeight > 400)) {
      setError('체중은 0kg 초과 400kg 이하의 유효한 값이어야 합니다.');
      return;
    }
    if (parsedMuscle !== undefined && parsedMuscle <= 0) {
      setError('골격근량은 0kg 초과의 유효한 값이어야 합니다.');
      return;
    }
    if (parsedFatPct !== undefined && (parsedFatPct < 0 || parsedFatPct > 100)) {
      setError('체지방률은 0%에서 100% 사이의 값이어야 합니다.');
      return;
    }
    if (parsedFatMass !== undefined && parsedFatMass < 0) {
      setError('체지방량은 0kg 이상의 값이어야 합니다.');
      return;
    }

    // Correlation & Auto-calculation:
    // 1. If weight & fat % are given, but fat mass is empty: auto-calculate fat mass
    if (parsedWeight !== undefined && parsedFatPct !== undefined && parsedFatMass === undefined) {
      parsedFatMass = Number(((parsedWeight * parsedFatPct) / 100).toFixed(2));
    }
    // 2. If weight & fat mass are given, but fat % is empty: auto-calculate fat %
    else if (parsedWeight !== undefined && parsedFatMass !== undefined && parsedFatPct === undefined) {
      parsedFatPct = Number(((parsedFatMass / parsedWeight) * 100).toFixed(2));
    }

    // Logical Consistency Validations:
    if (parsedWeight !== undefined && parsedMuscle !== undefined && parsedMuscle > parsedWeight) {
      setError('골격근량은 전체 체중을 초과할 수 없습니다.');
      return;
    }
    if (parsedWeight !== undefined && parsedFatMass !== undefined && parsedFatMass > parsedWeight) {
      setError('체지방량은 전체 체중을 초과할 수 없습니다.');
      return;
    }
    if (
      parsedWeight !== undefined &&
      parsedMuscle !== undefined &&
      parsedFatMass !== undefined &&
      parsedMuscle + parsedFatMass > parsedWeight
    ) {
      setError('골격근량과 체지방량의 합이 전체 체중을 초과할 수 없습니다.');
      return;
    }

    // Circumferences
    const parsedWaist = parseNum(waistCm);
    const parsedHip = parseNum(hipCm);
    const parsedChest = parseNum(chestCm);
    const parsedThigh = parseNum(thighCm);
    const parsedArm = parseNum(armCm);

    // At least one metric or memo should be provided
    const hasAnyMetric =
      parsedWeight !== undefined ||
      parsedMuscle !== undefined ||
      parsedFatMass !== undefined ||
      parsedFatPct !== undefined ||
      parsedWaist !== undefined ||
      parsedHip !== undefined ||
      parsedChest !== undefined ||
      parsedThigh !== undefined ||
      parsedArm !== undefined ||
      memo.trim().length > 0;

    if (!hasAnyMetric) {
      setError('최소 하나 이상의 신체 측정값 또는 메모를 입력해주세요.');
      return;
    }

    if (userRole === 'TRAINER' && (!currentTrainerId || member.trainerId !== currentTrainerId)) {
      setError('본인 담당 회원의 신체 측정 기록만 저장할 수 있습니다.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const resolvedTrainerId = currentTrainerId || member.trainerId;

      if (measurement) {
        await updateBodyMeasurement(
          member.centerId,
          measurement.measurementId,
          {
            measuredAt,
            weightKg: parsedWeight,
            skeletalMuscleMassKg: parsedMuscle,
            bodyFatMassKg: parsedFatMass,
            bodyFatPercentage: parsedFatPct,
            waistCm: parsedWaist,
            hipCm: parsedHip,
            chestCm: parsedChest,
            thighCm: parsedThigh,
            armCm: parsedArm,
            memo: memo.trim() || undefined
          },
          userRole,
          currentTrainerId
        );
      } else {
        await createBodyMeasurement(
          {
            centerId: member.centerId,
            memberId: member.memberId,
            trainerId: resolvedTrainerId,
            measuredAt,
            weightKg: parsedWeight,
            skeletalMuscleMassKg: parsedMuscle,
            bodyFatMassKg: parsedFatMass,
            bodyFatPercentage: parsedFatPct,
            waistCm: parsedWaist,
            hipCm: parsedHip,
            chestCm: parsedChest,
            thighCm: parsedThigh,
            armCm: parsedArm,
            memo: memo.trim() || undefined
          },
          userRole,
          currentTrainerId
        );
      }

      await onSuccess();
    } catch (err: any) {
      setError(err?.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-stone-200 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <h4 className="text-base font-semibold text-stone-900">
            {measurement ? '신체 측정 기록 수정' : '신규 신체 측정 등록'}
          </h4>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 text-sm font-medium"
          >
            닫기
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Measurement Date */}
          <div>
            <label htmlFor="input-measured-at" className="block text-xs font-semibold text-stone-700 mb-1">
              측정일자 <span className="text-rose-500">*</span>
            </label>
            <DateInputField
              id="input-measured-at"
              required
              value={measuredAt}
              onChange={setMeasuredAt}
              className="!text-xs !rounded-xl focus:ring-teal-500"
            />
          </div>

          {/* Section 1: InBody Metrics */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-stone-800 block">
              체성분 분석 지표 (인바디 / 체중계)
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-stone-600 mb-0.5">체중 (kg)</label>
                <input
                  id="input-weight"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="예: 75.5"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] text-stone-600 mb-0.5">골격근량 (kg)</label>
                <input
                  id="input-muscle"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="예: 33.2"
                  value={skeletalMuscleMassKg}
                  onChange={(e) => setSkeletalMuscleMassKg(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] text-stone-600 mb-0.5">체지방률 (%)</label>
                <input
                  id="input-fat-pct"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="예: 24.5"
                  value={bodyFatPercentage}
                  onChange={(e) => setBodyFatPercentage(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] text-stone-600 mb-0.5">체지방량 (kg)</label>
                <input
                  id="input-fat-mass"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="예: 18.5"
                  value={bodyFatMassKg}
                  onChange={(e) => setBodyFatMassKg(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Circumferences */}
          <div className="space-y-2 pt-2 border-t border-stone-100">
            <span className="text-xs font-semibold text-stone-800 block">신체 둘레 측정 (cm)</span>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] text-stone-600 mb-0.5">허리둘레</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="cm"
                  value={waistCm}
                  onChange={(e) => setWaistCm(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-300 focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-stone-600 mb-0.5">엉덩이둘레</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="cm"
                  value={hipCm}
                  onChange={(e) => setHipCm(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-300 focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-stone-600 mb-0.5">가슴둘레</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="cm"
                  value={chestCm}
                  onChange={(e) => setChestCm(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-300 focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-stone-600 mb-0.5">허벅지둘레</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="cm"
                  value={thighCm}
                  onChange={(e) => setThighCm(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-300 focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-stone-600 mb-0.5">팔둘레</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="cm"
                  value={armCm}
                  onChange={(e) => setArmCm(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-300 focus:outline-none font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Memo */}
          <div className="pt-2 border-t border-stone-100">
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              측정 메모 (선택)
            </label>
            <input
              type="text"
              placeholder="예: 공복 상태 측정, 1개월차 정기 점검"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-100 rounded-xl"
            >
              취소
            </button>
            <button
              id="btn-save-measurement"
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-xl disabled:opacity-50"
            >
              {isSubmitting ? '저장 중...' : measurement ? '수정 완료' : '등록 완료'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
