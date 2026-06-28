import type { Destination } from '../store/appStore';
import type { LatLng, RouteOption, RouteType } from './routeCompare';
import type { RouteMapPoi } from '../components/map/RouteMap';
import { fetchSafeCompare, type SafetyPreference } from './safeCompare';

/**
 * 경로 비교 진입점(Phase 2 — 백엔드 안심 라우팅 전환).
 *
 * 안심 라우팅의 데이터·연산(실 Tmap 호출 + 공공데이터 안전점수 + 경유지 우회)은 백엔드가
 * 담당한다. 프론트는 `POST /api/routes/safe-compare`를 호출해 결과(RouteOption[])를 표시만
 * 한다 — Tmap/CDN 직접 호출이나 시군구 해석을 하지 않는다.
 */

export interface ComparisonRouteOptions {
  signal?: AbortSignal;
  /** 안심 강도. 미지정 시 백엔드 기본값(safe)에 맡긴다. */
  safetyPreference?: SafetyPreference;
}

/**
 * 경로 비교 결과: UI 계약 RouteOption 목록과, 경로 유형별 거점 마커.
 * 마커는 백엔드가 회랑 내 안심 시설 + 출발/도착으로 점수와 일관되게 제공한다.
 * 마커가 없는 경로(키 없는 백엔드 폴백 등)에서는 해당 유형의 markersByType가 비어,
 * 호출부가 기존 백엔드 facilities preview로 폴백한다.
 */
export interface ComparisonRouteResult {
  routes: RouteOption[];
  markersByType: Partial<Record<RouteType, RouteMapPoi[]>>;
}

/**
 * 경로 비교용 후보 + 거점 마커를 반환한다.
 * 백엔드 안심 라우팅 응답의 markers를 유형별로 매핑한다(같은 유형이 여러 후보면 먼저 만난
 * 후보 = 안전점수가 높은 후보의 마커를 유지한다 — 응답이 안전점수 내림차순이므로).
 */
export async function loadComparisonRouteResult(
  destination: Destination,
  origin: LatLng,
  options: ComparisonRouteOptions = {},
): Promise<ComparisonRouteResult> {
  const routes = await fetchSafeCompare(destination, origin, {
    signal: options.signal,
    safetyPreference: options.safetyPreference,
  });

  const markersByType: Partial<Record<RouteType, RouteMapPoi[]>> = {};
  for (const route of routes) {
    if (markersByType[route.type]) continue;
    if (route.markers && route.markers.length > 0) {
      markersByType[route.type] = route.markers;
    }
  }

  return { routes, markersByType };
}

/**
 * 경로 비교용 후보만 반환하는 호환 래퍼(마커가 불필요한 호출부용).
 */
export async function loadComparisonRoutes(
  destination: Destination,
  origin: LatLng,
  options: ComparisonRouteOptions = {},
): Promise<RouteOption[]> {
  return (await loadComparisonRouteResult(destination, origin, options)).routes;
}
