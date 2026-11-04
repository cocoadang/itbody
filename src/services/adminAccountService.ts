import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebase/config';

export interface ProvisionAccountResponse {
  success: boolean;
  uid?: string;
  email?: string;
  name?: string;
  resetLink?: string;
  message?: string;
  error?: string;
}

/**
 * Phase 10B: Firebase Functions 2nd gen HTTPS Callable 기반
 * CENTER_ADMIN용 회원/트레이너 Firebase 로그인 계정 자동 발급 API 호출
 * 클라이언트는 targetType과 targetId만 전달하며,
 * Cloud Function이 Firestore 대상 문서에서 직접 email, name, centerId를 읽어 안전하게 계정을 생성합니다.
 */
export async function provisionAccount(
  targetType: 'MEMBER' | 'TRAINER',
  targetId: string
): Promise<ProvisionAccountResponse> {
  if (!auth?.currentUser) {
    throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해주세요.');
  }

  try {
    const provisionAccountFn = httpsCallable<
      { targetType: 'MEMBER' | 'TRAINER'; targetId: string },
      ProvisionAccountResponse
    >(functions, 'provisionAccount');

    const result = await provisionAccountFn({ targetType, targetId });
    return result.data;
  } catch (error: any) {
    console.warn('[AdminAccountService] provisionAccount warning:', error?.message || error);
    throw new Error(error?.message || '계정 발급에 실패했습니다.');
  }
}

/**
 * Phase 10B: Firebase Functions 2nd gen HTTPS Callable 기반
 * 이미 UID가 연결된 회원/트레이너용 비밀번호 재설정 링크 생성 API 호출
 */
export async function generateResetPasswordLink(
  targetType: 'MEMBER' | 'TRAINER',
  targetId: string
): Promise<ProvisionAccountResponse> {
  if (!auth?.currentUser) {
    throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해주세요.');
  }

  try {
    const resetPasswordLinkFn = httpsCallable<
      { targetType: 'MEMBER' | 'TRAINER'; targetId: string },
      ProvisionAccountResponse
    >(functions, 'resetPasswordLink');

    const result = await resetPasswordLinkFn({ targetType, targetId });
    return result.data;
  } catch (error: any) {
    console.warn('[AdminAccountService] generateResetPasswordLink warning:', error?.message || error);
    throw new Error(error?.message || '비밀번호 재설정 링크 생성에 실패했습니다.');
  }
}
