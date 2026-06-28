import type { Destination } from '../store/appStore';
import type { NavStep } from './tmap';
import { createApiError } from './apiError';

export const ROUTE_COMPARE_ENDPOINT = '/api/routes/compare';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteCompareRequest {
  origin: LatLng;
  destination: LatLng & { name?: string };
}

export type RouteType = 'safe' | 'main' | 'fast';
export type RouteTagVariant = 'default' | 'mint' | 'blue' | 'yellow' | 'outline';

export interface RouteOptionTag {
  text: string;
  variant: RouteTagVariant;
}

export interface RouteOption {
  id: string;
  name: string;
  time: string;
  dist: string;
  desc: string;
  tags: RouteOptionTag[];
  type: RouteType;
  /** Tmap 보행자 경로 상세 좌표열(WGS84). 지도 Polyline에 직접 사용. */
  path?: LatLng[];
  /** Tmap 단계별 길안내 지점. 길안내 화면의 좌/우회전 안내에 사용. */
  steps?: NavStep[];
}

export interface RouteCompareClientOptions {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

function isFiniteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

export function hasValidLatLng(value: unknown): value is LatLng {
  if (typeof value !== 'object' || value === null) return false;
  const point = value as Partial<Record<keyof LatLng, unknown>>;
  return isFiniteInRange(point.lat, -90, 90) && isFiniteInRange(point.lng, -180, 180);
}

function requireLatLng(value: unknown, label: string): LatLng {
  if (!hasValidLatLng(value)) {
    throw new Error(`Route compare requires valid ${label} coordinates`);
  }
  return value;
}

export function buildRouteCompareRequest(
  destination: Destination | null | undefined,
  origin: LatLng | null | undefined,
): RouteCompareRequest {
  const validOrigin = requireLatLng(origin, 'origin');
  const validDestination = requireLatLng(destination, 'destination');
  const destinationName = destination?.name?.trim();

  return {
    origin: {
      lat: validOrigin.lat,
      lng: validOrigin.lng,
    },
    destination: {
      lat: validDestination.lat,
      lng: validDestination.lng,
      ...(destinationName ? { name: destinationName } : {}),
    },
  };
}

function isRouteType(value: unknown): value is RouteType {
  return value === 'safe' || value === 'main' || value === 'fast';
}

function isRouteTagVariant(value: unknown): value is RouteTagVariant {
  return value === 'default' || value === 'mint' || value === 'blue' || value === 'yellow' || value === 'outline';
}

function toRouteOptionTag(value: unknown): RouteOptionTag | null {
  if (typeof value !== 'object' || value === null) return null;
  const tag = value as Partial<Record<keyof RouteOptionTag, unknown>>;
  if (typeof tag.text !== 'string' || !isRouteTagVariant(tag.variant)) return null;
  return { text: tag.text, variant: tag.variant };
}

function toRouteOption(value: unknown): RouteOption | null {
  if (typeof value !== 'object' || value === null) return null;
  const route = value as Partial<Record<keyof RouteOption, unknown>>;
  if (
    typeof route.id !== 'string' ||
    typeof route.name !== 'string' ||
    typeof route.time !== 'string' ||
    typeof route.dist !== 'string' ||
    typeof route.desc !== 'string' ||
    !Array.isArray(route.tags) ||
    !isRouteType(route.type)
  ) {
    return null;
  }

  return {
    id: route.id,
    name: route.name,
    time: route.time,
    dist: route.dist,
    desc: route.desc,
    tags: route.tags.map(toRouteOptionTag).filter((tag): tag is RouteOptionTag => tag !== null),
    type: route.type,
  };
}

export async function fetchRouteOptions(
  destination: Destination,
  origin: LatLng,
  options: RouteCompareClientOptions = {},
): Promise<RouteOption[]> {
  const endpoint = options.endpoint ?? ROUTE_COMPARE_ENDPOINT;
  const fetcher = options.fetchImpl ?? fetch;
  const body = buildRouteCompareRequest(destination, origin);
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
    throw await createApiError(response, 'Route compare failed');
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('Route compare response must be an array');
  }

  return payload.map(toRouteOption).filter((route): route is RouteOption => route !== null);
}
