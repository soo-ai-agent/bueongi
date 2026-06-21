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

function isFiniteCoord(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasLatLng<T extends { lat?: number | null; lng?: number | null }>(
  p: T,
): p is T & { lat: number; lng: number } {
  return isFiniteCoord(p.lat) && isFiniteCoord(p.lng);
}

function poiMarkerHtml(type: RouteMapPoiType): string {
  const color = POI_BORDER[type];
  const fill = type === 'end' ? '#3b82f6' : type === 'start' ? '#e2e8f0' : '#475569';
  // 작은 원형 핀 — 실지도 위 좌표에 정확히 투영되는 CustomOverlay 콘텐츠.
  return `<div style="width:18px;height:18px;border-radius:9999px;background:${fill};border:3px solid ${color};box-shadow:0 1px 4px rgba(0,0,0,.4);transform:translate(-50%,-50%)"></div>`;
}

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
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const overlaysRef = useRef<KakaoMapOverlay[]>([]);
  const polylineRef = useRef<KakaoMapOverlay | null>(null);
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
        scrollwheel: false,
      });
      mapRef.current = map;
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

    // 경로선: 출발지 → 목적지(둘 다 좌표가 있을 때만).
    if (showRoute && origin && destination && hasLatLng(origin) && hasLatLng(destination)) {
      const polyline = new kakao.maps.Polyline({
        path: [
          new kakao.maps.LatLng(origin.lat, origin.lng),
          new kakao.maps.LatLng(destination.lat, destination.lng),
        ],
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
  }, [ready, origin, destination, pois, showRoute, routeType]);

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
