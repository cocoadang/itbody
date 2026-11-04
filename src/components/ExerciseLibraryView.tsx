import React, { useState, useEffect } from 'react';
import {
  Dumbbell,
  Plus,
  Search,
  Video,
  Edit2,
  Trash2,
  X,
  ExternalLink,
  Filter,
  CheckCircle2,
  Play
} from 'lucide-react';
import type { Exercise, UserRole } from '../types';
import {
  getExercises,
  createExercise,
  updateExercise,
  deleteExercise
} from '../services/dataService';
import { useAuth } from '../context/AuthContext';

export const CATEGORIES = ['웨이트', '머신', '맨몸', '유산소', '스트레칭'] as const;
export const BODY_PARTS = ['하체', '가슴', '등', '어깨', '팔', '복근', '전신'] as const;
export const EQUIPMENTS = ['바벨', '덤벨', '머신', '케이블', '맨몸', '스미스머신', '밴드', '기타'] as const;

// Members add private log entries; staff register reusable center exercises.
export const ExerciseRegistrationForm: React.FC<{
  centerId: string;
  role: UserRole;
  onCreated: (exercise: Exercise) => void;
}> = ({ centerId, role, onCreated }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('웨이트');
  const [bodyPart, setBodyPart] = useState<string>('하체');
  const [equipment, setEquipment] = useState<string>('바벨');
  const [description, setDescription] = useState('');
  const [repUnit, setRepUnit] = useState<'reps' | 'seconds'>('reps');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const allowed = role === 'MEMBER' || role === 'TRAINER' || role === 'CENTER_ADMIN';
  const submit = async () => {
    if (saving || !allowed) return;
    if (!name.trim()) { setError('운동명을 입력해주세요.'); return; }
    setSaving(true);
    setError('');
    try {
      const data = { centerId, name: name.trim(), category, bodyPart, equipment, repUnit, description: description.trim() };
      const now = new Date().toISOString();
      const exercise: Exercise = role === 'MEMBER'
        ? { ...data, exerciseId: `custom-${crypto.randomUUID()}`, createdAt: now, updatedAt: now }
        : await createExercise(data, role);
      onCreated(exercise);
      setOpen(false);
      setName('');
      setDescription('');
    } catch (err: any) {
      setError(err?.message || '운동 저장에 실패했습니다.');
    } finally { setSaving(false); }
  };
  if (!allowed) return null;
  return <div className="p-4 border-b border-stone-100 text-xs space-y-3">
    <button type="button" disabled={saving} onClick={() => { setOpen(!open); setError(''); }} className="font-bold text-emerald-700">
      {open ? '등록 닫기' : role === 'MEMBER' ? '+ 나만의 운동 추가' : '+ 새 운동 등록'}
    </button>
    {open && <div className="space-y-3">
      {role === 'MEMBER' && <p className="text-stone-500">이번 개인운동 기록에만 저장됩니다.</p>}
      <label className="block">운동명 *<input aria-label="새 운동명" disabled={saving} value={name} onChange={e => setName(e.target.value)} className="block w-full border rounded-lg p-2 mt-1" /></label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label>카테고리 *<select aria-label="새 운동 카테고리" disabled={saving} value={category} onChange={e => setCategory(e.target.value)} className="block w-full border rounded-lg p-2">{CATEGORIES.map(v => <option key={v}>{v}</option>)}</select></label>
        <label>운동 부위 *<select aria-label="새 운동 부위" disabled={saving} value={bodyPart} onChange={e => setBodyPart(e.target.value)} className="block w-full border rounded-lg p-2">{BODY_PARTS.map(v => <option key={v}>{v}</option>)}</select></label>
        <label>운동 유형 *<select aria-label="새 운동 유형" disabled={saving} value={equipment} onChange={e => setEquipment(e.target.value)} className="block w-full border rounded-lg p-2">{EQUIPMENTS.map(v => <option key={v}>{v}</option>)}</select></label>
      </div>
      <label className="block">기록 단위<select aria-label="새 운동 기록 단위" disabled={saving} value={repUnit} onChange={e => setRepUnit(e.target.value as 'reps' | 'seconds')} className="block w-full border rounded-lg p-2"><option value="reps">횟수 (회)</option><option value="seconds">시간 (초)</option></select></label>
      <label className="block">설명 및 주의사항<textarea aria-label="새 운동 설명" disabled={saving} value={description} onChange={e => setDescription(e.target.value)} className="block w-full border rounded-lg p-2 mt-1" /></label>
      {error && <p role="alert" className="text-red-600 break-words">{error}</p>}
      <button type="button" disabled={saving} onClick={submit} className="bg-emerald-700 text-white rounded-lg px-3 py-2 disabled:opacity-50">{saving ? '저장 중...' : role === 'MEMBER' ? '개인운동에 추가' : '저장하고 운동 계획에 추가'}</button>
    </div>}
  </div>;
};

export function getYoutubeEmbedUrl(url?: string): string | null {
  if (!url) return null;
  try {
    if (url.includes('youtu.be/')) {
      const id = url.split('youtu.be/')[1]?.split('?')[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (url.includes('youtube.com/watch')) {
      const urlObj = new URL(url);
      const v = urlObj.searchParams.get('v');
      return v ? `https://www.youtube.com/embed/${v}` : null;
    }
    if (url.includes('youtube.com/embed/')) {
      return url;
    }
  } catch {
    return null;
  }
  return null;
}

export const ExerciseLibraryView: React.FC = () => {
  const { currentUser } = useAuth();
  const currentCenterId = currentUser?.centerId || '';
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedBodyPart, setSelectedBodyPart] = useState<string>('ALL');
  const [selectedEquipment, setSelectedEquipment] = useState<string>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<string>('웨이트');
  const [formBodyPart, setFormBodyPart] = useState<string>('하체');
  const [formEquipment, setFormEquipment] = useState<string>('바벨');
  const [formDescription, setFormDescription] = useState('');
  const [formVideoUrl, setFormVideoUrl] = useState('');
  const [formRepUnit, setFormRepUnit] = useState<'reps' | 'seconds'>('reps');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Video Preview Modal
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('');

  useEffect(() => {
    loadExercises();
  }, [currentCenterId]);

  const loadExercises = async () => {
    if (!currentCenterId) return;
    setLoading(true);
    try {
      const list = await getExercises(currentCenterId);
      setExercises(list);
    } catch (err) {
      console.error('Failed to load exercises:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingExercise(null);
    setFormName('');
    setFormRepUnit('reps');
    setFormCategory('웨이트');
    setFormBodyPart('하체');
    setFormEquipment('바벨');
    setFormDescription('');
    setFormVideoUrl('');
    setErrorMessage('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (ex: Exercise) => {
    setEditingExercise(ex);
    setFormName(ex.name);
    setFormRepUnit(ex.repUnit || 'reps');
    setFormCategory(ex.category);
    setFormBodyPart(ex.bodyPart);
    setFormEquipment(ex.equipment);
    setFormDescription(ex.description || '');
    setFormVideoUrl(ex.videoUrl || '');
    setErrorMessage('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !currentCenterId) return;

    if (!formName.trim()) {
      setErrorMessage('운동명을 입력해주세요.');
      return;
    }

    setSaving(true);
    setErrorMessage('');

    try {
      if (editingExercise) {
        await updateExercise(
          currentCenterId,
          editingExercise.exerciseId,
          {
            name: formName.trim(),
            category: formCategory,
            bodyPart: formBodyPart,
            equipment: formEquipment,
            repUnit: formRepUnit,
            description: formDescription.trim(),
            videoUrl: formVideoUrl.trim() || undefined
          },
          currentUser.role
        );
      } else {
        await createExercise(
          {
            centerId: currentCenterId,
            name: formName.trim(),
            category: formCategory,
            bodyPart: formBodyPart,
            equipment: formEquipment,
            repUnit: formRepUnit,
            description: formDescription.trim(),
            videoUrl: formVideoUrl.trim() || undefined
          },
          currentUser.role
        );
      }
      setIsModalOpen(false);
      await loadExercises();
    } catch (err: any) {
      setErrorMessage(err.message || '운동 정보 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (exerciseId: string, name: string) => {
    if (!currentUser || !currentCenterId) return;
    if (!window.confirm(`'${name}' 운동을 라이브러리에서 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await deleteExercise(currentCenterId, exerciseId, currentUser.role);
      await loadExercises();
    } catch (err: any) {
      alert(err.message || '삭제 중 오류가 발생했습니다.');
    }
  };

  // Filtered exercises
  const filteredExercises = exercises.filter((ex) => {
    if (selectedCategory !== 'ALL' && ex.category !== selectedCategory) return false;
    if (selectedBodyPart !== 'ALL' && ex.bodyPart !== selectedBodyPart) return false;
    if (selectedEquipment !== 'ALL' && ex.equipment !== selectedEquipment) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = ex.name.toLowerCase().includes(q);
      const matchDesc = ex.description?.toLowerCase().includes(q) || false;
      const matchPart = ex.bodyPart.toLowerCase().includes(q);
      if (!matchName && !matchDesc && !matchPart) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6" id="exercise-library-page">
      {/* Top Header */}
      <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-stone-900 font-bold text-xl">
            <div className="w-9 h-9 rounded-xl bg-stone-900 text-white flex items-center justify-center shadow-xs">
              <Dumbbell className="w-5 h-5" />
            </div>
            <span>운동 라이브러리</span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            개인운동 배정 및 PT 수업에서 활용되는 센터 공용 표준 운동 데이터베이스입니다 (센터별 격리 보장).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-create-exercise"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>새 운동 등록</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="input-search-exercise"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="운동명, 부위 또는 설명 검색..."
              className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-900 focus:border-stone-900"
            />
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-2">
            <select
              id="select-category-filter"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="text-xs rounded-xl border border-stone-200 px-3 py-2 bg-white text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-900 cursor-pointer"
            >
              <option value="ALL">전체 카테고리</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {/* Body Part Filter */}
            <select
              id="select-bodypart-filter"
              value={selectedBodyPart}
              onChange={(e) => setSelectedBodyPart(e.target.value)}
              className="text-xs rounded-xl border border-stone-200 px-3 py-2 bg-white text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-900 cursor-pointer"
            >
              <option value="ALL">전체 부위</option>
              {BODY_PARTS.map((bp) => (
                <option key={bp} value={bp}>
                  {bp}
                </option>
              ))}
            </select>

            {/* Equipment Filter */}
            <select
              id="select-equipment-filter"
              value={selectedEquipment}
              onChange={(e) => setSelectedEquipment(e.target.value)}
              className="text-xs rounded-xl border border-stone-200 px-3 py-2 bg-white text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-900 cursor-pointer"
            >
              <option value="ALL">전체 기구</option>
              {EQUIPMENTS.map((eq) => (
                <option key={eq} value={eq}>
                  {eq}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Active Filter Chips */}
        {(selectedCategory !== 'ALL' || selectedBodyPart !== 'ALL' || selectedEquipment !== 'ALL' || searchQuery) && (
          <div className="flex items-center gap-2 pt-2 border-t border-stone-100 text-xs text-stone-500">
            <span className="text-[11px] font-medium">필터 적용 중:</span>
            {searchQuery && (
              <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 text-[11px]">
                검색: "{searchQuery}"
              </span>
            )}
            {selectedCategory !== 'ALL' && (
              <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 text-[11px]">
                카테고리: {selectedCategory}
              </span>
            )}
            {selectedBodyPart !== 'ALL' && (
              <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 text-[11px]">
                부위: {selectedBodyPart}
              </span>
            )}
            {selectedEquipment !== 'ALL' && (
              <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 text-[11px]">
                기구: {selectedEquipment}
              </span>
            )}
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('ALL');
                setSelectedBodyPart('ALL');
                setSelectedEquipment('ALL');
              }}
              className="text-[11px] text-stone-400 hover:text-stone-700 underline ml-auto cursor-pointer"
            >
              필터 초기화
            </button>
          </div>
        )}
      </div>

      {/* Exercise Grid */}
      {loading ? (
        <div className="py-20 text-center text-xs text-stone-400">
          운동 라이브러리를 불러오는 중입니다...
        </div>
      ) : filteredExercises.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-xl bg-stone-100 text-stone-400 flex items-center justify-center mx-auto mb-3">
            <Dumbbell className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-stone-800">등록된 운동이 없습니다</p>
          <p className="text-xs text-stone-400 mt-1 max-w-sm mx-auto">
            조건에 맞는 운동이 없거나 아직 등록되지 않았습니다. 상단의 '새 운동 등록' 버튼을 눌러 운동을 추가해보세요.
          </p>
          <button
            onClick={handleOpenCreateModal}
            className="mt-4 px-4 py-2 bg-stone-900 text-white rounded-xl text-xs font-semibold cursor-pointer"
          >
            새 운동 등록하기
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="exercise-grid">
          {filteredExercises.map((ex) => {
            const embedUrl = getYoutubeEmbedUrl(ex.videoUrl);
            return (
              <div
                key={ex.exerciseId}
                id={`exercise-card-${ex.exerciseId}`}
                className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs flex flex-col justify-between hover:border-stone-300 transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-stone-900">{ex.name}</h4>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-700 font-medium text-[11px]">
                          {ex.category}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200 font-medium text-[11px]">
                          {ex.bodyPart}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-medium text-[11px]">
                          {ex.equipment}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <button
                        title="운동 정보 수정"
                        onClick={() => handleOpenEditModal(ex)}
                        className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        title="운동 정보 삭제"
                        onClick={() => handleDelete(ex.exerciseId, ex.name)}
                        className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Description */}
                  {ex.description ? (
                    <p className="text-xs text-stone-600 mt-3 leading-relaxed line-clamp-3">
                      {ex.description}
                    </p>
                  ) : (
                    <p className="text-xs text-stone-400 italic mt-3">등록된 운동 설명이 없습니다.</p>
                  )}
                </div>

                {/* Footer: Video Guide Link / Preview */}
                <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                  {ex.videoUrl ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewVideoUrl(ex.videoUrl || '');
                        setPreviewTitle(ex.name);
                      }}
                      className="inline-flex items-center gap-1 text-purple-700 hover:text-purple-900 font-semibold cursor-pointer"
                    >
                      <Video className="w-3.5 h-3.5 text-purple-600" />
                      <span>영상 가이드 보기</span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-stone-400">영상 가이드 없음</span>
                  )}
                  <span className="text-[10px] text-stone-400">
                    {ex.createdAt ? ex.createdAt.split('T')[0] : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Exercise Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden border border-stone-200 flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
            id="modal-exercise-form"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Dumbbell className="w-5 h-5 text-stone-900" />
                <h3 className="text-sm font-bold text-stone-900">
                  {editingExercise ? '운동 라이브러리 수정' : '새 운동 등록'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              {errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
                  {errorMessage}
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  운동명 <span className="text-rose-500">*</span>
                </label>
                <input
                  id="form-input-exercise-name"
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="예: 바벨 백 스쿼트, 랫 풀 다운, 인클라인 덤벨 프레스"
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-900"
                  required
                />
              </div>

              {/* 3 Selectors Row */}
              <div className="grid grid-cols-3 gap-3">
                {/* Category */}
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">카테고리</label>
                  <select
                    id="form-select-category"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs rounded-xl border border-stone-200 bg-white focus:outline-none focus:ring-1 focus:ring-stone-900 cursor-pointer"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Body Part */}
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">운동 부위</label>
                  <select
                    id="form-select-bodypart"
                    value={formBodyPart}
                    onChange={(e) => setFormBodyPart(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs rounded-xl border border-stone-200 bg-white focus:outline-none focus:ring-1 focus:ring-stone-900 cursor-pointer"
                  >
                    {BODY_PARTS.map((bp) => (
                      <option key={bp} value={bp}>
                        {bp}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Equipment */}
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">운동 기구</label>
                  <select
                    id="form-select-equipment"
                    value={formEquipment}
                    onChange={(e) => setFormEquipment(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs rounded-xl border border-stone-200 bg-white focus:outline-none focus:ring-1 focus:ring-stone-900 cursor-pointer"
                  >
                    {EQUIPMENTS.map((eq) => (
                      <option key={eq} value={eq}>
                        {eq}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold">기록 단위<select aria-label="운동 기록 단위" value={formRepUnit} onChange={e => setFormRepUnit(e.target.value as 'reps' | 'seconds')} className="block w-full border rounded-lg p-2"><option value="reps">횟수 (회)</option><option value="seconds">시간 (초)</option></select></label>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                  운동 설명 및 자세 주의사항
                </label>
                <textarea
                  id="form-textarea-description"
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="예: 척추 중립 유지, 흉곽 열고 견갑골 후인하강. 무릎이 안으로 말리지 않도록 발끝 방향으로 열어주기."
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-900"
                />
              </div>

              {/* Video URL */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  영상 URL (YouTube 또는 외부 링크)
                </label>
                <input
                  id="form-input-video-url"
                  type="url"
                  value={formVideoUrl}
                  onChange={(e) => setFormVideoUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-1 focus:ring-stone-900"
                />
                <p className="text-[11px] text-stone-400 mt-1">
                  YouTube 링크 입력 시 모바일 회원 화면 및 상세 화면에서 인라인 영상 플레이어를 지원합니다.
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900 bg-white border border-stone-200 rounded-xl cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {saving ? '저장 중...' : editingExercise ? '수정 완료' : '운동 등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Video Preview Modal */}
      {previewVideoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
          onClick={() => setPreviewVideoUrl(null)}
        >
          <div
            className="bg-black rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl border border-stone-800"
            onClick={(e) => e.stopPropagation()}
            id="modal-video-preview"
          >
            <div className="bg-stone-900 px-4 py-3 flex items-center justify-between text-white text-xs font-semibold">
              <span className="flex items-center gap-2">
                <Video className="w-4 h-4 text-purple-400" />
                <span>{previewTitle} 영상 가이드</span>
              </span>
              <button
                type="button"
                onClick={() => setPreviewVideoUrl(null)}
                className="p-1 hover:bg-stone-800 rounded text-stone-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="aspect-video w-full bg-black flex items-center justify-center">
              {getYoutubeEmbedUrl(previewVideoUrl) ? (
                <iframe
                  src={getYoutubeEmbedUrl(previewVideoUrl) || ''}
                  title={previewTitle}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="p-8 text-center text-stone-400">
                  <p className="text-sm">외부 링크 영상입니다.</p>
                  <a
                    href={previewVideoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-xl"
                  >
                    <span>새 창에서 영상 보기</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
