import React from 'react';
import type { MuscleGroup } from '../../types';

// Front/back body diagram like the paper journal. Colors follow the paper habit:
// pushing (chest/shoulders/triceps) teal, pulling (back/biceps) yellow, legs blue, core purple.

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  shoulders: '어깨', chest: '가슴', biceps: '이두', abs: '복근', quads: '허벅지 앞',
  back: '등', triceps: '삼두', lower_back: '허리', glutes: '엉덩이', hamstrings: '허벅지 뒤', calves: '종아리'
};

const COLOR: Record<MuscleGroup, string> = {
  chest: '#5eead4', shoulders: '#5eead4', triceps: '#5eead4',
  back: '#fde047', biceps: '#fde047',
  quads: '#93c5fd', hamstrings: '#93c5fd', glutes: '#93c5fd', calves: '#93c5fd',
  abs: '#d8b4fe', lower_back: '#d8b4fe'
};

// Keyword → muscles. Checked in order; all matching rules apply.
const RULES: Array<[RegExp, MuscleGroup[]]> = [
  [/스쿼트|squat|런지|lunge|스텝업|레그 ?프레스|leg ?press/i, ['quads', 'glutes', 'hamstrings']],
  [/레그 ?익스텐션|leg ?extension/i, ['quads']],
  [/레그 ?컬|leg ?curl|노르딕/i, ['hamstrings']],
  [/루마니안|rdl|굿모닝/i, ['hamstrings', 'glutes', 'lower_back']],
  [/데드 ?리프트|deadlift/i, ['hamstrings', 'glutes', 'lower_back', 'back']],
  [/힙 ?쓰러스트|힙 ?스러스트|브릿지|bridge|thrust|킥백|어브덕션|abduction/i, ['glutes', 'hamstrings']],
  [/카프|calf|종아리/i, ['calves']],
  [/벤치|bench|체스트|chest|푸시 ?업|푸쉬 ?업|push ?up|플라이|fly|딥스|dip/i, ['chest', 'triceps', 'shoulders']],
  [/숄더|shoulder|밀리터리|오버헤드|레터럴|lateral|레이즈|raise|페이스 ?풀|face ?pull/i, ['shoulders']],
  [/랫 ?풀|풀 ?다운|pull ?down|풀 ?업|pull ?up|친 ?업|chin|로우|row|풀오버/i, ['back', 'biceps']],
  [/바이셉|bicep|이두|해머 ?컬|hammer|바벨 ?컬|덤벨 ?컬|^컬/i, ['biceps']],
  [/트라이셉|tricep|삼두|푸시 ?다운|푸쉬 ?다운|push ?down|킥 ?백/i, ['triceps']],
  [/플랭크|plank|크런치|crunch|싯업|sit ?up|레그 ?레이즈|복근|ab |코어|core|러시안/i, ['abs']],
  [/백 ?익스텐션|back ?extension|슈퍼맨/i, ['lower_back']]
];

const BODY_PART_RULES: Record<string, MuscleGroup[]> = {
  가슴: ['chest'], 등: ['back'], 하체: ['quads', 'glutes', 'hamstrings'], 어깨: ['shoulders'],
  팔: ['biceps', 'triceps'], 복근: ['abs'], 코어: ['abs'], 엉덩이: ['glutes'], 둔근: ['glutes'],
  전신: ['quads', 'glutes', 'back', 'chest', 'abs']
};

export function musclesForExercise(name: string, bodyPart?: string): MuscleGroup[] {
  const found = new Set<MuscleGroup>();
  RULES.forEach(([re, groups]) => { if (re.test(name)) groups.forEach((g) => found.add(g)); });
  if (found.size === 0 && bodyPart) (BODY_PART_RULES[bodyPart.trim()] || []).forEach((g) => found.add(g));
  return [...found];
}

type Shape = { m: MuscleGroup; d: string };

// Paths drawn in a 100x200 box per figure.
const FRONT: Shape[] = [
  { m: 'shoulders', d: 'M27 40c2-6 8-8 13-8l-1 9c-4 1-8 4-10 8z M73 40c-2-6-8-8-13-8l1 9c4 1 8 4 10 8z' },
  { m: 'chest', d: 'M39 42c4-2 9-2 10-1v16c-5 1-11 0-14-3 0-6 1-10 4-12z M61 42c-4-2-9-2-10-1v16c5 1 11 0 14-3 0-6-1-10-4-12z' },
  { m: 'biceps', d: 'M26 50c3-2 6-1 8 1l-2 20c-3 1-6 0-8-1z M74 50c-3-2-6-1-8 1l2 20c3 1 6 0 8-1z' },
  { m: 'abs', d: 'M41 60c5 2 13 2 18 0l1 30c-6 3-14 3-20 0z' },
  { m: 'quads', d: 'M37 98c4-1 9 0 12 2l-2 40c-3 2-7 2-10 0-2-14-2-28 0-42z M63 98c-4-1-9 0-12 2l2 40c3 2 7 2 10 0 2-14 2-28 0-42z' }
];
const BACK: Shape[] = [
  { m: 'shoulders', d: 'M27 40c2-6 8-8 13-8l-1 9c-4 1-8 4-10 8z M73 40c-2-6-8-8-13-8l1 9c4 1 8 4 10 8z' },
  { m: 'back', d: 'M39 40c4-3 18-3 22 0 3 8 3 20-2 30-6 3-12 3-18 0-5-10-5-22-2-30z' },
  { m: 'triceps', d: 'M26 50c3-2 6-1 8 1l-2 20c-3 1-6 0-8-1z M74 50c-3-2-6-1-8 1l2 20c3 1 6 0 8-1z' },
  { m: 'lower_back', d: 'M42 73c5 2 11 2 16 0l1 14c-6 2-12 2-18 0z' },
  { m: 'glutes', d: 'M37 90c4-2 9-2 12 0v14c-4 2-9 2-12 0-1-5-1-10 0-14z M63 90c-4-2-9-2-12 0v14c4 2 9 2 12 0 1-5 1-10 0-14z' },
  { m: 'hamstrings', d: 'M37 108c4-1 8-1 11 1l-1 32c-3 2-7 2-10 0-1-11-1-22 0-33z M63 108c-4-1-8-1-11 1l1 32c3 2 7 2 10 0 1-11 1-22 0-33z' },
  { m: 'calves', d: 'M38 148c3-1 6-1 8 1l-1 22c-2 1-5 1-6 0-2-8-2-15-1-23z M62 148c-3-1-6-1-8 1l1 22c2 1 5 1 6 0 2-8 2-15 1-23z' }
];

// Neutral silhouette shared by both figures.
const SILHOUETTE =
  'M50 6a10 10 0 1 1 0 20a10 10 0 1 1 0-20z M44 27h12v5h-12z ' +
  'M28 34c6-4 38-4 44 0 6 4 8 14 8 24l4 36c0 4-6 4-7 0l-5-30-2 30c2 18 2 40-2 76 0 6-8 6-9 0l-3-62h-12l-3 62c-1 6-9 6-9 0-4-36-4-58-2-76l-2-30-5 30c-1 4-7 4-7 0l4-36c0-10 2-20 8-24z';

const Figure: React.FC<{ shapes: Shape[]; selected: Set<MuscleGroup>; onToggle?: (m: MuscleGroup) => void; x: number; label: string }> = ({ shapes, selected, onToggle, x, label }) => (
  <g transform={`translate(${x} 0)`}>
    <path d={SILHOUETTE} fill="#f5f5f4" stroke="#a8a29e" strokeWidth="1" />
    {shapes.map((s) => {
      const on = selected.has(s.m);
      return (
        <path
          key={s.m}
          d={s.d}
          fill={on ? COLOR[s.m] : '#e7e5e4'}
          stroke={on ? '#57534e' : '#a8a29e'}
          strokeWidth="0.8"
          style={onToggle ? { cursor: 'pointer' } : undefined}
          onClick={onToggle ? () => onToggle(s.m) : undefined}
        >
          <title>{MUSCLE_LABELS[s.m]}</title>
        </path>
      );
    })}
    <text x="50" y="196" textAnchor="middle" fontSize="9" fill="#78716c">{label}</text>
  </g>
);

export const BodyMap: React.FC<{
  selected: MuscleGroup[];
  onToggle?: (m: MuscleGroup) => void;
  className?: string;
}> = ({ selected, onToggle, className }) => {
  const set = new Set(selected);
  return (
    <div className={className}>
      <svg viewBox="0 0 210 200" role="img" aria-label={`운동 부위: ${selected.map((m) => MUSCLE_LABELS[m]).join(', ') || '없음'}`} className="w-full h-auto max-w-xs">
        <Figure shapes={FRONT} selected={set} onToggle={onToggle} x={0} label="앞" />
        <Figure shapes={BACK} selected={set} onToggle={onToggle} x={110} label="뒤" />
      </svg>
      {selected.length > 0 && (
        <p className="text-xs text-stone-600 mt-1">{selected.map((m) => MUSCLE_LABELS[m]).join(' · ')}</p>
      )}
    </div>
  );
};

export const ALL_MUSCLES = Object.keys(MUSCLE_LABELS) as MuscleGroup[];
