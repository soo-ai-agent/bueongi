import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { LocateFixed, Compass, MapPin, PhoneCall } from 'lucide-react';
import { cn } from '../ui/utils';
import { MapMock } from './MapMock';
import { loadKakaoMaps } from '../../utils/kakaoMaps';
import { haversineMeters } from '../../utils/geo';
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
  /** CCTV 마커 표시용 설치목적구분(용도). 예: '생활방범'. */
  purpose?: string;
  /** CCTV 마커 표시용 카메라 대수. */
  cameraCount?: number;
  /** 소재지 주소(정보 카드 표시용). */
  address?: string;
  /** 전화번호(지구대·파출소 등 — 정보 카드에서 전화 연결). */
  phone?: string;
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
  /** 내비게이션 중 실시간 현재 위치. 부엉이(🦉) 마커로 표시된다. */
  livePosition?: LatLng | null;
  /** 지도 컨트롤(현 위치 따라가기/재중심, 방향 회전 토글) 노출 여부. 길안내 화면에서만 켠다. */
  showControls?: boolean;
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

/**
 * 내비게이션 실시간 위치 마커 HTML. 사용자를 부엉이(🦉)로 표시한다.
 * emerald 맥동 링 + 어두운 원형 배경 위 부엉이. heading-up(지도 회전) 시에도 부엉이가 똑바로 보이도록
 * 지도 회전(CSS 변수 --map-heading)을 상쇄해 역회전한다.
 */
export function livePositionMarkerHtml(): string {
  return `<div style="position:relative;width:44px;height:44px;transform:translate(-50%,-50%)">
      <div style="position:absolute;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;background:#34d399;border-radius:9999px;opacity:0.25;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite"></div>
      <div style="position:absolute;left:50%;top:50%;width:32px;height:32px;margin:-16px 0 0 -16px;display:flex;align-items:center;justify-content:center;background:#0f172a;border:2px solid #34d399;border-radius:9999px;box-shadow:0 2px 6px rgba(0,0,0,.5);font-size:18px;line-height:1;transform:rotate(var(--map-heading,0deg))">🦉</div>
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

/** 마커 클릭 정보 카드용 시설 유형 라벨(간결). start/end는 클릭 정보 대상이 아니다. */
const POI_LABEL: Partial<Record<RouteMapPoiType, string>> = {
  cctv: 'CCTV',
  bell: '안전 비상벨',
  store: '편의점',
  police: '지구대·파출소',
  safehouse: '여성안심지킴이집',
};

/** 시설 유형별 한 줄 안내(정보 카드). 무엇인지·어떻게 도움이 되는지 간결히. safehouse는 아래 별도 주의 문구 사용. */
const POI_HINT: Partial<Record<RouteMapPoiType, string>> = {
  cctv: '방범용 CCTV로 사각지대를 줄여 줘요.',
  bell: '누르면 인근 관제센터·경찰로 바로 연결돼요.',
  store: '야간에도 도움을 청할 수 있는 거점이에요.',
  police: '긴급할 때 가장 가까운 도움처예요.',
};

/** 클릭한 마커의 정보(정보 카드 표시용). */
export interface SelectedPoi {
  type: RouteMapPoiType;
  name?: string;
  lat: number;
  lng: number;
  /** CCTV 용도(설치목적구분). 예: '생활방범'. */
  purpose?: string;
  /** CCTV 카메라 대수. */
  cameraCount?: number;
  /** 소재지 주소. */
  address?: string;
  /** 전화번호(지구대·파출소 등). */
  phone?: string;
}

/** 시설 마커(클릭 시 정보 제공 대상)인지 — 출발/도착은 제외. */
function isFacilityType(type: RouteMapPoiType): boolean {
  return type !== 'start' && type !== 'end';
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
  path,
  livePosition = null,
  showControls = false,
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const overlaysRef = useRef<KakaoMapOverlay[]>([]);
  const polylineRef = useRef<KakaoMapOverlay | null>(null);
  const liveMarkerRef = useRef<KakaoMapOverlay | null>(null);
  const lastBoundsRef = useRef<KakaoMapsLatLngBounds | null>(null);
  const initialCenterRef = useRef<LatLng>(destination ?? origin ?? { lat: 37.5665, lng: 126.978 });
  const [ready, setReady] = useState(false);
  // 사용자가 누른 시설 마커의 정보(클릭 정보 카드). 마커가 갱신되면 닫는다.
  const [selectedPoi, setSelectedPoi] = useState<SelectedPoi | null>(null);
  // 지도가 현재 위치를 따라가는지(자동 중심 이동). 사용자가 지도를 직접 드래그하면 꺼지고, '현 위치' 버튼으로 다시 켠다.
  const [following, setFollowing] = useState(true);
  // heading-up: 기기 나침반 방향대로 지도를 회전(true). 기본은 북쪽 위(false).
  const [headingUp, setHeadingUp] = useState(false);
  // 기기 나침반 방위각(도, 0=북). headingUp 일 때만 갱신한다.
  const [heading, setHeading] = useState(0);

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
      // 사용자가 지도를 직접 드래그하면 자동 따라가기를 끈다('현 위치' 버튼으로 다시 켤 수 있음).
      kakao.maps.event.addListener(map, 'dragstart', () => setFollowing(false));
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

    // 경로가 실제로 바뀌어 선택한 시설이 더는 목록에 없을 때만 정보 카드를 닫는다(stale 방지).
    // GPS 갱신 등 단순 리렌더로 pois 참조만 바뀐 경우엔 같은 시설이 그대로 있으므로 카드를 유지한다
    // (걷는 중에 팝업이 저절로 닫히던 문제 방지).
    setSelectedPoi((prev) =>
      prev && pois.some((p) => hasLatLng(p) && p.type === prev.type && p.lat === prev.lat && p.lng === prev.lng)
        ? prev
        : null,
    );

    const bounds = new kakao.maps.LatLngBounds();
    let hasPoint = false;

    const addMarker = (
      lat: number,
      lng: number,
      type: RouteMapPoiType,
      info?: { name?: string; purpose?: string; cameraCount?: number; address?: string; phone?: string },
    ) => {
      const position = new kakao.maps.LatLng(lat, lng);
      // 시설 마커는 클릭 시 정보 카드를 띄운다(출발/도착은 정보 대상 아님). 클릭 가능하게 DOM 엘리먼트로 만든다.
      const facility = isFacilityType(type);
      let content: string | HTMLElement = poiMarkerHtml(type);
      if (facility && typeof document !== 'undefined') {
        const el = document.createElement('div');
        el.innerHTML = poiMarkerHtml(type);
        el.style.cursor = 'pointer';
        el.addEventListener('click', () =>
          setSelectedPoi({
            type,
            name: info?.name,
            lat,
            lng,
            purpose: info?.purpose,
            cameraCount: info?.cameraCount,
            address: info?.address,
            phone: info?.phone,
          }),
        );
        content = el;
      }
      const overlay = new kakao.maps.CustomOverlay({
        position,
        content,
        yAnchor: 0.5,
        xAnchor: 0.5,
        clickable: facility,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
      bounds.extend(position);
      hasPoint = true;
    };

    if (origin && hasLatLng(origin)) addMarker(origin.lat, origin.lng, 'start');
    if (destination && hasLatLng(destination)) addMarker(destination.lat, destination.lng, 'end');
    pois
      .filter(hasLatLng)
      .forEach((p) =>
        addMarker(p.lat, p.lng, p.type, {
          name: p.name,
          purpose: p.purpose,
          cameraCount: p.cameraCount,
          address: p.address,
          phone: p.phone,
        }),
      );

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

  // 4) 따라가기: 현재 위치가 갱신되거나 '현 위치'로 다시 켜지면 지도를 그 위치로 부드럽게 이동한다.
  useEffect(() => {
    if (!ready || !showControls || !following) return;
    const kakao = window.kakao;
    const map = mapRef.current;
    if (!kakao?.maps || !map || !livePosition || !hasLatLng(livePosition)) return;
    map.panTo(new kakao.maps.LatLng(livePosition.lat, livePosition.lng));
  }, [ready, showControls, following, livePosition]);

  // 5) heading-up: 기기 나침반(deviceorientation)으로 방위각을 받아 지도 회전(--map-heading)에 사용한다.
  useEffect(() => {
    if (!showControls || !headingUp) return;
    const onOrient = (event: Event) => {
      const e = event as DeviceOrientationEvent & { webkitCompassHeading?: number };
      const compass =
        typeof e.webkitCompassHeading === 'number'
          ? e.webkitCompassHeading // iOS: 0=북, 시계방향
          : typeof e.alpha === 'number'
            ? 360 - e.alpha // 안드로이드/표준 alpha 보정
            : null;
      if (compass != null && Number.isFinite(compass)) setHeading(((compass % 360) + 360) % 360);
    };
    window.addEventListener('deviceorientationabsolute', onOrient, true);
    window.addEventListener('deviceorientation', onOrient, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', onOrient, true);
      window.removeEventListener('deviceorientation', onOrient, true);
    };
  }, [showControls, headingUp]);

  // '현 위치' 버튼: 따라가기를 다시 켜고 현재 위치로 중심 이동한다.
  const handleRecenter = () => {
    setFollowing(true);
    const kakao = window.kakao;
    const map = mapRef.current;
    if (kakao?.maps && map && livePosition && hasLatLng(livePosition)) {
      map.panTo(new kakao.maps.LatLng(livePosition.lat, livePosition.lng));
    }
  };

  // '방향' 토글: 끄면 북쪽 위, 켜면 기기 나침반 방향대로 지도 회전. iOS 13+ 는 센서 권한을 먼저 요청한다.
  const handleToggleHeading = async () => {
    if (headingUp) {
      setHeadingUp(false);
      setHeading(0);
      return;
    }
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
    };
    if (DOE && typeof DOE.requestPermission === 'function') {
      try {
        if ((await DOE.requestPermission()) !== 'granted') return; // 권한 거부 시 북쪽 위 유지.
      } catch {
        return;
      }
    }
    setHeadingUp(true);
  };

  // 정보 카드 '현 위치에서 거리' — 실시간 위치(있으면) 또는 출발지 기준 직선거리.
  const refPos = livePosition && hasLatLng(livePosition) ? livePosition : origin && hasLatLng(origin) ? origin : null;
  const selectedDistanceM =
    selectedPoi && refPos ? haversineMeters(refPos, { lat: selectedPoi.lat, lng: selectedPoi.lng }) : null;
  const distanceLabel =
    selectedDistanceM == null
      ? null
      : selectedDistanceM < 1000
        ? `${Math.round(selectedDistanceM)}m`
        : `${(selectedDistanceM / 1000).toFixed(1)}km`;

  return (
    <div
      data-testid="route-map"
      className={cn('relative w-full h-full overflow-hidden', className)}
      style={{ '--map-heading': `${heading}deg` } as CSSProperties}
    >
      {/* 회전 레이어: heading-up이면 지도를 기기 방향(-heading)으로 회전하고, 모서리가 비지 않게 확대한다.
          컨트롤 버튼은 이 레이어 밖(아래)에 두어 항상 똑바로 보인다. */}
      <div
        className="absolute inset-0"
        style={
          headingUp
            ? {
                transform: `rotate(${-heading}deg) scale(1.4)`,
                transformOrigin: 'center',
                transition: 'transform 0.15s linear',
              }
            : undefined
        }
      >
        {/* 실지도 컨테이너 — ready일 때만 보이고, 그 전/실패 시엔 아래 MapMock이 노출된다. */}
        <div
          ref={containerRef}
          className="absolute inset-0 z-10 bg-slate-700"
          style={{ display: ready ? 'block' : 'none' }}
        />
        {!ready && (
          <MapMock pois={pois} showRoute={showRoute} routeType={routeType} active={active} zoom={zoom} />
        )}
      </div>

      {/* 지도 컨트롤(길안내 화면 전용): 현 위치 따라가기/재중심 + 방향(heading-up) 토글 */}
      {showControls && (
        <div className="absolute left-3 bottom-[210px] z-30 flex flex-col gap-2">
          <button
            type="button"
            data-testid="map-recenter-btn"
            onClick={handleRecenter}
            aria-label="현 위치로 이동"
            aria-pressed={following}
            className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center shadow-lg border backdrop-blur-md transition-colors active:scale-95',
              following
                ? 'bg-emerald-500/90 border-emerald-300/40 text-emerald-950'
                : 'bg-slate-800/90 border-slate-600 text-slate-100 hover:bg-slate-700',
            )}
          >
            <LocateFixed className="w-6 h-6" />
          </button>
          <button
            type="button"
            data-testid="map-heading-btn"
            onClick={handleToggleHeading}
            aria-label="휴대폰 방향으로 지도 회전"
            aria-pressed={headingUp}
            className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center shadow-lg border backdrop-blur-md transition-colors active:scale-95',
              headingUp
                ? 'bg-emerald-500/90 border-emerald-300/40 text-emerald-950'
                : 'bg-slate-800/90 border-slate-600 text-slate-100 hover:bg-slate-700',
            )}
          >
            <Compass className="w-6 h-6" />
          </button>
        </div>
      )}

      {/* 시설 마커 클릭 정보 카드 — 유형/관리기관명/주소/용도·카메라/거리/안내/전화/좌표(지도 상단 오버레이). */}
      {ready && selectedPoi && (
        <div data-testid="poi-info-card" className="absolute left-3 right-3 top-3 z-30">
          <div className="bg-slate-800/95 backdrop-blur-md border border-slate-600 rounded-2xl shadow-xl px-4 py-3.5 flex items-start gap-3">
            <span
              className="mt-1 w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: POI_BORDER[selectedPoi.type] }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold tracking-wide" style={{ color: POI_BORDER[selectedPoi.type] }}>
                {POI_LABEL[selectedPoi.type] ?? selectedPoi.type}
              </div>
              <div className="text-slate-50 font-bold text-[15px] truncate mt-0.5">
                {selectedPoi.name?.trim() || '관리기관 정보 없음'}
              </div>
              {selectedPoi.address && (
                <div className="text-slate-300 text-xs mt-1 flex items-start gap-1">
                  <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
                  <span className="leading-snug">{selectedPoi.address}</span>
                </div>
              )}
              {(selectedPoi.purpose || selectedPoi.cameraCount != null || distanceLabel) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {selectedPoi.purpose && (
                    <span
                      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                      style={{ color: POI_BORDER[selectedPoi.type], backgroundColor: `${POI_BORDER[selectedPoi.type]}22` }}
                    >
                      용도 · {selectedPoi.purpose}
                    </span>
                  )}
                  {selectedPoi.cameraCount != null && (
                    <span className="inline-flex items-center rounded-md bg-slate-700/70 px-1.5 py-0.5 text-[11px] font-medium text-slate-100">
                      카메라 {selectedPoi.cameraCount}대
                    </span>
                  )}
                  {distanceLabel && (
                    <span className="inline-flex items-center rounded-md bg-slate-700/70 px-1.5 py-0.5 text-[11px] font-medium text-slate-100">
                      현 위치에서 {distanceLabel}
                    </span>
                  )}
                </div>
              )}
              {POI_HINT[selectedPoi.type] && (
                <div className="text-slate-400 text-[11px] mt-1.5 leading-relaxed">{POI_HINT[selectedPoi.type]}</div>
              )}
              {selectedPoi.phone && (
                <a
                  href={`tel:${selectedPoi.phone.replace(/[^0-9+]/g, '')}`}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 px-2.5 py-1 text-blue-300 text-xs font-bold active:scale-95"
                >
                  <PhoneCall className="w-3.5 h-3.5" /> {selectedPoi.phone}
                </a>
              )}
              <div className="text-slate-500 text-[11px] mt-1.5">
                위도 {selectedPoi.lat.toFixed(5)} · 경도 {selectedPoi.lng.toFixed(5)}
              </div>
              {selectedPoi.type === 'safehouse' && (
                <div className="text-slate-500 text-[11px] mt-1 leading-relaxed">
                  지정된 거점일 뿐 영업시간 정보가 없어요. 방문 전 운영 여부를 확인해 주세요.
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedPoi(null)}
              aria-label="정보 닫기"
              className="shrink-0 w-7 h-7 -mt-0.5 -mr-1 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
