import React, { useState, useEffect, useMemo } from 'react';
import {
  Camera,
  ShieldCheck,
  ShieldAlert,
  ArrowLeftRight,
  Calendar,
  X,
  Sparkles,
  Info,
  Loader2,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import type { Member, ProgressPhoto, PhotoViewType, ProgressPhotoConsent } from '../../types';
import { updateMemberPhotoConsent } from '../../services/dataService';

interface MemberPhotosTabProps {
  member: Member;
  photos: ProgressPhoto[];
  onRefreshMember?: () => Promise<void> | void;
  onUpdateMember?: (updatedMember: Member) => void;
}

const VIEW_TYPE_LABELS: Record<PhotoViewType, string> = {
  FRONT: '정면',
  SIDE: '측면',
  BACK: '후면',
  OTHER: '기타'
};

export const MemberPhotosTab: React.FC<MemberPhotosTabProps> = ({
  member,
  photos,
  onRefreshMember,
  onUpdateMember
}) => {
  const [activeFilter, setActiveFilter] = useState<PhotoViewType | 'ALL'>('ALL');
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<ProgressPhoto | null>(null);

  // Consent states
  const [isUpdatingConsent, setIsUpdatingConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);

  // Local consent state for instant zero-latency UI synchronization
  const [localConsent, setLocalConsent] = useState<ProgressPhotoConsent | undefined>(
    member.progressPhotoConsent
  );

  useEffect(() => {
    setLocalConsent(member.progressPhotoConsent);
  }, [member.progressPhotoConsent]);

  // SSOT: granted === true is the sole indicator of active consent
  const consent = localConsent ?? member.progressPhotoConsent;
  const hasConsent = consent?.granted === true;
  const isRevoked = !hasConsent && Boolean(consent?.revokedAt);

  // Compare selection (default to earliest and latest)
  const sortedChronological = useMemo(() => {
    return [...photos].sort((a, b) => {
      const d = a.takenAt.localeCompare(b.takenAt);
      if (d !== 0) return d;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
  }, [photos]);

  const [selectedBeforePhotoId, setSelectedBeforePhotoId] = useState<string>('');
  const [selectedAfterPhotoId, setSelectedAfterPhotoId] = useState<string>('');

  // Option labels for distinguishing multiple photos on same date
  const memberPhotoOptionLabels = useMemo(() => {
    const labels = new Map<string, string>();
    const byDate = new Map<string, ProgressPhoto[]>();
    for (const p of sortedChronological) {
      if (!byDate.has(p.takenAt)) byDate.set(p.takenAt, []);
      byDate.get(p.takenAt)!.push(p);
    }
    for (const [, list] of byDate.entries()) {
      if (list.length === 1) {
        const p = list[0];
        labels.set(p.photoId, `${p.takenAt} (${VIEW_TYPE_LABELS[p.viewType]})`);
      } else {
        list.forEach((p, idx) => {
          labels.set(p.photoId, `${p.takenAt} · #${idx + 1} (${VIEW_TYPE_LABELS[p.viewType]})`);
        });
      }
    }
    return labels;
  }, [sortedChronological]);

  const { resolvedBeforeId, resolvedAfterId } = useMemo(() => {
    if (sortedChronological.length < 2) {
      return {
        resolvedBeforeId: sortedChronological[0]?.photoId || '',
        resolvedAfterId: ''
      };
    }
    let bId = selectedBeforePhotoId;
    let aId = selectedAfterPhotoId;

    if (!bId || !sortedChronological.some((p: ProgressPhoto) => p.photoId === bId)) {
      bId = sortedChronological[0].photoId;
    }
    if (!aId || aId === bId || !sortedChronological.some((p: ProgressPhoto) => p.photoId === aId)) {
      const newest = sortedChronological[sortedChronological.length - 1].photoId;
      if (newest !== bId) {
        aId = newest;
      } else {
        const alt = sortedChronological.find((p: ProgressPhoto) => p.photoId !== bId);
        aId = alt ? alt.photoId : '';
      }
    }
    return { resolvedBeforeId: bId, resolvedAfterId: aId };
  }, [sortedChronological, selectedBeforePhotoId, selectedAfterPhotoId]);

  const beforePhoto = sortedChronological.find((p: ProgressPhoto) => p.photoId === resolvedBeforeId);
  const afterPhoto = sortedChronological.find((p: ProgressPhoto) => p.photoId === resolvedAfterId);

  const beforeOptions = useMemo(() => {
    return sortedChronological.filter((p: ProgressPhoto) => p.photoId !== resolvedAfterId);
  }, [sortedChronological, resolvedAfterId]);

  const afterOptions = useMemo(() => {
    return sortedChronological.filter((p: ProgressPhoto) => p.photoId !== resolvedBeforeId);
  }, [sortedChronological, resolvedBeforeId]);

  // Handle member granting consent
  const handleGrantConsent = async () => {
    try {
      setIsUpdatingConsent(true);
      setConsentError(null);
      const updatedMember = await updateMemberPhotoConsent(
        member.centerId,
        member.memberId,
        true,
        'MEMBER',
        null,
        member.memberId
      );
      if (updatedMember.progressPhotoConsent) {
        setLocalConsent(updatedMember.progressPhotoConsent);
      }
      if (onUpdateMember) {
        onUpdateMember(updatedMember);
      }
      if (onRefreshMember) {
        await onRefreshMember();
      }
    } catch (err: any) {
      console.warn('[Grant Photo Consent Warning]', err);
      setConsentError(err?.message || '동의 처리에 실패했습니다.');
    } finally {
      setIsUpdatingConsent(false);
    }
  };

  // Handle member revoking consent
  const handleRevokeConsent = async () => {
    try {
      setIsUpdatingConsent(true);
      setConsentError(null);
      setShowRevokeConfirm(false);
      const updatedMember = await updateMemberPhotoConsent(
        member.centerId,
        member.memberId,
        false,
        'MEMBER',
        null,
        member.memberId
      );
      if (updatedMember.progressPhotoConsent) {
        setLocalConsent(updatedMember.progressPhotoConsent);
      }
      if (onUpdateMember) {
        onUpdateMember(updatedMember);
      }
      if (onRefreshMember) {
        await onRefreshMember();
      }
    } catch (err: any) {
      console.warn('[Revoke Photo Consent Warning]', err);
      setConsentError(err?.message || '동의 철회 처리에 실패했습니다.');
    } finally {
      setIsUpdatingConsent(false);
    }
  };

  const filteredPhotos = photos.filter((p) => {
    if (activeFilter === 'ALL') return true;
    return p.viewType === activeFilter;
  });

  return (
    <div className="space-y-4 pb-6" id="member-photos-view">
      {/* Consent Action Error Banner */}
      {consentError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{consentError}</span>
          </div>
          <button
            type="button"
            onClick={() => setConsentError(null)}
            className="text-rose-400 hover:text-rose-700 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. MEMBER PHOTO CONSENT MANAGEMENT CARD */}
      <div
        id="member-photo-consent-card"
        className={`rounded-2xl border p-4 transition-all shadow-2xs ${
          hasConsent
            ? 'bg-emerald-50/50 border-emerald-200'
            : isRevoked
            ? 'bg-rose-50/50 border-rose-200'
            : 'bg-stone-50 border-stone-200'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                hasConsent
                  ? 'bg-emerald-100 text-emerald-700'
                  : isRevoked
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-purple-100 text-purple-700'
              }`}
            >
              {hasConsent ? (
                <ShieldCheck className="w-5 h-5" />
              ) : isRevoked ? (
                <ShieldAlert className="w-5 h-5" />
              ) : (
                <Camera className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xs font-bold text-stone-900">
                  {hasConsent
                    ? '체형 사진 촬영 및 보관 동의 완료'
                    : isRevoked
                    ? '체형 사진 촬영 및 보관 동의 철회됨'
                    : '체형 사진 촬영 및 보관 동의'}
                </h3>
                <span
                  id="member-consent-status-badge"
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    hasConsent
                      ? 'bg-emerald-100 text-emerald-800'
                      : isRevoked
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-stone-200 text-stone-700'
                  }`}
                >
                  {hasConsent ? '동의 완료' : isRevoked ? '동의 철회' : '미동의'}
                </span>
              </div>

              <p className="text-[11px] text-stone-600 mt-1 leading-relaxed">
                {hasConsent ? (
                  <>
                    회원 본인의 동의하에 눈바디 변화 기록 및 비교 목적으로 안전하게 보관 중입니다.
                    <span className="block text-[10px] text-stone-400 mt-0.5 font-mono">
                      (동의일시: {(consent?.grantedAt || consent?.consentedAt)?.split('T')[0] || '동의됨'})
                    </span>
                  </>
                ) : isRevoked ? (
                  <>
                    동의가 철회되어 트레이너의 신규 사진 추가가 차단된 상태입니다.
                    <span className="block text-[10px] text-rose-600 mt-0.5 font-mono">
                      (철회일시: {consent?.revokedAt?.split('T')[0] || '철회됨'} • 기존 사진 기록은 보존됨)
                    </span>
                  </>
                ) : (
                  '개인정보 보호를 위해 회원 본인의 동의 후에만 전담 트레이너가 체형 사진을 촬영 및 등록할 수 있습니다.'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {hasConsent ? (
              <button
                type="button"
                id="btn-member-revoke-consent"
                onClick={() => setShowRevokeConfirm(true)}
                disabled={isUpdatingConsent}
                className="px-3 py-1.5 bg-white hover:bg-rose-50 text-stone-700 hover:text-rose-700 border border-stone-200 hover:border-rose-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {isUpdatingConsent ? '처리 중...' : '동의 철회'}
              </button>
            ) : (
              <button
                type="button"
                id="btn-member-grant-consent"
                onClick={handleGrantConsent}
                disabled={isUpdatingConsent}
                className="px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {isUpdatingConsent ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>처리 중...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{isRevoked ? '다시 동의하기' : '사진 보관 동의하기'}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Revoke Confirmation Modal */}
        {showRevokeConfirm && (
          <div className="mt-3 pt-3 border-t border-rose-200/60 bg-rose-50/50 p-3 rounded-xl space-y-2 animate-in fade-in">
            <p className="text-xs font-semibold text-rose-900">
              정말 체형 사진 촬영 및 보관 동의를 철회하시겠습니까?
            </p>
            <p className="text-[11px] text-rose-700 leading-relaxed">
              철회 시 담당 트레이너의 신규 체형 사진 업로드가 즉시 차단됩니다.
              기존에 등록된 사진은 자동 삭제되지 않으며 언제든 다시 동의하실 수 있습니다.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                id="btn-confirm-revoke-consent"
                onClick={handleRevokeConsent}
                disabled={isUpdatingConsent}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                {isUpdatingConsent ? '철회 중...' : '네, 동의 철회합니다'}
              </button>
              <button
                type="button"
                onClick={() => setShowRevokeConfirm(false)}
                className="px-3 py-1.5 bg-white text-stone-700 border border-stone-200 rounded-lg text-xs font-medium hover:bg-stone-50 cursor-pointer"
              >
                취소
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Photo Content Section */}
      {photos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center space-y-3 my-2" id="member-photos-empty">
          <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center mx-auto text-stone-400">
            <Camera className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-stone-800">등록된 눈바디 사진이 없습니다</h4>
            <p className="text-xs text-stone-500 mt-1 max-w-xs mx-auto leading-relaxed">
              {hasConsent
                ? '동의가 완료되었습니다. 담당 트레이너가 PT 수업 중 촬영한 사진이 등록되면 이곳에 표시됩니다.'
                : '상단의 사진 보관 동의를 완료하시면 담당 트레이너가 체형 비교 사진을 등록해 드립니다.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Header with Compare Toggle */}
          <div className="flex items-center justify-between gap-2 pt-2">
            <div>
              <h2 className="text-sm font-bold text-stone-900">
                눈바디 사진 ({photos.length}장)
              </h2>
              {!hasConsent && (
                <span className="text-[10px] text-amber-700 block mt-0.5 font-medium">
                  * 동의 철회 상태로 기존 사진 기록만 열람 중입니다 (신규 추가 차단).
                </span>
              )}
            </div>

            {photos.length >= 2 && (
              <button
                type="button"
                onClick={() => setIsCompareMode(!isCompareMode)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isCompareMode
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-50'
                }`}
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                {isCompareMode ? '일반 갤러리' : '전/후 비교'}
              </button>
            )}
          </div>

      {/* 2. Compare Mode */}
      {isCompareMode && photos.length >= 2 ? (
        <div className="bg-white rounded-2xl border border-stone-200/90 p-4 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-2">
            <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              Before & After 비교
            </span>
            <span className="text-[11px] text-stone-400">사진을 선택하여 직접 비교해보세요</span>
          </div>

          {/* Selectors */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="block text-[11px] text-stone-500 mb-1">Before 사진</label>
              <select
                value={resolvedBeforeId}
                onChange={(e) => setSelectedBeforePhotoId(e.target.value)}
                className="w-full text-xs p-2 bg-stone-50 border border-stone-200 rounded-xl"
              >
                {beforeOptions.map((p: ProgressPhoto) => (
                  <option key={p.photoId} value={p.photoId}>
                    {memberPhotoOptionLabels.get(p.photoId) || p.takenAt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-stone-500 mb-1">After 사진</label>
              <select
                value={resolvedAfterId}
                onChange={(e) => setSelectedAfterPhotoId(e.target.value)}
                className="w-full text-xs p-2 bg-stone-50 border border-stone-200 rounded-xl"
              >
                {afterOptions.map((p: ProgressPhoto) => (
                  <option key={p.photoId} value={p.photoId}>
                    {memberPhotoOptionLabels.get(p.photoId) || p.takenAt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Side by side view */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            {/* Before */}
            <div className="space-y-1.5">
              <div className="bg-stone-900 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-block">
                BEFORE • {beforePhoto?.takenAt}
              </div>
              <div className="aspect-3/4 rounded-xl overflow-hidden bg-stone-100 border border-stone-200">
                {beforePhoto?.photoUrl ? (
                  <img
                    src={beforePhoto.photoUrl}
                    alt="Before"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-stone-400">
                    사진 없음
                  </div>
                )}
              </div>
              {beforePhoto?.caption && (
                <p className="text-[11px] text-stone-600 truncate">{beforePhoto.caption}</p>
              )}
            </div>

            {/* After */}
            <div className="space-y-1.5">
              <div className="bg-purple-700 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-block">
                AFTER • {afterPhoto?.takenAt}
              </div>
              <div className="aspect-3/4 rounded-xl overflow-hidden bg-stone-100 border border-stone-200">
                {afterPhoto?.photoUrl ? (
                  <img
                    src={afterPhoto.photoUrl}
                    alt="After"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-stone-400">
                    사진 없음
                  </div>
                )}
              </div>
              {afterPhoto?.caption && (
                <p className="text-[11px] text-stone-600 truncate">{afterPhoto.caption}</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* 3. Filter Pills */}
      <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-2xl border border-stone-200/90 shadow-2xs">
        {(['ALL', 'FRONT', 'SIDE', 'BACK'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setActiveFilter(v)}
            className={`flex-1 py-1 text-xs rounded-xl font-medium transition-colors ${
              activeFilter === v
                ? 'bg-stone-900 text-white font-bold'
                : 'text-stone-600 hover:bg-stone-50'
            }`}
          >
            {v === 'ALL' ? '전체' : VIEW_TYPE_LABELS[v]}
          </button>
        ))}
      </div>

      {/* 4. Photos Grid */}
      {filteredPhotos.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center space-y-2">
          <Camera className="w-8 h-8 text-stone-300 mx-auto" />
          <p className="text-xs text-stone-500">등록된 눈바디 사진이 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filteredPhotos.map((photo) => (
            <div
              key={photo.photoId}
              onClick={() => setSelectedPhoto(photo)}
              className="bg-white rounded-2xl border border-stone-200/90 overflow-hidden shadow-xs hover:border-purple-300 transition-all cursor-pointer"
            >
              <div className="aspect-3/4 bg-stone-100 overflow-hidden relative">
                {photo.photoUrl ? (
                  <img
                    src={photo.photoUrl}
                    alt={photo.caption || '눈바디 사진'}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-stone-400">
                    사진
                  </div>
                )}
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/60 text-white backdrop-blur-xs">
                  {VIEW_TYPE_LABELS[photo.viewType]}
                </span>
              </div>
              <div className="p-2.5 bg-white space-y-0.5">
                <span className="text-xs font-mono font-bold text-stone-800 block">
                  {photo.takenAt}
                </span>
                {photo.caption && (
                  <p className="text-[11px] text-stone-500 truncate">{photo.caption}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )}

      {/* 5. Photo Zoom Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <span className="text-xs font-bold text-stone-900 font-mono">
                {selectedPhoto.takenAt} ({VIEW_TYPE_LABELS[selectedPhoto.viewType]})
              </span>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="p-1 text-stone-400 hover:text-stone-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="aspect-3/4 bg-stone-100 rounded-xl overflow-hidden">
              <img
                src={selectedPhoto.photoUrl}
                alt="Zoomed"
                className="w-full h-full object-contain bg-black"
                referrerPolicy="no-referrer"
              />
            </div>

            {selectedPhoto.caption && (
              <p className="text-xs text-stone-600 bg-stone-50 p-2.5 rounded-xl border border-stone-100">
                {selectedPhoto.caption}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
