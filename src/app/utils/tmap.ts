import type { LatLng } from './routeCompare';
import { getTmapAppKey } from './env';
import { pathLengthMeters } from './geo';

/**
 * E-1 Tmap 보행자 경로 — 앱 직접 호출 클라이언트(서버 프록시 금지).
 *
 * 설계 기준:
 * - AppKey는 빌드 시 주입(VITE_TMAP_APP_KEY)되고 `appKey` 헤더로만 전달, 로그에 남기지 않는다.
 * - 요청마다 직접 호출하며 동일 출발/도착은 호출부에서 단기 재사용한다(여기선 순수 호출만).
 * - 응답 GeoJSON에서 LineString 좌표를 이어 붙여 경로 라인(LatLng[])과 거리/시간을 뽑는다.
 * - 후보 3개 이상은 searchOption(추천/대로우선/최단)을 달리한 병렬 호출로 만든다.
 */

export const TMAP_PEDESTRIAN_ENDPOINT = 'https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1';

/** Tmap 보행자 경로 탐색 옵션(후보 다양화). */
export type TmapSearchOption = '0' | '4' | '10' | '30';

export const TMAP_SEARCH_OPTION_LABEL: Record<TmapSearchOption, string> = {
  '0': '추천',
  '4': '대로우선',
  '10': '최단',
  '30': '계단제외',
};

export interface TmapRoute {
  searchOption: TmapSearchOption;
  /** 경로 라인 좌표열(WGS84). 안전 점수/마커 투영의 원천. */
  path: LatLng[];
  /** 총 보행 거리(m). */
  distanceM: number;
  /** 총 소요 시간(s). */
  timeS: number;
}

export interface TmapClientOptions {
  appKey?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  searchOption?: TmapSearchOption;
}

function isFiniteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function requireSearchOption(value: unknown): TmapSearchOption {
  if (value !== '0' && value !== '4' && value !== '10' && value !== '30') {
    throw new Error('Tmap 경로 요청에 유효한 searchOption이 필요합니다');
  }
  return value;
}

function requireLatLng(value: LatLng, label: string): LatLng {
  if (!isFiniteInRange(value?.lat, -90, 90) || !isFiniteInRange(value?.lng, -180, 180)) {
    throw new Error(`Tmap 경로 요청에 유효한 ${label} 좌표가 필요합니다`);
  }
  return value;
}

interface TmapFeature {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
}

/** Tmap GeoJSON에서 경로 라인과 거리/시간을 파싱한다. */
export function parseTmapResponse(payload: unknown): { path: LatLng[]; distanceM: number; timeS: number } {
  if (typeof payload !== 'object' || payload === null || !Array.isArray((payload as { features?: unknown }).features)) {
    throw new Error('Tmap 응답에 features 배열이 없습니다');
  }
  const features = (payload as { features: TmapFeature[] }).features;
  const path: LatLng[] = [];
  let distanceM = 0;
  let timeS = 0;

  for (const feature of features) {
    const props = feature.properties ?? {};
    // 총 거리/시간은 보통 첫 Point feature의 properties에 담긴다.
    if (isNonNegativeFiniteNumber(props.totalDistance) && distanceM === 0) distanceM = props.totalDistance;
    if (isNonNegativeFiniteNumber(props.totalTime) && timeS === 0) timeS = props.totalTime;

    const geom = feature.geometry;
    if (geom?.type === 'LineString' && Array.isArray(geom.coordinates)) {
      for (const c of geom.coordinates) {
        if (Array.isArray(c) && isFiniteInRange(c[1], -90, 90) && isFiniteInRange(c[0], -180, 180)) {
          // GeoJSON: [lng, lat]
          path.push({ lat: c[1] as number, lng: c[0] as number });
        }
      }
    }
  }

  if (path.length < 2) {
    throw new Error('Tmap 응답에서 경로 좌표를 찾지 못했습니다');
  }
  // 거리 미제공 시 좌표열로 보정(결정적 폴백).
  if (distanceM === 0) distanceM = Math.round(pathLengthMeters(path));
  return { path, distanceM, timeS };
}

export function buildTmapRequestBody(
  origin: LatLng,
  destination: LatLng & { name?: string },
  searchOption: TmapSearchOption,
): Record<string, string> {
  return {
    startX: String(origin.lng),
    startY: String(origin.lat),
    endX: String(destination.lng),
    endY: String(destination.lat),
    startName: encodeURIComponent('출발'),
    endName: encodeURIComponent(destination.name?.trim() || '목적지'),
    reqCoordType: 'WGS84GEO',
    resCoordType: 'WGS84GEO',
    searchOption,
  };
}

/** Tmap 보행자 경로 1건을 직접 호출한다. */
export async function fetchTmapPedestrianRoute(
  origin: LatLng,
  destination: LatLng & { name?: string },
  options: TmapClientOptions = {},
): Promise<TmapRoute> {
  const appKey = options.appKey ?? getTmapAppKey();
  if (!appKey) {
    throw new Error('Tmap AppKey가 설정되지 않았습니다(VITE_TMAP_APP_KEY)');
  }
  requireLatLng(origin, 'origin');
  requireLatLng(destination, 'destination');

  const searchOption = requireSearchOption(options.searchOption ?? '0');
  const endpoint = options.endpoint ?? TMAP_PEDESTRIAN_ENDPOINT;
  const fetcher = options.fetchImpl ?? fetch;

  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      appKey,
    },
    body: JSON.stringify(buildTmapRequestBody(origin, destination, searchOption)),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`Tmap pedestrian route failed: ${response.status}`);
  }

  const parsed = parseTmapResponse(await response.json());
  return { searchOption, ...parsed };
}

/**
 * 후보 경로 여러 개를 searchOption별 병렬 직접 호출로 만든다.
 * 일부 옵션이 실패해도 성공한 후보만 모아 반환(전부 실패 시에만 에러).
 * 동일 좌표열(거리 동일) 후보는 중복 제거한다.
 */
export async function fetchTmapPedestrianRoutes(
  origin: LatLng,
  destination: LatLng & { name?: string },
  searchOptions: TmapSearchOption[] = ['0', '4', '10'],
  options: TmapClientOptions = {},
): Promise<TmapRoute[]> {
  const validSearchOptions = searchOptions.map(requireSearchOption);
  const settled = await Promise.allSettled(
    validSearchOptions.map((searchOption) =>
      fetchTmapPedestrianRoute(origin, destination, { ...options, searchOption }),
    ),
  );

  const routes: TmapRoute[] = [];
  const seenDistances = new Set<number>();
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    const route = result.value;
    // 거리+좌표수가 같은 후보는 같은 경로로 보고 중복 제거.
    const key = route.distanceM * 1000 + route.path.length;
    if (seenDistances.has(key)) continue;
    seenDistances.add(key);
    routes.push(route);
  }

  if (routes.length === 0) {
    const firstRejection = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    throw firstRejection ? firstRejection.reason : new Error('Tmap 경로 후보를 가져오지 못했습니다');
  }
  return routes;
}
