// Kakao Maps JS SDK 동적 로더.
//
// 발굴 배경(BUE-MAP-SDK): 지도 화면이 MapMock(가짜 div)으로만 그려지고 있었고
// 실제 지도 SDK 연결이 누락돼 있었다. 형제 프로젝트 triplan과 동일하게 Kakao Maps SDK는
// npm 패키지가 아니라 런타임에 dapi.kakao.com 스크립트로 로드한다(autoload=false →
// 명시적 kakao.maps.load 호출). 따라서 package.json에 지도 SDK 의존성이 없는 것이
// 정상이며, 키(VITE_KAKAO_JS_KEY)만 주입하면 실제 지도가 켜진다. 키가 없거나 로드에
// 실패하면 호출부(RouteMap)가 MapMock으로 폴백해 화면이 깨지지 않는다.

function readViteEnv(name: keyof ImportMetaEnv): string {
  // import.meta.env(브라우저/vite) → process.env(테스트/SSR) 순으로 읽는다.
  const fromImportMeta = import.meta.env[name];
  if (typeof fromImportMeta === 'string') return fromImportMeta;
  const fromProcess = typeof process !== 'undefined' ? process.env[name] : undefined;
  if (typeof fromProcess === 'string') return fromProcess;
  return '';
}

/** Kakao JS 앱키. 미설정이면 지도 로드가 비활성화되고 MapMock 폴백이 유지된다. */
export function getKakaoJsKey(): string {
  return readViteEnv('VITE_KAKAO_JS_KEY');
}

/** SDK ready 판정. window.kakao.maps.Map 생성자가 존재하면 사용 가능. */
export function isKakaoMapsReady(): boolean {
  return typeof window !== 'undefined' && !!window.kakao?.maps?.Map;
}

// SDK ready를 기다리는 단 하나의 in-flight Promise(중복 스크립트 주입 방지).
let mapsLoading: Promise<boolean> | null = null;

const SDK_LOAD_TIMEOUT_MS = 8000;

/**
 * Kakao Maps SDK를 1회만 동적 로드한다. 성공 시 window.kakao.maps 사용 가능.
 * - SSR/비브라우저: false
 * - 키 미설정: 스크립트를 만들지 않고 false (MapMock 폴백 유지)
 * - 로드 실패/타임아웃: false
 */
export function loadKakaoMaps(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(false);
  }
  if (isKakaoMapsReady()) return Promise.resolve(true);
  if (mapsLoading) return mapsLoading;

  const jsKey = getKakaoJsKey();
  if (!jsKey) {
    // 키가 없으면 조용히 폴백(앱키/예외를 raw 로깅하지 않음).
    return Promise.resolve(false);
  }

  mapsLoading = new Promise<boolean>((resolve) => {
    let settled = false;
    let timeoutId: number | null = null;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      // 실패 시 다음 호출이 재시도할 수 있도록 in-flight Promise를 비운다.
      if (!ok) mapsLoading = null;
      resolve(ok);
    };

    const armTimeout = () => {
      timeoutId = window.setTimeout(() => {
        if (!isKakaoMapsReady()) finish(false);
      }, SDK_LOAD_TIMEOUT_MS);
    };

    // HMR 등으로 스크립트가 이미 박혀있으면 load 콜백만 호출.
    const existing = document.querySelector<HTMLScriptElement>('script[data-kakao-maps]');
    if (existing) {
      armTimeout();
      if (window.kakao?.maps?.load) {
        window.kakao.maps.load(() => finish(true));
      } else {
        existing.addEventListener(
          'load',
          () => {
            if (window.kakao?.maps?.load) window.kakao.maps.load(() => finish(true));
            else finish(false);
          },
          { once: true },
        );
        existing.addEventListener('error', () => finish(false), { once: true });
      }
      return;
    }

    const script = document.createElement('script');
    script.dataset.kakaoMaps = '1';
    script.async = true;
    // autoload=false → script onload 후 kakao.maps.load로 모듈을 명시적으로 초기화.
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${jsKey}&autoload=false`;

    // 브라우저가 onerror를 안 쏘는 케이스 대비 타임아웃 폴백.
    armTimeout();

    script.onload = () => {
      if (window.kakao?.maps?.load) {
        window.kakao.maps.load(() => finish(true));
      } else {
        finish(false);
      }
    };
    script.onerror = () => {
      finish(false);
    };
    document.head.appendChild(script);
  });

  return mapsLoading;
}

/** 테스트 격리용 — in-flight 캐시를 비운다. */
export function __resetKakaoMapsLoaderForTest(): void {
  mapsLoading = null;
}
