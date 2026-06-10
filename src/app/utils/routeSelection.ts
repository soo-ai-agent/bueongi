import type { MockRoute } from '../pages/RouteComparison';
import type { Destination } from '../store/appStore';

/**
 * 선택한 경로 id로 경로를 찾고, 없으면 첫 경로(추천)로 폴백한다.
 * - 직접 진입(/navigate 새로고침 등 state 소실)·잘못된 id에서도 길안내가 끊기지 않도록 안전 처리.
 * - 빈 목록이면 undefined(호출부에서 가드).
 *
 * 실측 경로 데이터(maps API) 연동 시에도 동일 시그니처로 교체 가능하도록 분리.
 */
export function resolveRoute(
  routes: MockRoute[],
  id: string | null | undefined,
): MockRoute | undefined {
  if (routes.length === 0) return undefined;
  return routes.find((r) => r.id === id) ?? routes[0];
}

/**
 * "24분" 같은 표시 문자열에서 분(minutes) 정수를 추출한다.
 * 파싱 실패 시 fallback 반환(길안내 카운트다운 초기값용).
 */
export function parseEtaMinutes(time: string, fallback = 0): number {
  const m = time.match(/\d+/);
  return m ? parseInt(m[0], 10) : fallback;
}

/** 경로 화면의 목적지 컨텍스트(가드 + 표시명) */
export interface RouteDestinationContext {
  /** 선택된 목적지가 있어 경로 화면을 렌더할 수 있는지(없으면 검색으로 유도) */
  hasDestination: boolean;
  /** 표시용 목적지명(미선택·공백명은 폴백) */
  destinationName: string;
}

const DESTINATION_FALLBACK = '목적지';

/**
 * 선택된 목적지로 경로 화면(상세/비교/길안내)의 표시 컨텍스트를 만든다.
 * - 목적지가 없으면 hasDestination=false → 호출부에서 검색으로 유도(거짓 "경로 안내" 방지).
 * - 이름이 비어/공백뿐이면 표시명을 폴백 처리(깨진 라벨 방지).
 *
 * RouteComparison/ConfirmLocation 의 `!destination` 가드와 동일 의미를 단일화해
 * RouteDetail 등 모든 경로 화면이 같은 기준으로 실데이터를 표시하도록 한다.
 */
export function getRouteDestinationContext(
  destination: Destination | null | undefined,
): RouteDestinationContext {
  const name = destination?.name?.trim();
  return {
    hasDestination: destination != null,
    destinationName: name ? destination!.name : DESTINATION_FALLBACK,
  };
}
