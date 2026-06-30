import type { Destination } from '../store/appStore';
import type { RouteType } from './routeCompare';

interface RouteCandidate {
  id: string;
  type: string;
}

/**
 * 선택한 경로 id로 경로를 찾고, 없으면 첫 경로(추천)로 폴백한다.
 * - 직접 진입(/navigate 새로고침 등 state 소실)·잘못된 id에서도 길안내가 끊기지 않도록 안전 처리.
 * - 빈 목록이면 undefined(호출부에서 가드).
 *
 * 실측 경로 데이터(maps API) 연동 시에도 동일 시그니처로 교체 가능하도록 분리.
 */
export function resolveRoute<T extends RouteCandidate>(
  routes: T[],
  id: string | null | undefined,
): T | undefined {
  if (routes.length === 0) return undefined;
  return routes.find((r) => r.id === id || r.type === id) ?? routes[0];
}

/**
 * 같은 SPA 세션에 compare API 경로 후보가 있으면 이를 우선 사용한다.
 * 길안내 화면이 RouteDetail에서 선택한 실시간 경로(id/type)를 mock 추천 경로로
 * 바꿔 표시하지 않도록 RouteDetail과 동일한 우선순위를 공유한다.
 */
export function resolveRouteWithApiOptions<TApi extends RouteCandidate, TFallback extends RouteCandidate>(
  apiRoutes: TApi[],
  fallbackRoutes: TFallback[],
  id: string | null | undefined,
): TApi | TFallback | undefined {
  return apiRoutes.length > 0 ? resolveRoute(apiRoutes, id) : resolveRoute(fallbackRoutes, id);
}

/**
 * "24분" 같은 표시 문자열에서 분(minutes) 정수를 추출한다.
 * 파싱 실패 시 fallback 반환(길안내 카운트다운 초기값용).
 */
export function parseEtaMinutes(time: string, fallback = 0): number {
  const m = time.match(/\d+/);
  return m ? parseInt(m[0], 10) : fallback;
}

export function normalizeRouteType(value: unknown, fallback: RouteType = 'safe'): RouteType {
  return value === 'safe' || value === 'main' || value === 'fast' ? value : fallback;
}

/** 경로 화면의 목적지 컨텍스트(가드 + 표시명) */
export interface RouteDestinationContext {
  /** 선택된 목적지가 있어 경로 화면을 렌더할 수 있는지(없으면 검색으로 유도) */
  hasDestination: boolean;
  /** 백엔드 경로 API에 보낼 수 있는 유효한 좌표가 있는지 */
  hasRouteCoordinates: boolean;
  /** 목적지와 좌표가 모두 있어 경로 요청/안내를 시작할 수 있는지 */
  canRequestRoute: boolean;
  /** 표시용 목적지명(미선택·공백명은 폴백) */
  destinationName: string;
}

const DESTINATION_FALLBACK = '목적지';

function isFiniteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/**
 * 백엔드 RouteRequest 위경도 검증 계약(lat -90~90, lng -180~180)에 맞춰
 * 프론트에서도 요청 전 차단한다. 예전 localStorage 데이터처럼 좌표가 없는
 * 목적지가 로드될 수 있으므로 런타임 검증이 필요하다.
 */
export function hasValidRouteCoordinates(
  destination: Destination | null | undefined,
): destination is Destination {
  return (
    destination != null &&
    isFiniteInRange(destination.lat, -90, 90) &&
    isFiniteInRange(destination.lng, -180, 180)
  );
}

/**
 * 선택된 목적지로 경로 화면(상세/비교/길안내)의 표시 컨텍스트를 만든다.
 * - 목적지가 없으면 hasDestination=false → 호출부에서 검색으로 유도(거짓 "경로 안내" 방지).
 * - 이름이 비어/공백뿐이면 표시명을 폴백 처리(깨진 라벨 방지).
 * - 좌표가 없거나 범위를 벗어나면 canRequestRoute=false → 백엔드 400 전에 검색으로 유도.
 *
 * RouteComparison/ConfirmLocation 의 `!destination` 가드와 동일 의미를 단일화해
 * RouteDetail 등 모든 경로 화면이 같은 기준으로 실데이터를 표시하도록 한다.
 */
export function getRouteDestinationContext(
  destination: Destination | null | undefined,
): RouteDestinationContext {
  const name = destination?.name?.trim();
  const hasDestination = destination != null;
  const hasRouteCoordinates = hasValidRouteCoordinates(destination);
  return {
    hasDestination,
    hasRouteCoordinates,
    canRequestRoute: hasDestination && hasRouteCoordinates,
    destinationName: name || DESTINATION_FALLBACK,
  };
}
