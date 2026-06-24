import type { LatLng, RouteOption, RouteOptionTag, RouteType } from './routeCompare';
import type { RouteMapPoi } from '../components/map/RouteMap';
import type { TmapRoute } from './tmap';
import { isWithinCorridor } from './geo';
import { DEFAULT_CORRIDOR_METERS, scoreRoute, type SafetyFacilities, type SafetyScore } from './safetyScore';

/**
 * 앱 직접 호출 경로 빌더(작업 3 통합).
 *
 * Tmap 후보 경로(E-1)에 CDN/서울 캐시 시설을 결합해 안전 점수를 매기고,
 * 기존 UI 계약(RouteOption)과 경로 마커(RouteMapPoi)로 변환한다.
 * 순수 함수로 두어 네트워크 없이 단위 검증이 가능하다(데이터는 호출부가 주입).
 */

export interface ScoredRoute {
  route: TmapRoute;
  score: SafetyScore;
  type: RouteType;
}

export function formatDurationKo(timeS: number): string {
  const minutes = Math.max(1, Math.round(timeS / 60));
  return `${minutes}분`;
}

export function formatDistanceKo(distanceM: number): string {
  if (distanceM < 1000) return `${Math.round(distanceM)}m`;
  return `${(distanceM / 1000).toFixed(1)}km`;
}

/**
 * 후보 경로에 안전 점수를 매기고 안심/기본/빠른 유형을 배정한다.
 * - safe: 안전 점수 최고
 * - fast: 소요 시간 최소
 * - main: 나머지(없으면 빠른/안심으로 흡수)
 */
export function scoreAndType(
  routes: TmapRoute[],
  facilities: SafetyFacilities,
  safePaths: LatLng[][] = [],
  corridorMeters: number = DEFAULT_CORRIDOR_METERS,
): ScoredRoute[] {
  const scored = routes.map((route) => ({
    route,
    score: scoreRoute({ path: route.path, facilities, safePaths, corridorMeters }),
  }));

  if (scored.length === 0) return [];

  // 인덱스 기준 안심(최고점)/빠른(최소시간) 선정. 동률은 먼저 나온 후보 우선.
  let safeIdx = 0;
  let fastIdx = 0;
  scored.forEach((s, i) => {
    if (s.score.score > scored[safeIdx].score.score) safeIdx = i;
    if (s.route.timeS < scored[fastIdx].route.timeS) fastIdx = i;
  });
  // 안심과 빠른이 같은 후보면 빠른은 다른 후보로 양보.
  if (fastIdx === safeIdx && scored.length > 1) {
    fastIdx = scored.findIndex((_, i) => i !== safeIdx);
  }

  return scored.map((s, i) => ({
    ...s,
    type: i === safeIdx ? 'safe' : i === fastIdx ? 'fast' : 'main',
  }));
}

function buildTags(scored: ScoredRoute): RouteOptionTag[] {
  const tags: RouteOptionTag[] = [];
  if (scored.type === 'safe') tags.push({ text: '안심', variant: 'mint' });
  if (scored.type === 'fast') tags.push({ text: '빠른길', variant: 'blue' });
  const b = scored.score.breakdown;
  if (b.cctvDensity >= 5) tags.push({ text: 'CCTV 많음', variant: 'mint' });
  if (b.lampDensity >= 10) tags.push({ text: '밝은 길', variant: 'yellow' });
  if (b.safePathOverlap >= 0.2) tags.push({ text: '안심귀갓길', variant: 'mint' });
  if (b.safehouseCount >= 1) tags.push({ text: '안심지킴이집', variant: 'outline' });
  return tags;
}

const TYPE_NAME: Record<RouteType, string> = {
  safe: '안심 경로',
  main: '기본 경로',
  fast: '빠른 경로',
};

/** ScoredRoute[] → 기존 UI 계약 RouteOption[]. 안심 점수 내림차순으로 정렬. */
export function toRouteOptions(scoredRoutes: ScoredRoute[]): RouteOption[] {
  return [...scoredRoutes]
    .sort((a, b) => b.score.score - a.score.score)
    .map((scored, i) => ({
      id: `tmap-${scored.route.searchOption}-${i}`,
      name: TYPE_NAME[scored.type],
      time: formatDurationKo(scored.route.timeS),
      dist: formatDistanceKo(scored.route.distanceM),
      desc: `안전 점수 ${scored.score.score}점 · CCTV ${scored.score.breakdown.cctvDensity}/km`,
      tags: buildTags(scored),
      type: scored.type,
    }));
}

/**
 * 한 경로의 거점 마커(MVP 기본: CCTV/여성안심지킴이집/비상벨)를 경로 버퍼 안 시설로 만든다.
 * 조명은 마커에서 제외(점수에만 반영)한다 — 설계의 MVP 기본 마커 3종 기준.
 */
export function toRouteMarkers(
  path: LatLng[],
  facilities: Pick<SafetyFacilities, 'cctv' | 'bell' | 'safehouse'>,
  corridorMeters: number = DEFAULT_CORRIDOR_METERS,
): RouteMapPoi[] {
  const markers: RouteMapPoi[] = [];
  const push = (points: LatLng[], type: RouteMapPoi['type']) => {
    for (const p of points) {
      if (isWithinCorridor(p, path, corridorMeters)) {
        markers.push({ type, x: 0, y: 0, lat: p.lat, lng: p.lng });
      }
    }
  };
  push(facilities.cctv, 'cctv');
  push(facilities.safehouse, 'safehouse');
  push(facilities.bell, 'bell');
  return markers;
}

export interface RouteMarkerInput {
  /** 출발지(현재 위치). start 마커. */
  origin: LatLng;
  /** 목적지. end 마커. */
  destination: LatLng;
  /** 안전 점수를 매긴 경로 좌표열(버퍼 판정 기준). */
  path: LatLng[];
  facilities: Pick<SafetyFacilities, 'cctv' | 'bell' | 'safehouse'>;
  corridorMeters?: number;
}

/** MapMock 폴백 좌표 투영 시 경계상자 가장자리에 두는 여백(%). */
const MARKER_VIEWBOX_PADDING = 12;

/**
 * 직접 호출 경로의 거점 마커 묶음을 만든다(작업 3 — 경로 위 거점 마커).
 *
 * `toRouteMarkers`로 버퍼 안 CCTV/안심집/비상벨을 모으고 출발/목적지 마커를 더한 뒤,
 * 실지도용 lat/lng는 그대로 두고 MapMock 폴백용 x/y(0~100%)를 모든 마커가 포함되는
 * 경계상자에 여백을 두고 투영한다. 지도 키 유무와 무관하게 동일 거점을 보여주기 위함이다.
 * (위도는 화면 위쪽이 큰 값이므로 y축을 뒤집어 투영한다.)
 */
export function buildRouteMarkers(input: RouteMarkerInput): RouteMapPoi[] {
  const corridor = input.corridorMeters ?? DEFAULT_CORRIDOR_METERS;
  const markers: RouteMapPoi[] = [
    { type: 'start', x: 0, y: 0, lat: input.origin.lat, lng: input.origin.lng },
    { type: 'end', x: 0, y: 0, lat: input.destination.lat, lng: input.destination.lng },
    ...toRouteMarkers(input.path, input.facilities, corridor),
  ];

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const m of markers) {
    if (m.lat == null || m.lng == null) continue;
    if (m.lat < minLat) minLat = m.lat;
    if (m.lat > maxLat) maxLat = m.lat;
    if (m.lng < minLng) minLng = m.lng;
    if (m.lng > maxLng) maxLng = m.lng;
  }

  const range = 100 - 2 * MARKER_VIEWBOX_PADDING;
  const spanLat = maxLat - minLat;
  const spanLng = maxLng - minLng;
  for (const m of markers) {
    if (m.lat == null || m.lng == null) continue;
    // 한 축이 퇴화(모든 좌표 동일)하면 가운데(50%)로 둔다.
    m.x = spanLng === 0 ? 50 : MARKER_VIEWBOX_PADDING + ((m.lng - minLng) / spanLng) * range;
    m.y = spanLat === 0 ? 50 : MARKER_VIEWBOX_PADDING + ((maxLat - m.lat) / spanLat) * range;
  }

  return markers;
}
