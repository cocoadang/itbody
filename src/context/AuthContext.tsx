import React, { createContext, useContext, useState, useEffect } from 'react';
import { memberApi, takePrefetchedSession, captureInvite, readInvite, clearInvite, type CenterMembership, type MemberJoinRequest } from '../services/memberAccessService';
import type { UserProfile, UserRole } from '../types';
import { auth, db, isFirestoreAvailable, isDevSandbox } from '../firebase/config';
import {
  onIdTokenChanged,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser
} from 'firebase/auth';
import { initializeDevSandbox } from '../services/dataService';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

interface AuthContextType {
  memberAccount: boolean;
  memberships: CenterMembership[];
  memberRequests: MemberJoinRequest[];
  refreshMemberSession: () => Promise<void>;
  selectMemberCenter: (centerId: string) => Promise<void>;
  currentUser: UserProfile | null;
  currentCenterName: string;
  firebaseAuthUser: FirebaseUser | null;
  isLoading: boolean;
  profileError: string | null;
  clearProfileError: () => void;
  loginWithFirebase: (email: string, pass: string) => Promise<void>;
  selectDevRole: (role: UserRole, memberIndex?: number) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [firebaseAuthUser, setFirebaseAuthUser] = useState<FirebaseUser | null>(null);
  const [realUserProfile, setRealUserProfile] = useState<UserProfile | null>(null);
  const [userCenterName, setUserCenterName] = useState<string>('');
  const [memberAccount, setMemberAccount] = useState(false);
  const [memberships, setMemberships] = useState<CenterMembership[]>([]);
  const [memberRequests, setMemberRequests] = useState<MemberJoinRequest[]>([]);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Clean up any legacy preset or temporary member session tokens
  useEffect(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('pt_journey_user_id');
      }
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('pt_journey_member_session');
      }
    } catch {
      // Ignore storage cleanup errors
    }
  }, []);

  // Listen to Firebase Auth state
  useEffect(() => {
    if (isDevSandbox) {
      let mounted = true;
      initializeDevSandbox().then(() => {
        if (mounted) setIsLoading(false);
      }).catch(() => {
        if (mounted) { setProfileError('테스트 데이터 초기화에 실패했습니다.'); setIsLoading(false); }
      });
      return () => { mounted = false; };
    }
    if (!auth) {
      setIsLoading(false);
      return;
    }

    let revision = 0;
    // The ID token refreshes about once an hour. Reloading the profile then showed the
    // full-screen loader, remounted the app and discarded anything being typed, so the
    // profile is reloaded only when the signed-in account or its member center changes.
    let loadedKey = '';
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      const version = ++revision;
      setFirebaseAuthUser(user);
      if (user) {
        let token: Awaited<ReturnType<typeof user.getIdTokenResult>>;
        try { token = await user.getIdTokenResult(); } catch { token = null as any; }
        if (version !== revision) return;
        const key = token ? `${user.uid}|${token.claims.portalCenterId || ''}|${token.claims.portalMemberId || ''}` : '';
        if (key && key === loadedKey) return;
        setIsLoading(true);
        setProfileError(null);
        let failed = false;

        try {
          if (!token) token = await user.getIdTokenResult();
          if (version !== revision) return;
          setMemberAccount(token.claims.portalAccount === true);
          if (token.claims.portalAccount === true) {
            captureInvite();
            const inviteCode = readInvite();
            if (inviteCode) {
              clearInvite();
              const linked = await memberApi('/api/auth/kakao/link', { inviteCode });
              await signInWithCustomToken(auth, linked.customToken);
              return;
            }
            const session = takePrefetchedSession(user.uid) || await memberApi('/api/member/session');
            if (version !== revision) return;
            setMemberships(session.memberships); setMemberRequests(session.requests);
            const active = session.memberships.find((m: CenterMembership) => m.centerId === token.claims.portalCenterId && m.memberId === token.claims.portalMemberId);
            setRealUserProfile(active ? { uid: user.uid, email: user.email || '', role: 'MEMBER', centerId: active.centerId, memberId: active.memberId, name: active.name } : null);
            setUserCenterName(active?.centerName || ''); setProfileError(null);
            return;
          }
          setMemberships([]); setMemberRequests([]);
          if (isFirestoreAvailable && db) {
            const userDocRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userDocRef);
            if (userSnap.exists()) {
              const udata = userSnap.data();
              const validRoles: UserRole[] = ['CENTER_ADMIN', 'TRAINER', 'MEMBER'];
              const role = udata.role as UserRole;
              const centerId = udata.centerId;

              // Strictly validate role and centerId (Fail-Closed)
              if (!role || !validRoles.includes(role)) {
                setRealUserProfile(null);
                setUserCenterName('');
                setProfileError('계정에 유효한 접근 권한(role: CENTER_ADMIN / TRAINER / MEMBER)이 지정되지 않았습니다. 관리자에게 문의해주세요.');
              } else if (!centerId || typeof centerId !== 'string' || centerId.trim() === '') {
                setRealUserProfile(null);
                setUserCenterName('');
                setProfileError('계정에 소속 센터(centerId)가 지정되지 않았습니다. 관리자에게 계정 소속 설정을 요청해주세요.');
              } else {
                let resolvedTrainerId = udata.trainerId;
                let resolvedName = udata.name || user.displayName || '사용자';

                // Trainer link and center name are independent lookups: run them together.
                const [trainersList, centerName] = await Promise.all([
                  role === 'TRAINER'
                    ? getDocs(query(collection(db, 'trainers'), where('centerId', '==', centerId.trim())))
                        .then((snap) => snap.docs.map((d) => d.data() as any))
                        .catch((trainerLookupErr) => { console.warn('[AuthContext] Could not query trainers collection:', trainerLookupErr); return [] as any[]; })
                    : Promise.resolve([] as any[]),
                  udata.centerName
                    ? Promise.resolve(udata.centerName as string)
                    : getDoc(doc(db, 'centers', centerId.trim())).then((c) => (c.exists() ? c.data()?.name || '' : '')).catch(() => '')
                ]);

                if (role === 'TRAINER') {
                  // 1st Priority: UID match, 2nd: user document's trainerId, 3rd: loginEmail
                  let matchedTrainer = trainersList.find((t) => t.uid && t.uid === user.uid);
                  if (!matchedTrainer && udata.trainerId) {
                    matchedTrainer = trainersList.find((t) => t.trainerId === udata.trainerId);
                  }
                  if (!matchedTrainer && user.email) {
                    const lowerEmail = user.email.toLowerCase();
                    matchedTrainer = trainersList.find((t) => t.loginEmail && t.loginEmail.toLowerCase() === lowerEmail);
                  }
                  if (matchedTrainer) {
                    resolvedTrainerId = matchedTrainer.trainerId;
                    resolvedName = matchedTrainer.name || resolvedName;
                  }
                }
                const resolvedCenterName = centerName;
                setUserCenterName(resolvedCenterName);

                const profile: UserProfile = {
                  uid: user.uid,
                  email: user.email || udata.email || '',
                  name: resolvedName,
                  role: role,
                  centerId: centerId.trim(),
                  trainerId: resolvedTrainerId,
                  memberId: udata.memberId
                };
                setRealUserProfile(profile);
                setProfileError(null);
              }
            } else {
              // Fail-Closed: User document missing in Firestore
              setRealUserProfile(null);
              setUserCenterName('');
              setProfileError(`등록된 사용자 프로필(users/${user.uid})이 존재하지 않습니다. 관리자에게 계정 등록을 요청해주세요.`);
            }
          } else {
            // Fail-Closed: Firestore not available
            setRealUserProfile(null);
            setUserCenterName('');
            setProfileError('Firestore 데이터베이스에 연결할 수 없습니다.');
          }
        } catch (err: any) {
          failed = true;
          console.error('[AuthContext] Failed to load Firestore users/{uid}:', err);
          setRealUserProfile(null);
          setUserCenterName('');
          setProfileError(`사용자 프로필을 확인하는 중 오류가 발생했습니다: ${err.message || '접근 권한 부족'}`);
        } finally {
          if (version === revision) {
            loadedKey = failed ? '' : key;
            setIsLoading(false);
          }
        }
      } else {
        loadedKey = '';
        setMemberAccount(false); setMemberships([]); setMemberRequests([]);
        setRealUserProfile(null);
        setUserCenterName('');
        setProfileError(null);
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Standard Operation SSOT: Only authentic Firebase Auth profile is considered currentUser
  const currentUser: UserProfile | null = realUserProfile;
  const currentCenterName = userCenterName || currentUser?.centerId || '내 센터';

  const clearProfileError = () => {
    setProfileError(null);
  };

  const loginWithFirebase = async (email: string, pass: string) => {
    if (!auth) throw new Error('Firebase Auth is not initialized');
    setProfileError(null);
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const selectDevRole = async (role: UserRole, memberIndex = 1) => {
    if (!isDevSandbox) throw new Error('개발 전용 기능입니다.');
    if (!['CENTER_ADMIN', 'TRAINER', 'MEMBER'].includes(role) || ![1, 2, 3, 4].includes(memberIndex)) {
      throw new Error('유효하지 않은 테스트 역할입니다.');
    }
    await initializeDevSandbox();
    setFirebaseAuthUser(null);
    setRealUserProfile({
      uid: role === 'MEMBER' ? `dev-member-${memberIndex}` : `dev-${role.toLowerCase()}`,
      email: 'test@example.invalid', name: `테스트 ${role}`, role, centerId: 'dev-sandbox',
      trainerId: 'dev-trainer', memberId: role === 'MEMBER' ? `mem-dev-sandbox-0${memberIndex}` : undefined
    });
    setUserCenterName('개발 테스트 센터');
    setProfileError(null);
  };

  const refreshMemberSession = async () => {
    const session = await memberApi('/api/member/session');
    setMemberships(session.memberships); setMemberRequests(session.requests);
  };
  const selectMemberCenter = async (centerId: string) => {
    if (!auth) throw new Error('로그인 서비스를 이용할 수 없습니다.');
    const data = await memberApi('/api/member/select-center', { centerId });
    await signInWithCustomToken(auth, data.customToken);
  };
  const logout = async () => {
    if (auth && auth.currentUser) {
      try {
        await signOut(auth);
      } catch (err) {
        console.warn('Firebase signOut error:', err);
      }
    }
    setRealUserProfile(null);
    setUserCenterName('');
    setProfileError(null);
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('pt_journey_member_session');
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('pt_journey_user_id');
      }
    } catch {
      // Ignore storage errors
    }
  };

  return (
    <AuthContext.Provider
      value={{
        memberAccount, memberships, memberRequests, refreshMemberSession, selectMemberCenter,
        currentUser,
        currentCenterName,
        firebaseAuthUser,
        isLoading,
        profileError,
        clearProfileError,
        loginWithFirebase,
        logout,
        selectDevRole,
        isAuthenticated: !!currentUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
