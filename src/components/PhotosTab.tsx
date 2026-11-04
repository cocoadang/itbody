import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Camera,
  ShieldCheck,
  ShieldAlert,
  Plus,
  Trash2,
  Calendar,
  Columns,
  AlertCircle,
  CheckCircle,
  Info,
  Image as ImageIcon,
  X,
  UploadCloud,
  ArrowRight
} from 'lucide-react';
import type {
  Member,
  ProgressPhoto,
  PhotoViewType,
  UserRole
} from '../types';
import {
  getProgressPhotos,
  createProgressPhoto,
  deleteProgressPhoto,
  uploadProgressPhotoFile
} from '../services/dataService';
import { DateInputField } from './DateInputField';
import { isValidDate } from '../utils/dateInputUtils';

interface PhotosTabProps {
  member: Member;
  userRole: UserRole;
  currentTrainerId?: string | null;
  onRefreshMember?: () => Promise<void>;
}

const VIEW_TYPE_LABELS: Record<PhotoViewType, string> = {
  FRONT: '정면',
  SIDE: '측면',
  BACK: '후면',
  OTHER: '기타'
};

export const PhotosTab: React.FC<PhotosTabProps> = ({
  member,
  userRole,
  currentTrainerId,
  onRefreshMember
}) => {
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Consent state (derived from member SSOT: granted === true)
  const consent = member.progressPhotoConsent;
  const isConsentGranted = consent?.granted === true;
  const isConsentRevoked = !isConsentGranted && Boolean(consent?.revokedAt);

  // Authorization check for upload (TRAINER must be assigned trainer, or CENTER_ADMIN)
  const isAssignedTrainer =
    userRole === 'TRAINER' && (!currentTrainerId || member.trainerId === currentTrainerId);
  const isCenterAdmin = userRole === 'CENTER_ADMIN';
  const canUpload = (isCenterAdmin || isAssignedTrainer) && isConsentGranted;

  // Comparison State (angle-based, photoId-based)
  const [compareViewType, setCompareViewType] = useState<PhotoViewType>('FRONT');

  // Track selection per angle: { [viewType]: { beforePhotoId: string; afterPhotoId: string } }
  const [angleSelections, setAngleSelections] = useState<
    Record<PhotoViewType, { beforePhotoId: string; afterPhotoId: string }>
  >({
    FRONT: { beforePhotoId: '', afterPhotoId: '' },
    SIDE: { beforePhotoId: '', afterPhotoId: '' },
    BACK: { beforePhotoId: '', afterPhotoId: '' },
    OTHER: { beforePhotoId: '', afterPhotoId: '' }
  });

  // Add Photo Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [uploadDate, setUploadDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [uploadViewType, setUploadViewType] = useState<PhotoViewType>('FRONT');
  const [uploadCaption, setUploadCaption] = useState<string>('');
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete State
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load photos
  const loadPhotos = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getProgressPhotos(
        member.centerId,
        member.memberId,
        userRole,
        currentTrainerId
      );
      setPhotos(data);
    } catch (err: any) {
      setError(err?.message || '사진 목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPhotos();
  }, [member.memberId, member.centerId]);

  // Photos filtered for current angle, sorted chronologically (oldest first)
  const currentAnglePhotos = useMemo(() => {
    return photos
      .filter((p) => p.viewType === compareViewType)
      .sort((a, b) => {
        const dateCmp = a.takenAt.localeCompare(b.takenAt);
        if (dateCmp !== 0) return dateCmp;
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      });
  }, [photos, compareViewType]);

  // Option labels for photos in current angle (distinguishing multiple photos on same date)
  const photoOptionLabels = useMemo(() => {
    const labels = new Map<string, string>();
    const byDate = new Map<string, ProgressPhoto[]>();
    for (const p of currentAnglePhotos) {
      if (!byDate.has(p.takenAt)) {
        byDate.set(p.takenAt, []);
      }
      byDate.get(p.takenAt)!.push(p);
    }

    for (const [, list] of byDate.entries()) {
      if (list.length === 1) {
        const p = list[0];
        const captionSuffix = p.caption ? ` · "${p.caption.slice(0, 15)}"` : '';
        labels.set(p.photoId, `${p.takenAt}${captionSuffix}`);
      } else {
        list.forEach((p, idx) => {
          const captionSuffix = p.caption ? ` · "${p.caption.slice(0, 15)}"` : '';
          labels.set(p.photoId, `${p.takenAt} · #${idx + 1}${captionSuffix}`);
        });
      }
    }
    return labels;
  }, [currentAnglePhotos]);

  // Derive resolved before and after photo IDs for current angle
  // Rule 1 & 2: Compare only exists with 2 different photos. If 1 photo: Before gets it, After is empty.
  // Rule 3: If >= 2 photos: Default Before = oldest, After = newest.
  const { resolvedBeforeId, resolvedAfterId } = useMemo(() => {
    const count = currentAnglePhotos.length;
    if (count === 0) {
      return { resolvedBeforeId: '', resolvedAfterId: '' };
    }
    if (count === 1) {
      return { resolvedBeforeId: currentAnglePhotos[0].photoId, resolvedAfterId: '' };
    }

    const saved = angleSelections[compareViewType];
    const oldestId = currentAnglePhotos[0].photoId;
    const newestId = currentAnglePhotos[count - 1].photoId;

    let bId = saved?.beforePhotoId;
    let aId = saved?.afterPhotoId;

    // Validate bId
    const bValid = bId && currentAnglePhotos.some((p) => p.photoId === bId);
    if (!bValid) {
      bId = oldestId;
    }

    // Validate aId: Must exist AND must not equal bId (Rule 1, 5)
    const aValid = aId && aId !== bId && currentAnglePhotos.some((p) => p.photoId === aId);
    if (!aValid) {
      if (newestId !== bId) {
        aId = newestId;
      } else {
        const other = currentAnglePhotos.find((p) => p.photoId !== bId);
        aId = other ? other.photoId : '';
      }
    }

    return { resolvedBeforeId: bId, resolvedAfterId: aId };
  }, [currentAnglePhotos, angleSelections, compareViewType]);

  const beforePhoto = useMemo(() => {
    if (!resolvedBeforeId) return undefined;
    return currentAnglePhotos.find((p) => p.photoId === resolvedBeforeId);
  }, [currentAnglePhotos, resolvedBeforeId]);

  const afterPhoto = useMemo(() => {
    if (!resolvedAfterId) return undefined;
    return currentAnglePhotos.find((p) => p.photoId === resolvedAfterId);
  }, [currentAnglePhotos, resolvedAfterId]);

  const handleSelectBeforePhoto = (newBeforeId: string) => {
    setAngleSelections((prev) => {
      let newAfterId = resolvedAfterId;
      if (newBeforeId && newBeforeId === newAfterId) {
        const fallback = currentAnglePhotos.find((p) => p.photoId !== newBeforeId);
        newAfterId = fallback ? fallback.photoId : '';
      }
      return {
        ...prev,
        [compareViewType]: {
          beforePhotoId: newBeforeId,
          afterPhotoId: newAfterId
        }
      };
    });
  };

  const handleSelectAfterPhoto = (newAfterId: string) => {
    setAngleSelections((prev) => {
      let newBeforeId = resolvedBeforeId;
      if (newAfterId && newAfterId === newBeforeId) {
        const fallback = currentAnglePhotos.find((p) => p.photoId !== newAfterId);
        newBeforeId = fallback ? fallback.photoId : '';
      }
      return {
        ...prev,
        [compareViewType]: {
          beforePhotoId: newBeforeId,
          afterPhotoId: newAfterId
        }
      };
    });
  };

  // Rule 5: Options mutual exclusion
  const beforeOptions = useMemo(() => {
    return currentAnglePhotos.filter((p) => p.photoId !== resolvedAfterId);
  }, [currentAnglePhotos, resolvedAfterId]);

  const afterOptions = useMemo(() => {
    return currentAnglePhotos.filter((p) => p.photoId !== resolvedBeforeId);
  }, [currentAnglePhotos, resolvedBeforeId]);

  // Photos grouped by date (descending for history gallery)
  const groupedPhotos = useMemo(() => {
    const map = new Map<string, ProgressPhoto[]>();
    const sorted = [...photos].sort((a, b) => b.takenAt.localeCompare(a.takenAt));
    for (const p of sorted) {
      if (!map.has(p.takenAt)) {
        map.set(p.takenAt, []);
      }
      map.get(p.takenAt)!.push(p);
    }
    return Array.from(map.entries());
  }, [photos]);

  // Handle file select
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('이미지 파일(JPG, PNG, WEBP 등)만 등록 가능합니다.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('사진 크기는 최대 10MB까지 지원합니다.');
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewDataUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Handle submit new photo
  const handleAddPhotoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUpload) {
      if (!isConsentGranted) {
        setError('회원 동의 없이 체형 사진을 등록할 수 없습니다. 상단에서 동의를 먼저 확인해주세요.');
      } else {
        setError('해당 회원의 담당 트레이너 또는 센터 관리자만 사진을 등록할 수 있습니다.');
      }
      return;
    }

    if (!selectedFile && !previewDataUrl) {
      setError('업로드할 사진 파일을 선택해주세요.');
      return;
    }

    if (!uploadDate || !isValidDate(uploadDate)) {
      setError('유효한 촬영 날짜를 입력해주세요 (YYYY-MM-DD).');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const tempId = `temp-${Date.now()}`;
      // Upload to storage abstraction
      const { storagePath, photoUrl } = await uploadProgressPhotoFile(
        member.centerId,
        member.memberId,
        tempId,
        selectedFile || previewDataUrl || '',
        currentTrainerId || member.trainerId
      );

      // Create metadata record
      await createProgressPhoto(
        {
          centerId: member.centerId,
          memberId: member.memberId,
          trainerId: currentTrainerId || member.trainerId,
          takenAt: uploadDate,
          viewType: uploadViewType,
          storagePath,
          photoUrl,
          caption: uploadCaption.trim() || undefined
        },
        userRole,
        currentTrainerId
      );

      setIsAddModalOpen(false);
      setSelectedFile(null);
      setPreviewDataUrl(null);
      setUploadCaption('');
      setSuccessMessage('체형 사진이 정상적으로 등록되었습니다.');
      setTimeout(() => setSuccessMessage(null), 3000);

      await loadPhotos();
    } catch (err: any) {
      setError(err?.message || '사진 등록에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle delete photo
  const handleDeletePhoto = async () => {
    if (!deletingPhotoId) return;
    try {
      setIsDeleting(true);
      setError(null);
      await deleteProgressPhoto(
        member.centerId,
        deletingPhotoId,
        userRole,
        currentTrainerId
      );
      setDeletingPhotoId(null);
      setSuccessMessage('사진 기록이 안전하게 삭제되었습니다.');
      setTimeout(() => setSuccessMessage(null), 3000);
      await loadPhotos();
    } catch (err: any) {
      setError(err?.message || '사진 삭제 중 오류가 발생했습니다.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Messages */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700">
            ✕
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 1. CONSENT STATUS BANNER (관리자/트레이너 조회 전용) */}
      <div
        id="photo-consent-status-banner"
        className={`p-4 rounded-2xl border transition-all ${
          isConsentGranted
            ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
            : isConsentRevoked
            ? 'bg-rose-50/60 border-rose-200 text-rose-900'
            : 'bg-amber-50/60 border-amber-200 text-amber-900'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`p-2 rounded-xl shrink-0 ${
                isConsentGranted
                  ? 'bg-emerald-100 text-emerald-700'
                  : isConsentRevoked
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              {isConsentGranted ? (
                <ShieldCheck className="w-5 h-5" />
              ) : (
                <ShieldAlert className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold">
                  {isConsentGranted
                    ? '체형 사진 촬영 및 보관 동의 완료'
                    : isConsentRevoked
                    ? '체형 사진 촬영 및 보관 동의 철회됨'
                    : '체형 사진 촬영 및 보관 미동의 상태'}
                </h4>
                <span
                  id="badge-photo-consent-status"
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    isConsentGranted
                      ? 'bg-emerald-200/80 text-emerald-800'
                      : isConsentRevoked
                      ? 'bg-rose-200/80 text-rose-800'
                      : 'bg-amber-200 text-amber-800'
                  }`}
                >
                  {isConsentGranted
                    ? '동의 완료'
                    : isConsentRevoked
                    ? '동의 철회'
                    : '미동의'}
                </span>
              </div>
              <p className="text-[11px] mt-0.5 text-stone-600 leading-relaxed">
                {isConsentGranted
                  ? `회원 본인의 직접 동의하에 체형 변화 기록 및 전/후 비교 목적으로 안전하게 보관됩니다. (동의일: ${(consent?.grantedAt || consent?.consentedAt)?.split('T')[0] || '동의 완료'})`
                  : isConsentRevoked
                  ? `회원이 사진 보관 동의를 철회하였습니다. (철회일: ${consent?.revokedAt?.split('T')[0] || '-'}). 신규 사진 촬영 및 추가가 차단됩니다. (동의 및 철회는 회원 본인만 가능)`
                  : '개인정보 보호를 위해 회원이 회원 포털에서 직접 동의한 후에만 신규 사진을 촬영·등록할 수 있습니다.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-stone-500 font-medium bg-white/80 border border-stone-200 px-2.5 py-1 rounded-lg">
              회원 본인 동의 전용
            </span>
          </div>
        </div>
      </div>

      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-stone-200">
        <div>
          <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
            <Camera className="w-4 h-4 text-stone-800" />
            체형 전/후 비교 및 사진 일지
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            정면, 측면, 후면 각도별로 촬영된 사진을 비교하여 눈바디 변화를 직관적으로 확인합니다.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
          {!isConsentGranted && (
            <span
              id="notice-photo-consent-required"
              className="text-[11px] text-amber-700 font-semibold bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200"
            >
              * 회원의 사진 촬영·보관 동의가 필요합니다
            </span>
          )}
          {isConsentGranted && !canUpload && (
            <span
              id="notice-photo-trainer-unassigned"
              className="text-[11px] text-rose-700 font-semibold bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200"
            >
              * 담당 트레이너 또는 센터 관리자만 사진을 등록할 수 있습니다
            </span>
          )}
          <button
            id="btn-open-add-photo-modal"
            onClick={() => {
              if (!canUpload) {
                if (!isConsentGranted) {
                  setError('회원의 사진 촬영·보관 동의가 필요합니다.');
                } else {
                  setError('해당 회원의 담당 트레이너 또는 센터 관리자만 사진을 등록할 수 있습니다.');
                }
                return;
              }
              setIsAddModalOpen(true);
            }}
            disabled={!canUpload}
            title={
              !isConsentGranted
                ? '회원의 사진 촬영·보관 동의가 필요합니다'
                : !canUpload
                ? '해당 회원의 담당 트레이너 또는 센터 관리자만 등록 가능합니다'
                : '사진 기록 추가'
            }
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shadow-xs ${
              canUpload
                ? 'bg-stone-900 hover:bg-stone-800 text-white cursor-pointer active:scale-95'
                : 'bg-stone-200 text-stone-400 cursor-not-allowed'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            사진 기록 추가
          </button>
        </div>
      </div>

      {/* 2. BEFORE / AFTER COMPARISON TOOL (STEP 10, 11, 12, 13) */}
      <div className="bg-white rounded-2xl border border-stone-200/90 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2">
            <Columns className="w-4 h-4 text-stone-700" />
            <h4 className="text-xs font-bold text-stone-900">Before & After 각도별 비교</h4>
          </div>

          {/* View Type Direction Tabs */}
          <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl">
            {(['FRONT', 'SIDE', 'BACK', 'OTHER'] as PhotoViewType[]).map((vt) => (
              <button
                key={vt}
                id={`tab-compare-view-${vt.toLowerCase()}`}
                onClick={() => setCompareViewType(vt)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  compareViewType === vt
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-500 hover:text-stone-700'
                }`}
              >
                {VIEW_TYPE_LABELS[vt]}
              </button>
            ))}
          </div>
        </div>

        {/* Photo Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-3 bg-stone-50/70 rounded-xl border border-stone-200/80">
            <label className="block text-[11px] font-bold text-stone-600 mb-1.5">
              Before (시작/이전 사진 선택)
            </label>
            <select
              id="select-before-date"
              data-testid="select-before-photo"
              value={resolvedBeforeId}
              onChange={(e) => handleSelectBeforePhoto(e.target.value)}
              disabled={currentAnglePhotos.length === 0}
              className="w-full px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800 disabled:bg-stone-100 disabled:text-stone-400"
            >
              <option value="">사진 선택</option>
              {beforeOptions.map((p) => (
                <option key={`before-${p.photoId}`} value={p.photoId}>
                  {photoOptionLabels.get(p.photoId) || p.takenAt}
                </option>
              ))}
            </select>
          </div>

          <div className="p-3 bg-stone-50/70 rounded-xl border border-stone-200/80">
            <label className="block text-[11px] font-bold text-stone-600 mb-1.5">
              After (최근/이후 사진 선택)
            </label>
            <select
              id="select-after-date"
              data-testid="select-after-photo"
              value={resolvedAfterId}
              onChange={(e) => handleSelectAfterPhoto(e.target.value)}
              disabled={currentAnglePhotos.length <= 1}
              className="w-full px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800 disabled:bg-stone-100 disabled:text-stone-400"
            >
              {currentAnglePhotos.length <= 1 ? (
                <option value="">비교할 이후 사진 없음 ({currentAnglePhotos.length}장 등록됨)</option>
              ) : (
                <>
                  <option value="">사진 선택</option>
                  {afterOptions.map((p) => (
                    <option key={`after-${p.photoId}`} value={p.photoId}>
                      {photoOptionLabels.get(p.photoId) || p.takenAt}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
        </div>

        {/* Side by Side Comparison Display */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* BEFORE SIDE */}
          <div className="flex flex-col items-center bg-stone-50/50 rounded-2xl border border-stone-200 p-4 min-h-[320px] justify-center text-center">
            <div className="w-full flex items-center justify-between mb-3 text-xs font-semibold text-stone-500">
              <span className="px-2 py-0.5 rounded bg-stone-200/70 text-stone-700">Before</span>
              <span>
                {beforePhoto
                  ? photoOptionLabels.get(beforePhoto.photoId) || beforePhoto.takenAt
                  : '사진 미선택'}
              </span>
            </div>

            {beforePhoto ? (
              <div className="space-y-2 w-full flex flex-col items-center">
                <div className="w-full max-w-[280px] aspect-3/4 rounded-xl overflow-hidden border border-stone-200 bg-stone-900/5 shadow-xs flex items-center justify-center">
                  <img
                    src={beforePhoto.photoUrl}
                    alt={`Before ${VIEW_TYPE_LABELS[compareViewType]}`}
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
                {beforePhoto.caption && (
                  <p className="text-xs text-stone-600 mt-1 max-w-[280px] bg-white px-3 py-1.5 rounded-lg border border-stone-200 text-left">
                    {beforePhoto.caption}
                  </p>
                )}
              </div>
            ) : (
              <div className="py-12 px-4 text-center">
                <ImageIcon className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                <p className="text-xs font-medium text-stone-600">
                  {currentAnglePhotos.length === 0
                    ? `해당 각도(${VIEW_TYPE_LABELS[compareViewType]})에 등록된 사진이 없습니다.`
                    : '비교할 Before 사진을 선택하세요.'}
                </p>
              </div>
            )}
          </div>

          {/* AFTER SIDE */}
          <div className="flex flex-col items-center bg-stone-50/50 rounded-2xl border border-stone-200 p-4 min-h-[320px] justify-center text-center">
            <div className="w-full flex items-center justify-between mb-3 text-xs font-semibold text-stone-500">
              <span className="px-2 py-0.5 rounded bg-stone-900 text-white">After</span>
              <span>
                {afterPhoto
                  ? photoOptionLabels.get(afterPhoto.photoId) || afterPhoto.takenAt
                  : currentAnglePhotos.length === 1
                  ? '비교 대상 없음'
                  : '사진 미선택'}
              </span>
            </div>

            {afterPhoto ? (
              <div className="space-y-2 w-full flex flex-col items-center">
                <div className="w-full max-w-[280px] aspect-3/4 rounded-xl overflow-hidden border border-stone-200 bg-stone-900/5 shadow-xs flex items-center justify-center">
                  <img
                    src={afterPhoto.photoUrl}
                    alt={`After ${VIEW_TYPE_LABELS[compareViewType]}`}
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
                {afterPhoto.caption && (
                  <p className="text-xs text-stone-600 mt-1 max-w-[280px] bg-white px-3 py-1.5 rounded-lg border border-stone-200 text-left">
                    {afterPhoto.caption}
                  </p>
                )}
              </div>
            ) : currentAnglePhotos.length === 1 ? (
              <div id="notice-after-photo-empty" className="py-12 px-4 text-center">
                <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-2 text-amber-600">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-stone-800">
                  비교할 이후 사진이 없습니다.
                </p>
                <p className="text-[11px] text-stone-500 mt-1 max-w-[260px] mx-auto">
                  선택한 각도({VIEW_TYPE_LABELS[compareViewType]})에 사진이 1장만 등록되어 있습니다. 비교를 위해 새로운 사진을 추가해주세요.
                </p>
              </div>
            ) : (
              <div className="py-12 px-4 text-center">
                <ImageIcon className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                <p className="text-xs font-medium text-stone-600">
                  {currentAnglePhotos.length === 0
                    ? `해당 각도(${VIEW_TYPE_LABELS[compareViewType]})에 등록된 사진이 없습니다.`
                    : '비교할 After 사진을 선택하세요.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. DATE-GROUPED PHOTO GALLERY (STEP 14) */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-stone-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-stone-700" />
            날짜별 사진 보관함 ({photos.length}장)
          </h4>
        </div>

        {/* Empty State (STEP 16 - No fake sample body photos!) */}
        {photos.length === 0 ? (
          <div className="p-10 bg-stone-50/70 rounded-2xl border border-dashed border-stone-300 text-center">
            <Camera className="w-8 h-8 text-stone-300 mx-auto mb-2" />
            <p className="text-xs font-bold text-stone-700">등록된 체형 사진이 없습니다.</p>
            <p className="text-[11px] text-stone-500 mt-1 mb-4">
              회원의 동의를 받은 후 정면, 측면, 후면 사진을 등록하여 눈바디 변화를 체계적으로 기록해보세요.
            </p>
            {isConsentGranted && (
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition-colors"
              >
                첫 사진 등록하기
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {groupedPhotos.map(([date, items]) => (
              <div
                key={date}
                className="bg-white rounded-2xl border border-stone-200/80 p-4 space-y-3 shadow-xs"
              >
                <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-stone-900">{date}</span>
                    <span className="text-[11px] text-stone-400">({items.length}장)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {items.some((p) => p.viewType === compareViewType) && (
                      <>
                        <button
                          onClick={() => {
                            const target = items.find((p) => p.viewType === compareViewType);
                            if (target) handleSelectBeforePhoto(target.photoId);
                          }}
                          className="px-2 py-0.5 text-[10px] font-medium bg-stone-100 text-stone-600 hover:bg-stone-200 rounded cursor-pointer"
                        >
                          Before 설정
                        </button>
                        <button
                          onClick={() => {
                            const target = items.find((p) => p.viewType === compareViewType);
                            if (target) handleSelectAfterPhoto(target.photoId);
                          }}
                          className="px-2 py-0.5 text-[10px] font-medium bg-stone-900 text-white hover:bg-stone-800 rounded cursor-pointer"
                        >
                          After 설정
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {items.map((p) => (
                    <div
                      key={p.photoId}
                      className="group relative bg-stone-50 rounded-xl border border-stone-200 overflow-hidden flex flex-col"
                    >
                      <div className="relative aspect-3/4 bg-stone-100 overflow-hidden flex items-center justify-center">
                        <img
                          src={p.photoUrl}
                          alt={`${p.takenAt} ${VIEW_TYPE_LABELS[p.viewType]}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          referrerPolicy="no-referrer"
                        />
                        <span className="absolute top-2 left-2 px-2 py-0.5 text-[10px] font-semibold bg-black/60 text-white rounded-md backdrop-blur-xs">
                          {VIEW_TYPE_LABELS[p.viewType]}
                        </span>
                        <button
                          onClick={() => setDeletingPhotoId(p.photoId)}
                          className="absolute top-2 right-2 p-1.5 bg-rose-600 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-700 shadow-xs"
                          title="사진 삭제"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                      {p.caption && (
                        <div className="p-2 text-[11px] text-stone-600 border-t border-stone-100 line-clamp-2 bg-white">
                          {p.caption}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ADD PHOTO MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-sm font-bold text-stone-900">새 체형 사진 등록</h3>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setSelectedFile(null);
                  setPreviewDataUrl(null);
                }}
                className="text-stone-400 hover:text-stone-600 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddPhotoSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="upload-photo-date" className="block text-xs font-semibold text-stone-700 mb-1">
                    촬영 날짜
                  </label>
                  <DateInputField
                    id="upload-photo-date"
                    required
                    value={uploadDate}
                    onChange={setUploadDate}
                    className="!text-xs !py-2"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    촬영 방향 (각도)
                  </label>
                  <select
                    value={uploadViewType}
                    onChange={(e) => setUploadViewType(e.target.value as PhotoViewType)}
                    className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800 bg-white"
                  >
                    <option value="FRONT">정면 (FRONT)</option>
                    <option value="SIDE">측면 (SIDE)</option>
                    <option value="BACK">후면 (BACK)</option>
                    <option value="OTHER">기타 (OTHER)</option>
                  </select>
                </div>
              </div>

              {/* File Upload Area */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  사진 파일 선택
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="cursor-pointer p-4 border-2 border-dashed border-stone-300 rounded-xl bg-stone-50 hover:bg-stone-100 transition-colors flex flex-col items-center justify-center text-center"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {previewDataUrl ? (
                    <div className="space-y-2">
                      <img
                        src={previewDataUrl}
                        alt="Preview"
                        className="max-h-40 rounded-lg object-contain mx-auto"
                      />
                      <span className="text-[11px] text-stone-500 block">
                        클릭하여 다른 사진으로 변경
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <UploadCloud className="w-8 h-8 text-stone-400 mx-auto" />
                      <p className="text-xs font-semibold text-stone-700">
                        사진 파일을 클릭하여 업로드
                      </p>
                      <p className="text-[10px] text-stone-400">JPG, PNG, WEBP (최대 10MB)</p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  메모 / 설명 (선택)
                </label>
                <textarea
                  rows={2}
                  value={uploadCaption}
                  onChange={(e) => setUploadCaption(e.target.value)}
                  placeholder="예: 공복 상태 촬영, 어깨 밸런스 점검용"
                  className="w-full p-2.5 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setSelectedFile(null);
                    setPreviewDataUrl(null);
                  }}
                  className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 border border-stone-200 rounded-lg bg-white"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? '저장 중...' : '사진 저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
      {deletingPhotoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-stone-900">사진 삭제 확인</h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              선택한 체형 사진 및 스토리지 원본 파일이 완전히 삭제됩니다. 정말 삭제하시겠습니까?
            </p>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setDeletingPhotoId(null)}
                className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 border border-stone-200 rounded-lg"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDeletePhoto}
                disabled={isDeleting}
                className="px-4 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {isDeleting ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
