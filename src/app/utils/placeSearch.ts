import type { Destination } from '../store/appStore';
import { createApiError } from './apiError';

export const PLACE_SEARCH_ENDPOINT = '/api/places/search';

/**
 * 장소 카탈로그를 검색어로 필터링한다 (실시간 type-to-filter용).
 * - 검색어가 비거나 공백뿐이면 빈 배열을 반환(호출부에서 '최근 검색'을 대신 노출).
 * - 이름/주소 어느 쪽이든 부분일치, 앞뒤 공백 트림 + 라틴 대소문자 무시.
 *
 * 백엔드 장소검색(maps API) 연동 시에도 동일 시그니처로 교체 가능하도록 분리.
 */
export function filterPlaces(catalog: Destination[], keyword: string): Destination[] {
  const trimmed = keyword.trim().toLowerCase();
  if (!trimmed) return [];
  return catalog.filter(
    (p) =>
      p.name.toLowerCase().includes(trimmed) ||
      p.address.toLowerCase().includes(trimmed),
  );
}

export interface PlaceSearchClientOptions {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidPlaceCoordinate(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function toDestination(value: unknown): Destination | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Partial<Record<keyof Destination, unknown>>;
  if (
    typeof item.name !== 'string' ||
    typeof item.address !== 'string' ||
    !isFiniteNumber(item.lat) ||
    !isFiniteNumber(item.lng) ||
    !isValidPlaceCoordinate(item.lat, item.lng)
  ) {
    return null;
  }
  return {
    name: item.name,
    address: item.address,
    lat: item.lat,
    lng: item.lng,
  };
}

/**
 * 백엔드 장소검색 계약(`/api/places/search`)을 Destination으로 변환한다.
 * 응답 계약: PlaceItem{name,address,lat,lng}. 좌표는 경로 요청에 필요하므로 그대로 보존한다.
 */
export async function fetchPlaces(
  keyword: string,
  options: PlaceSearchClientOptions = {},
): Promise<Destination[]> {
  const trimmed = keyword.trim();
  if (!trimmed) return [];

  const endpoint = options.endpoint ?? PLACE_SEARCH_ENDPOINT;
  const fetcher = options.fetchImpl ?? fetch;
  const params = new URLSearchParams({ keyword: trimmed });
  const separator = endpoint.includes('?') ? '&' : '?';
  const response = await fetcher(`${endpoint}${separator}${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: options.signal,
  });

  if (!response.ok) {
    throw await createApiError(response, 'Place search failed');
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('Place search response must be an array');
  }

  return payload.map(toDestination).filter((place): place is Destination => place !== null);
}

/**
 * 실제 API 검색을 우선 사용하고, 네트워크/서버 실패 시 기존 mock 카탈로그로 폴백한다.
 */
export async function searchPlacesWithFallback(
  keyword: string,
  fallbackCatalog: Destination[],
  options: PlaceSearchClientOptions = {},
): Promise<Destination[]> {
  try {
    return await fetchPlaces(keyword, options);
  } catch {
    return filterPlaces(fallbackCatalog, keyword);
  }
}
