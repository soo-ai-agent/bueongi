import type { Destination } from '../store/appStore';
import { createApiError } from './apiError';
import {
  buildRouteCompareRequest,
  toRouteOption,
  type LatLng,
  type RouteCompareRequest,
  type RouteOption,
} from './routeCompare';

/**
 * 안심 라우팅 백엔드 클라이언트.
 *
 * 데이터·연산(실 Tmap 호출 + 공공데이터 안전점수 + 경유지 우회)은 백엔드가 담당하고,
 * 프론트는 이 엔드포인트를 호출해 결과(RouteOption[])를 표시만 한다.
 * 응답은 안전점수 내림차순이며 각 경로에 path/steps/score/markers가 포함된다.
 */

export const SAFE_COMPARE_ENDPOINT = '/api/routes/safe-compare';

/** 안심 강도. balanced=균형, safe=안심 우선(기본), safest=안심 최우선. */
export type SafetyPreference = 'balanced' | 'safe' | 'safest';

export type SafeCompareRequest = RouteCompareRequest & {
  safetyPreference?: SafetyPreference;
};

export interface SafeCompareClientOptions {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  safetyPreference?: SafetyPreference;
}

/**
 * 안심 라우팅 요청 body. 기존 compare 계약(origin/destination)에 안심 강도만 더한다.
 * safetyPreference 미지정 시 백엔드 기본값("safe")에 맡긴다(키를 보내지 않는다).
 */
export function buildSafeCompareRequest(
  destination: Destination | null | undefined,
  origin: LatLng | null | undefined,
  safetyPreference?: SafetyPreference,
): SafeCompareRequest {
  const base = buildRouteCompareRequest(destination, origin);
  return safetyPreference ? { ...base, safetyPreference } : base;
}

/**
 * POST /api/routes/safe-compare. 안전점수 내림차순 RouteOption[]을 반환한다.
 * 에러는 RFC7807 + code를 ApiError로 매핑해 throw(기존 compare와 동일 UX).
 */
export async function fetchSafeCompare(
  destination: Destination,
  origin: LatLng,
  options: SafeCompareClientOptions = {},
): Promise<RouteOption[]> {
  const endpoint = options.endpoint ?? SAFE_COMPARE_ENDPOINT;
  const fetcher = options.fetchImpl ?? fetch;
  const body = buildSafeCompareRequest(destination, origin, options.safetyPreference);
  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    throw await createApiError(response, 'Safe route compare failed');
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('Safe route compare response must be an array');
  }

  return payload.map(toRouteOption).filter((route): route is RouteOption => route !== null);
}
