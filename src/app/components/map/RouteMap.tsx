import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../ui/utils';
import { MapMock } from './MapMock';
import { loadKakaoMaps } from '../../utils/kakaoMaps';
import type { LatLng } from '../../utils/routeCompare';

export type RouteMapPoiType = 'cctv' | 'bell' | 'store' | 'police' | 'safehouse' | 'start' | 'end';

export interface RouteMapPoi {
  type: RouteMapPoiType;
  /** MapMock 폴백용 화면 백분율 좌표 (0-100) */
  x: number;
  y: number;
  /** 실지도 투영용 실좌표. 둘 다 있을 때만 실제 지도에 마커로 표시된다. */
  lat?: number;
  lng?: number;
  name?: string;
}

interface RouteMapProps {
  /** 출발지(현재 위치). 없으면 출발 마커/경로선을 그리지 않는다. */
  origin?: LatLng | null;
  /** 목적지. */
  destination?: LatLng | null;
  /** 경로 주변 안심 시설 등 POI. lat/lng가 있으면 실지도에 투영된다. */
  pois?: RouteMapPoi[];
  showRoute?: boolean;
  routeType?: 'safe' | 'fast' | 'main';
  active?: boolean;
  className?: string;
  zoom?: number;
  /** Tmap 보행자 경로 상세 좌표열. 있으면 직선 대신 실제 경로를 Polyline으로 그린다. */
  path?: LatLng[];
  /** 내비게이션 중 실시간 현재 위치. 별도 마커(파란 점)로 표시된다. */
  livePosition?: LatLng | null;
}

const ROUTE_COLORS: Record<NonNullable<RouteMapProps['routeType']>, string> = {
  safe: '#34d399',
  fast: '#60a5fa',
  main: '#fbbf24',
};

// MapMock의 POI 색 체계와 동일하게 맞춘 CustomOverlay 마커 HTML.
const POI_BORDER: Record<RouteMapPoiType, string> = {
  cctv: '#34d399',
  bell: '#f87171',
  store: '#60a5fa',
  police: '#3b82f6',
  safehouse: '#a78bfa',
  start: '#475569',
  end: '#3b82f6',
};

// 시설 유형별 구분 글리프(lucide 계열 stroke path). MapMock의 아이콘과 의미를 맞춰
// CCTV(카메라)·비상벨(종)·안심집(집)·편의점(상점)·지구대(방패)를 실지도에서도 한눈에 구분한다.
// start/end는 글리프 없이 점으로 둔다.
const POI_GLYPH: Partial<Record<RouteMapPoiType, string>> = {
  cctv: '<path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  safehouse: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  store: '<path d="m2 7 1.5-3h17L22 7"/><path d="M4 7v13a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V7"/><path d="M2 7h20"/>',
  police: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
};

function isFiniteCoord(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasLatLng<T extends { lat?: number | null; lng?: number | null }>(
  p: T,
): p is T & { lat: number; lng: number } {
  return isFiniteCoord(p.lat) && isFiniteCoord(p.lng);
}

/**
 * 실지도 CustomOverlay 마커 HTML. 시설 유형은 테두리 색 + 내부 글리프로 구분하고,
 * start/end는 글리프 없는 점으로 둔다. (테스트에서 유형별 구분을 검증하므로 export.)
 */
export function poiMarkerHtml(type: RouteMapPoiType): string {
  const color = POI_BORDER[type];
  const glyph = POI_GLYPH[type];
  if (!glyph) {
    const fill = type === 'end' ? '#3b82f6' : type === 'start' ? '#e2e8f0' : '#475569';
    // 출발/도착: 작은 원형 핀.
    return `<div data-poi="${type}" style="width:18px;height:18px;border-radius:9999px;background:${fill};border:3px solid ${color};box-shadow:0 1px 4px rgba(0,0,0,.4);transform:translate(-50%,-50%)"></div>`;
  }
  // 시설: slate 배지 + 유형색 테두리 + 유형색 글리프(MapMock과 동일 색 체계).
  const svg =
    `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="${color}"` +
    ` stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg>`;
  return (
    `<div data-poi="${type}" title="${POI_TITLE[type] ?? ''}" style="display:flex;align-items:center;justify-content:center;` +
    `width:26px;height:26px;border-radius:9999px;background:#475569;border:2px solid ${color};` +
    `box-shadow:0 1px 4px rgba(0,0,0,.4);transform:translate(-50%,-50%)">${svg}</div>`
  );
}

/** 내비게이션 실시간 위치 마커 HTML(파란 맥동 원 + 흰 테두리). */
export function livePositionMarkerHtml(): string {
  return `<div style="position:relative;width:20px;height:20px;transform:translate(-50%,-50%)">
      <div style="position:absolute;inset:0;background:#3b82f6;border-radius:9999px;opacity:0.3;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite"></div>
      <div style="position:absolute;inset:3px;background:#3b82f6;border-radius:9999px;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>
    </div>`;
}

// 마커 hover 라벨. 안심집(B-2)은 "지정 상태"일 뿐 영업시간 보장이 아님을 명시한다.
const POI_TITLE: Partial<Record<RouteMapPoiType, string>> = {
  cctv: 'CCTV',
  bell: '비상벨',
  store: '편의점',
  police: '지구대·파출소',
  safehouse: '여성안심지킴이집(지정 상태·영업시간 정보 없음)',
};

/**
 * 안심 귀가 경로 지도.
 * - 키(VITE_KAKAO_JS_KEY)가 있고 SDK 로드에 성공하면 실제 Kakao 지도에 출발/목적지 마커,
 *   안심 시설 마커, 경로 Polyline을 lat/lng 투영으로 그린다.
 * - SSR/키 미설정/로드 실패 시에는 MapMock으로 폴백해 화면이 깨지지 않는다(E2E·테스트 포함).
 */
export function RouteMap({
  origin = null,
  destination = null,
  pois = [],
  showRoute = false,
  routeType = 'safe',
  active = false,
  className,
  zoom = 1,
  path,
  livePosition = null,
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const overlaysRef = useRef<KakaoMapOverlay[]>([]);
  const polylineRef = useRef<KakaoMapOverlay | null>(null);
  const liveMarkerRef = useRef<KakaoMapOverlay | null>(null);
  const lastBoundsRef = useRef<KakaoMapsLatLngBounds | null>(null);
  const initialCenterRef = useRef<LatLng>(destination ?? origin ?? { lat: 37.5665, lng: 126.978 });
  const [ready, setReady] = useState(false);

  // 컨테이너 크기가 늦게 확정될 때 타일이 깨진 채 남는 것을 막는 relayout + bounds 재적용.
  const refreshMap = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.relayout();
    if (lastBoundsRef.current) map.setBounds(lastBoundsRef.current);
  }, []);

  // 1) 지도 1회 초기화
  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    (async () => {
      const ok = await loadKakaoMaps();
      if (cancelled || !ok || !window.kakao?.maps || !containerRef.current) return;
      const kakao = window.kakao;
      const center = initialCenterRef.current;
      const map = new kakao.maps.Map(containerRef.current, {
        center: new kakao.maps.LatLng(center.lat, center.lng),
        level: 4,
        draggable: true,
        scrollwheel: true,
      });
      mapRef.current = map;
      // +/- 줌 버튼을 오른쪽에 추가
      const zoomControl = new kakao.maps.ZoomControl();
      map.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);
      setReady(true);
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => refreshMap());
        observer.observe(containerRef.current);
      }
    })();
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [refreshMap]);

  // 2) origin/destination/pois 변경 시 마커·Polyline 다시 그림
  useEffect(() => {
    const kakao = window.kakao;
    const map = mapRef.current;
    if (!ready || !kakao?.maps || !map) return;

    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    const bounds = new kakao.maps.LatLngBounds();
    let hasPoint = false;

    const addMarker = (lat: number, lng: number, type: RouteMapPoiType) => {
      const position = new kakao.maps.LatLng(lat, lng);
      const overlay = new kakao.maps.CustomOverlay({
        position,
        content: poiMarkerHtml(type),
        yAnchor: 0.5,
        xAnchor: 0.5,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
      bounds.extend(position);
      hasPoint = true;
    };

    if (origin && hasLatLng(origin)) addMarker(origin.lat, origin.lng, 'start');
    if (destination && hasLatLng(destination)) addMarker(destination.lat, destination.lng, 'end');
    pois.filter(hasLatLng).forEach((p) => addMarker(p.lat, p.lng, p.type));

    // 경로선: 상세 path가 있으면 Tmap 실경로 좌표열 전체를, 없으면 출발→목적지 직선 폴백.
    if (showRoute && origin && destination && hasLatLng(origin) && hasLatLng(destination)) {
      const polylinePath =
        path && path.length >= 2
          ? path.map((p) => new kakao.maps.LatLng(p.lat, p.lng))
          : [
              new kakao.maps.LatLng(origin.lat, origin.lng),
              new kakao.maps.LatLng(destination.lat, destination.lng),
            ];
      const polyline = new kakao.maps.Polyline({
        path: polylinePath,
        strokeWeight: 5,
        strokeColor: ROUTE_COLORS[routeType],
        strokeOpacity: 0.9,
        strokeStyle: 'solid',
      });
      polyline.setMap(map);
      polylineRef.current = polyline;
    }

    if (hasPoint) {
      lastBoundsRef.current = bounds;
      map.setBounds(bounds);
    }
  }, [ready, origin, destination, pois, showRoute, routeType, path]);

  // 3) 실시간 현재 위치 마커(별도 관리 — bounds 재조정 없이 위치만 갱신).
  useEffect(() => {
    const kakao = window.kakao;
    const map = mapRef.current;
    if (!ready || !kakao?.maps || !map) return;

    if (liveMarkerRef.current) {
      liveMarkerRef.current.setMap(null);
      liveMarkerRef.current = null;
    }
    if (livePosition && hasLatLng(livePosition)) {
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(livePosition.lat, livePosition.lng),
        content: livePositionMarkerHtml(),
        yAnchor: 0.5,
        xAnchor: 0.5,
        zIndex: 100,
      });
      overlay.setMap(map);
      liveMarkerRef.current = overlay;
    }
  }, [ready, livePosition]);

  return (
    <div data-testid="route-map" className={cn('relative w-full h-full overflow-hidden', className)}>
      {/* 실지도 컨테이너 — ready일 때만 보이고, 그 전/실패 시엔 아래 MapMock이 노출된다. */}
      <div
        ref={containerRef}
        className="absolute inset-0 z-10 bg-slate-700"
        style={{ display: ready ? 'block' : 'none' }}
      />
      {!ready && (
        <MapMock
          pois={pois}
          showRoute={showRoute}
          routeType={routeType}
          active={active}
          zoom={zoom}
        />
      )}
    </div>
  );
}
