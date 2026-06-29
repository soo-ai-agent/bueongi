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
  addControl(control: KakaoMapControl, position: KakaoControlPosition): void;
}

interface KakaoMapControl {}
type KakaoControlPosition = string;

interface KakaoMapOverlay {
  setMap(map: KakaoMap | null): void;
}

type KakaoServicesStatus = 'OK' | 'ZERO_RESULT' | 'ERROR';

/** coord2RegionCode 결과 행(법정동 B / 행정동 H). code는 10자리 지역코드. */
interface KakaoRegionCodeResult {
  region_type: string;
  code: string;
  address_name?: string;
}

interface KakaoGeocoder {
  coord2RegionCode(
    x: number,
    y: number,
    callback: (result: KakaoRegionCodeResult[], status: KakaoServicesStatus) => void,
  ): void;
}

/** 키워드 장소검색 결과 1건(Kakao Local). x=경도(lng), y=위도(lat) 문자열. */
interface KakaoPlace {
  place_name: string;
  address_name?: string;
  road_address_name?: string;
  x: string;
  y: string;
}

interface KakaoPlaces {
  keywordSearch(
    keyword: string,
    callback: (result: KakaoPlace[], status: KakaoServicesStatus) => void,
    options?: { size?: number },
  ): void;
}

interface KakaoMapsServices {
  Geocoder: new () => KakaoGeocoder;
  Places: new () => KakaoPlaces;
  Status: { OK: KakaoServicesStatus; ZERO_RESULT: KakaoServicesStatus; ERROR: KakaoServicesStatus };
}

interface KakaoMapsApi {
  load(callback: () => void): void;
  services?: KakaoMapsServices;
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
    content: string | HTMLElement;
    yAnchor?: number;
    xAnchor?: number;
    zIndex?: number;
    clickable?: boolean;
  }) => KakaoMapOverlay;
  Polyline: new (options: {
    path: KakaoMapsLatLng[];
    strokeWeight: number;
    strokeColor: string;
    strokeOpacity: number;
    strokeStyle: string;
  }) => KakaoMapOverlay;
  ZoomControl: new () => KakaoMapControl;
  ControlPosition: Record<string, KakaoControlPosition>;
}

interface KakaoMapsGlobal {
  maps: KakaoMapsApi;
}

interface Window {
  kakao?: KakaoMapsGlobal;
}
