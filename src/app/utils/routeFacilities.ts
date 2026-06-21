import type { Destination } from '../store/appStore';
import { createApiError } from './apiError';
import {
  buildRouteCompareRequest,
  type LatLng,
  type RouteCompareRequest,
  type RouteType,
} from './routeCompare';

export const ROUTE_FACILITIES_ENDPOINT = '/api/routes/facilities';

export type FacilityPoiType = 'start' | 'end' | 'cctv' | 'bell' | 'store' | 'police' | 'safehouse';

export interface FacilityPoi {
  type: FacilityPoiType;
  x: number;
  y: number;
  lat: number;
  lng: number;
  name?: string;
}

export interface FacilitySummary {
  cctv: number;
  bell: number;
  store: number;
  police: number;
  /**
   * 여성안심지킴이집(B-2) 수. 백워드 호환을 위해 선택 필드 — 응답에 있을 때만 집계해 표시한다.
   * 안심집은 "지정 상태"일 뿐 영업시간 보장이 아니므로 다른 시설과 구분해 다룬다.
   */
  safehouse?: number;
  total: number;
}

export interface FacilitiesResponse {
  pois: FacilityPoi[];
  summary: FacilitySummary;
}

export type RouteFacilitiesRequest = RouteCompareRequest & {
  routeType?: RouteType;
};

export interface RouteFacilitiesClientOptions {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

function isRouteType(value: unknown): value is RouteType {
  return value === 'safe' || value === 'main' || value === 'fast';
}

function isFacilityPoiType(value: unknown): value is FacilityPoiType {
  return (
    value === 'start' ||
    value === 'end' ||
    value === 'cctv' ||
    value === 'bell' ||
    value === 'store' ||
    value === 'police' ||
    value === 'safehouse'
  );
}

function isFiniteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function buildRouteFacilitiesRequest(
  destination: Destination | null | undefined,
  origin: LatLng | null | undefined,
  routeType?: RouteType | null,
): RouteFacilitiesRequest {
  if (routeType != null && !isRouteType(routeType)) {
    throw new Error('Route facilities requires a valid route type');
  }

  return {
    ...buildRouteCompareRequest(destination, origin),
    ...(routeType ? { routeType } : {}),
  };
}

function toFacilityPoi(value: unknown): FacilityPoi | null {
  if (typeof value !== 'object' || value === null) return null;
  const poi = value as Partial<Record<keyof FacilityPoi, unknown>>;
  if (
    !isFacilityPoiType(poi.type) ||
    !isFiniteInRange(poi.x, 0, 100) ||
    !isFiniteInRange(poi.y, 0, 100) ||
    !isFiniteInRange(poi.lat, -90, 90) ||
    !isFiniteInRange(poi.lng, -180, 180) ||
    (poi.name != null && typeof poi.name !== 'string')
  ) {
    return null;
  }

  return {
    type: poi.type,
    x: poi.x,
    y: poi.y,
    lat: poi.lat,
    lng: poi.lng,
    ...(poi.name ? { name: poi.name } : {}),
  };
}

function toFacilitySummary(value: unknown): FacilitySummary | null {
  if (typeof value !== 'object' || value === null) return null;
  const summary = value as Partial<Record<keyof FacilitySummary, unknown>>;
  if (
    !isNonNegativeInteger(summary.cctv) ||
    !isNonNegativeInteger(summary.bell) ||
    !isNonNegativeInteger(summary.store) ||
    !isNonNegativeInteger(summary.police) ||
    !isNonNegativeInteger(summary.total) ||
    (summary.safehouse != null && !isNonNegativeInteger(summary.safehouse))
  ) {
    return null;
  }

  return {
    cctv: summary.cctv,
    bell: summary.bell,
    store: summary.store,
    police: summary.police,
    // 안심집은 선택 필드 — 응답에 있을 때만 보존해 구버전 백엔드 계약과 호환된다.
    ...(summary.safehouse != null ? { safehouse: summary.safehouse } : {}),
    total: summary.total,
  };
}

function toFacilitiesResponse(value: unknown): FacilitiesResponse | null {
  if (typeof value !== 'object' || value === null) return null;
  const payload = value as Partial<Record<keyof FacilitiesResponse, unknown>>;
  const summary = toFacilitySummary(payload.summary);
  if (!Array.isArray(payload.pois) || summary === null) return null;

  return {
    pois: payload.pois.map(toFacilityPoi).filter((poi): poi is FacilityPoi => poi !== null),
    summary,
  };
}

export async function fetchRouteFacilities(
  destination: Destination,
  origin: LatLng,
  routeType: RouteType,
  options: RouteFacilitiesClientOptions = {},
): Promise<FacilitiesResponse> {
  const endpoint = options.endpoint ?? ROUTE_FACILITIES_ENDPOINT;
  const fetcher = options.fetchImpl ?? fetch;
  const body = buildRouteFacilitiesRequest(destination, origin, routeType);
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
    throw await createApiError(response, 'Route facilities failed');
  }

  const payload = toFacilitiesResponse(await response.json());
  if (payload === null) {
    throw new Error('Route facilities response must include pois and summary');
  }

  return payload;
}
