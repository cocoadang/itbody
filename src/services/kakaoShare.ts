import { KAKAO_JS_KEY } from '../config/kakao';

// Official Kakao JavaScript SDK, loaded only on screens that send invites.
const SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.4/kakao.min.js';
const SDK_SRI = 'sha384-BGX7Wb16GmRFagri4bLJV2DgipVZaU2AI812GZtHtHzzDQJnfHasDXN5houxv45w';
let loading: Promise<any> | null = null;

export const kakaoShareAvailable = () => !!KAKAO_JS_KEY;

export function loadKakao(): Promise<any> {
  if (!KAKAO_JS_KEY) return Promise.reject(new Error('Kakao key missing'));
  const w = window as any;
  if (w.Kakao?.isInitialized?.()) return Promise.resolve(w.Kakao);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SDK_URL;
      script.integrity = SDK_SRI;
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        try {
          if (!w.Kakao.isInitialized()) w.Kakao.init(KAKAO_JS_KEY);
          resolve(w.Kakao);
        } catch (err) { reject(err); }
      };
      script.onerror = () => { loading = null; reject(new Error('Kakao SDK load failed')); };
      document.head.appendChild(script);
    });
  }
  return loading;
}

/** Opens KakaoTalk's friend/chat picker with the invite. Must run inside a click handler. */
export function sendKakaoInvite(text: string, url: string) {
  const Kakao = (window as any).Kakao;
  if (!Kakao?.isInitialized?.()) throw new Error('Kakao SDK not ready');
  Kakao.Share.sendDefault({
    objectType: 'text',
    text: text.slice(0, 200),
    link: { webUrl: url, mobileWebUrl: url },
    buttonTitle: '초대 열기'
  });
}
