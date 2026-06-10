import type { MockRoute } from '../pages/RouteComparison';

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
