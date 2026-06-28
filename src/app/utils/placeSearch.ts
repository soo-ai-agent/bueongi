import type { Destination } from '../store/appStore';
import { createApiError } from './apiError';
import { loadKakaoServices } from './kakaoMaps';

export const PLACE_SEARCH_ENDPOINT = '/api/places/search';

/** Kakao 키워드 검색 최대 결과 수(1페이지). */
const KAKAO_PLACE_SEARCH_SIZE = 15;

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

/** Kakao Local 장소(KakaoPlace)를 Destination으로 변환. 좌표는 x=경도/y=위도 문자열을 숫자화. */
export function kakaoPlaceToDestination(place: KakaoPlace): Destination | null {
  const name = typeof place.place_name === 'string' ? place.place_name : '';
  const address = place.road_address_name?.trim() || place.address_name?.trim() || '';
  const lat = Number(place.y);
  const lng = Number(place.x);
  if (!name || !isFiniteNumber(lat) || !isFiniteNumber(lng) || !isValidPlaceCoordinate(lat, lng)) {
    return null;
  }
  return { name, address, lat, lng };
}

/**
 * Kakao 지도 JS SDK(services.Places, 기존 JS 키)로 프론트에서 직접 키워드 장소검색을 한다.
 * 설계 원칙 "앱 직접 호출 우선" — 별도 REST 키 없이 이미 로드된 지도 SDK 키로 실제 장소를 찾는다.
 *
 * @returns SDK/키 미가용이거나 검색 오류면 `null`(호출부가 백엔드/카탈로그로 폴백). 검색 성공 시
 *   결과 배열(진짜 결과 없음이면 빈 배열 — 이는 권위 있는 "결과 없음"이라 폴백하지 않는다).
 */
export async function searchPlacesViaKakao(
  keyword: string,
  options: PlaceSearchClientOptions = {},
): Promise<Destination[] | null> {
  const trimmed = keyword.trim();
  if (!trimmed) return [];

  const services = await loadKakaoServices();
  if (!services?.Places) return null; // SDK/키 미가용 → 폴백 신호

  return new Promise<Destination[] | null>((resolve) => {
    const places = new services.Places();
    places.keywordSearch(
      trimmed,
      (data, status) => {
        if (options.signal?.aborted) {
          resolve([]);
          return;
        }
        if (status === services.Status.ERROR) {
          resolve(null); // 검색 오류 → 폴백
          return;
        }
        if (status !== services.Status.OK || !Array.isArray(data)) {
          resolve([]); // ZERO_RESULT 등 → 권위 있는 "결과 없음"
          return;
        }
        resolve(
          data.map(kakaoPlaceToDestination).filter((d): d is Destination => d !== null),
        );
      },
      { size: KAKAO_PLACE_SEARCH_SIZE },
    );
  });
}

/**
 * 장소검색 폴백 체인:
 *  1순위 Kakao 지도 SDK(services.Places, 기존 JS 키) 직접 검색 — 실제 장소/주소.
 *  2순위 백엔드(/api/places/search) — Kakao SDK 미가용 시.
 *  3순위 클라이언트 mock 카탈로그 — 백엔드도 실패 시.
 * 각 단계는 실패해도 다음으로 넘어가 검색 불능을 막는다(안심앱: 근사 결과가 무결과보다 안전).
 */
export async function searchPlacesWithFallback(
  keyword: string,
  fallbackCatalog: Destination[],
  options: PlaceSearchClientOptions = {},
): Promise<Destination[]> {
  // 1순위: Kakao SDK 직접 검색. null(미가용/오류)이면 폴백, 배열(빈 배열 포함)이면 권위 결과.
  try {
    const viaKakao = await searchPlacesViaKakao(keyword, options);
    if (viaKakao !== null) return viaKakao;
  } catch {
    /* SDK 예외 → 백엔드 폴백 */
  }
  // 2순위: 백엔드 장소검색.
  try {
    return await fetchPlaces(keyword, options);
  } catch {
    // 3순위: 클라이언트 카탈로그.
    return filterPlaces(fallbackCatalog, keyword);
  }
}
