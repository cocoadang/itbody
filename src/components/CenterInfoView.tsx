import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getCenter, updateCenter, createCenter } from '../services/dataService';
import type { Center } from '../types';
import { sanitizePhoneNumber, isValidPhoneNumber } from '../utils/phoneUtils';
import { EmptyState } from './EmptyState';
import {
  Building,
  Save,
  CheckCircle,
  RefreshCw,
  Phone,
  FileText,
  MapPin,
  ShieldCheck,
  Calendar,
  Lock
} from 'lucide-react';

export const CenterInfoView: React.FC = () => {
  const { currentUser, currentCenterName } = useAuth();
  const [center, setCenter] = useState<Center | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [businessNumber, setBusinessNumber] = useState('');

  const fetchCenterInfo = useCallback(async () => {
    if (!currentUser) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getCenter(currentUser.centerId);
      if (data) {
        setCenter(data);
        setName(data.name || '');
        setAddress(data.address || '');
        setPhone(sanitizePhoneNumber(data.phone || ''));
        setBusinessNumber(data.businessNumber || '');
      } else {
        setCenter(null);
      }
    } catch (err) {
      console.error('[CenterInfo fetch error]', err);
      setError('센터 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchCenterInfo();
  }, [fetchCenterInfo]);

  const handleCreateOrUpdateCenter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (currentUser.role !== 'CENTER_ADMIN') {
      alert('센터 정보 수정은 센터 관리자(CENTER_ADMIN) 권한이 필요합니다.');
      return;
    }

    if (phone.trim() && !isValidPhoneNumber(phone, false)) {
      alert('대표 전화번호는 10자리 또는 11자리 숫자(예: 025550199, 01012345678)로 입력해주세요.');
      return;
    }

    try {
      setSaving(true);
      if (center) {
        await updateCenter(currentUser.centerId, {
          name,
          address,
          phone,
          businessNumber
        });
      } else {
        const now = new Date().toISOString();
        await createCenter({
          centerId: currentUser.centerId,
          name: name || currentCenterName,
          address,
          phone,
          businessNumber,
          createdAt: now,
          updatedAt: now
        });
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      fetchCenterInfo();
    } catch (err) {
      console.error('Failed to update center:', err);
      alert('센터 정보 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const isEditable = currentUser?.role === 'CENTER_ADMIN';

  return (
    <div id="center-info-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pb-2 border-b border-stone-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
            센터 기본 정보
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            소속 피트니스 센터의 사업자 정보, 테넌트 식별자 및 공식 연락처입니다.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchCenterInfo}
            disabled={loading}
            className="flex-1 sm:flex-none justify-center flex items-center gap-1.5 px-3 py-2 bg-white border border-stone-200 rounded-lg text-xs font-medium text-stone-700 hover:bg-stone-50 transition-colors cursor-pointer active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-stone-400">
          <RefreshCw className="w-6 h-6 animate-spin mb-2" />
          <p className="text-sm">센터 정보를 불러오는 중입니다...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm">
          {error}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Tenant Identity & Summary */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-xs">
              <div className="w-12 h-12 rounded-xl bg-stone-900 text-white flex items-center justify-center font-bold text-lg mb-3">
                <Building className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-stone-900">
                {name || currentCenterName}
              </h2>
              <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-700 text-xs font-mono font-medium">
                Tenant: {currentUser?.centerId}
              </span>

              <div className="mt-5 pt-4 border-t border-stone-100 space-y-2 text-xs text-stone-600">
                <div className="flex items-center justify-between">
                  <span className="text-stone-400">데이터 테넌트 ID:</span>
                  <span className="font-mono text-stone-800 font-semibold">{currentUser?.centerId}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-stone-400">등록일시:</span>
                  <span className="text-stone-800 font-mono">
                    {center?.createdAt ? new Date(center.createdAt).toLocaleDateString('ko-KR') : '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-stone-400">대표자 / 관리자:</span>
                  <span className="font-semibold text-stone-900">
                    {currentUser?.role === 'CENTER_ADMIN' ? currentUser.name : (center?.name ? `${center.name} 관리자` : '센터 관리자')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-stone-400">내 접속 권한:</span>
                  <span className="font-semibold text-stone-900">
                    {currentUser?.role === 'CENTER_ADMIN' ? '센터 관리자 (수정 가능)' : '트레이너 (조회 전용)'}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 text-xs text-stone-600 space-y-2 leading-relaxed">
              <div className="flex items-center gap-1.5 text-stone-800 font-semibold">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                테넌트 격리 아키텍처 안내
              </div>
              <p>
                ITBODY는 모든 Firestore 컬렉션(회원, 트레이너, 세션)에 <code className="bg-stone-200 px-1 py-0.5 rounded text-stone-800 font-mono">centerId</code>를 필수로 부여하여, 다른 센터의 데이터가 섞이거나 유출되지 않도록 구조적으로 격리합니다.
              </p>
            </div>
          </div>

          {/* Right Column: Center Form / Details */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-xs">
              <div className="flex items-center justify-between pb-4 border-b border-stone-100 mb-6">
                <div>
                  <h3 className="font-bold text-stone-900 text-base">
                    센터 상세 프로필
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {isEditable
                      ? '센터 기본정보를 수정하고 저장할 수 있습니다.'
                      : '트레이너 계정은 센터 정보를 읽기 전용으로 열람합니다.'}
                  </p>
                </div>

                {!isEditable && (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-stone-100 text-stone-500 text-xs font-medium">
                    <Lock className="w-3.5 h-3.5" /> 읽기 전용
                  </span>
                )}

                {saveSuccess && (
                  <span className="flex items-center gap-1 text-xs text-emerald-700 font-semibold">
                    <CheckCircle className="w-4 h-4" /> 저장되었습니다
                  </span>
                )}
              </div>

              <form onSubmit={handleCreateOrUpdateCenter} className="space-y-4 text-xs">
                {/* Center Name */}
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    센터명 (지점명)
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!isEditable}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="예: 잇바디피트니스"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 disabled:opacity-75 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Business Number */}
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    사업자 등록번호
                  </label>
                  <input
                    type="text"
                    disabled={!isEditable}
                    value={businessNumber}
                    onChange={(e) => setBusinessNumber(e.target.value)}
                    placeholder="예: 123-45-67890"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 disabled:opacity-75 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    대표 전화번호
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={11}
                    disabled={!isEditable}
                    value={phone}
                    onChange={(e) => setPhone(sanitizePhoneNumber(e.target.value))}
                    placeholder="025550199"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 disabled:opacity-75 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Address */}
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    센터 주소
                  </label>
                  <input
                    type="text"
                    disabled={!isEditable}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="예: 가상시 테스트로 1"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 disabled:opacity-75 disabled:cursor-not-allowed"
                  />
                </div>

                {isEditable && (
                  <div className="pt-4 border-t border-stone-100 flex justify-end">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-1.5 px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{saving ? '저장 중...' : '센터 정보 저장'}</span>
                    </button>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
