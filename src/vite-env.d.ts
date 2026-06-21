/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KAKAO_JS_KEY?: string;
  /** E-1 Tmap 보행자 경로 AppKey. 앱이 Tmap을 직접 호출(서버 프록시 금지). */
  readonly VITE_TMAP_APP_KEY?: string;
  /** 정적 안심 데이터(CCTV/지킴이집/파출소/비상벨/조명/안심길) CDN base URL. */
  readonly VITE_CDN_BASE_URL?: string;
  /** 서울 열린데이터광장 A-1/A-2/A-3 안심귀갓길 Open API 인증키. */
  readonly VITE_SEOUL_OPENAPI_KEY?: string;
  /** 위치 공유 서버 base URL(POST /share/create 등). */
  readonly VITE_SHARE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface KakaoMapsLatLng {}

interface KakaoMapsLatLngBounds {
  extend(position: KakaoMapsLatLng): void;
}

interface KakaoMap {
  relayout(): void;
  setBounds(bounds: KakaoMapsLatLngBounds): void;
}

interface KakaoMapOverlay {
  setMap(map: KakaoMap | null): void;
}

interface KakaoMapsApi {
  load(callback: () => void): void;
  Map: new (
    container: HTMLElement,
    options: {
      center: KakaoMapsLatLng;
      level: number;
      draggable?: boolean;
      scrollwheel?: boolean;
    },
  ) => KakaoMap;
  LatLng: new (lat: number, lng: number) => KakaoMapsLatLng;
  LatLngBounds: new () => KakaoMapsLatLngBounds;
  CustomOverlay: new (options: {
    position: KakaoMapsLatLng;
    content: string;
    yAnchor?: number;
    xAnchor?: number;
  }) => KakaoMapOverlay;
  Polyline: new (options: {
    path: KakaoMapsLatLng[];
    strokeWeight: number;
    strokeColor: string;
    strokeOpacity: number;
    strokeStyle: string;
  }) => KakaoMapOverlay;
}

interface KakaoMapsGlobal {
  maps: KakaoMapsApi;
}

interface Window {
  kakao?: KakaoMapsGlobal;
}
