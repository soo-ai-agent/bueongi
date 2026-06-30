import type { Destination } from '../store/appStore';
import type { NavStep } from './tmap';
import type { RouteMapPoi, RouteMapPoiType } from '../components/map/RouteMap';
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
  /** 보행자 경로 상세 좌표열(WGS84). 지도 Polyline에 직접 사용. */
  path?: LatLng[];
  /** 단계별 길안내 지점. 길안내 화면의 좌/우회전 안내에 사용. */
  steps?: NavStep[];
  /** 백엔드 안심점수(0~100). 안심 라우팅 응답에만 존재. */
  score?: number;
  /** 회랑 내 안심 시설 + 출발/도착 마커. 안심 라우팅 응답에만 존재. */
  markers?: RouteMapPoi[];
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

function isRouteMapPoiType(value: unknown): value is RouteMapPoiType {
  return (
    value === 'cctv' ||
    value === 'bell' ||
    value === 'store' ||
    value === 'police' ||
    value === 'safehouse' ||
    value === 'lamp' ||
    value === 'start' ||
    value === 'end'
  );
}

/** 경로 좌표열(path) 파싱 — 유효 LatLng만 남긴다. 비배열/빈 배열이면 undefined. */
function toRoutePath(value: unknown): LatLng[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const path = value.filter(hasValidLatLng).map((p) => ({ lat: p.lat, lng: p.lng }));
  return path.length > 0 ? path : undefined;
}

/** 단계별 길안내(steps) 파싱 — NavStep 필수 필드를 모두 갖춘 항목만 남긴다. */
function toNavStep(value: unknown): NavStep | null {
  if (typeof value !== 'object' || value === null) return null;
  const step = value as Partial<Record<keyof NavStep, unknown>>;
  if (
    typeof step.index !== 'number' ||
    !isFiniteInRange(step.lat, -90, 90) ||
    !isFiniteInRange(step.lng, -180, 180) ||
    typeof step.description !== 'string' ||
    typeof step.turnType !== 'number' ||
    typeof step.distanceM !== 'number' ||
    typeof step.timeS !== 'number' ||
    typeof step.pointType !== 'string'
  ) {
    return null;
  }
  return {
    index: step.index,
    lat: step.lat,
    lng: step.lng,
    description: step.description,
    turnType: step.turnType,
    distanceM: step.distanceM,
    timeS: step.timeS,
    pointType: step.pointType,
  };
}

function toNavSteps(value: unknown): NavStep[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const steps = value.map(toNavStep).filter((step): step is NavStep => step !== null);
  return steps.length > 0 ? steps : undefined;
}

/** 거점 마커(markers) 파싱 — RouteMapPoi 호환 항목만 남긴다(type/x/y 필수, lat/lng/name 선택). */
function toRouteMapPoi(value: unknown): RouteMapPoi | null {
  if (typeof value !== 'object' || value === null) return null;
  const poi = value as Partial<Record<keyof RouteMapPoi, unknown>>;
  if (!isRouteMapPoiType(poi.type) || typeof poi.x !== 'number' || typeof poi.y !== 'number') {
    return null;
  }
  const marker: RouteMapPoi = { type: poi.type, x: poi.x, y: poi.y };
  if (typeof poi.lat === 'number') marker.lat = poi.lat;
  if (typeof poi.lng === 'number') marker.lng = poi.lng;
  if (typeof poi.name === 'string') marker.name = poi.name;
  if (typeof poi.purpose === 'string') marker.purpose = poi.purpose;
  if (typeof poi.cameraCount === 'number') marker.cameraCount = poi.cameraCount;
  if (typeof poi.address === 'string') marker.address = poi.address;
  if (typeof poi.phone === 'string') marker.phone = poi.phone;
  return marker;
}

function toRouteMarkers(value: unknown): RouteMapPoi[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const markers = value.map(toRouteMapPoi).filter((m): m is RouteMapPoi => m !== null);
  return markers.length > 0 ? markers : undefined;
}

/**
 * 백엔드 RouteOption 파싱. 필수 UI 필드(id/name/time/dist/desc/tags/type)를 검증하고,
 * 안심 라우팅 응답에만 있는 path/steps/score/markers는 유효할 때만 선택적으로 채운다.
 * (기존 /api/routes/compare 응답에는 선택 필드가 없어 그대로 호환된다.)
 */
export function toRouteOption(value: unknown): RouteOption | null {
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

  const option: RouteOption = {
    id: route.id,
    name: route.name,
    time: route.time,
    dist: route.dist,
    desc: route.desc,
    tags: route.tags.map(toRouteOptionTag).filter((tag): tag is RouteOptionTag => tag !== null),
    type: route.type,
  };

  const path = toRoutePath(route.path);
  if (path) option.path = path;
  const steps = toNavSteps(route.steps);
  if (steps) option.steps = steps;
  if (isFiniteInRange(route.score, 0, 100)) option.score = route.score;
  const markers = toRouteMarkers(route.markers);
  if (markers) option.markers = markers;

  return option;
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
