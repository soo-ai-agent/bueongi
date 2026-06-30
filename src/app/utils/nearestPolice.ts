import type { LatLng } from './routeCompare';
import type { PolicePoint } from './cdnAssets';
import { haversineMeters } from './geo';

/**
 * 최근접 파출소/지구대 검색(앱 로컬, 네트워크 없이 동작).
 *
 * 설계 기준: police/all.json을 로컬 캐시에서 읽어 현재 위치 기준 10km 이내 후보를
 * 거리순 정렬해 최근접부터 보여주고, 전화 연결(tel:)을 제공한다. 위급 상황이므로
 * 네트워크가 끊겨도 동작해야 한다(데이터는 사전 캐시된 로컬 배열을 받는다).
 */

export const NEAREST_POLICE_RADIUS_M = 10_000;

export interface NearbyPolice extends PolicePoint {
  /** 현재 위치로부터의 직선거리(m). */
  distanceM: number;
}

export interface NearestPoliceOptions {
  radiusMeters?: number;
  limit?: number;
}

/**
 * 현재 위치 기준 반경 내 파출소를 거리순으로 반환한다.
 * 좌표가 유효하지 않은 항목은 제외한다(손상 캐시 방어).
 */
export function findNearestPolice(
  current: LatLng,
  police: PolicePoint[],
  options: NearestPoliceOptions = {},
): NearbyPolice[] {
  const radius = options.radiusMeters ?? NEAREST_POLICE_RADIUS_M;
  const limit = options.limit ?? 5;

  const withDistance: NearbyPolice[] = [];
  for (const item of police) {
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) continue;
    const distanceM = haversineMeters(current, item);
    if (distanceM <= radius) {
      withDistance.push({ ...item, distanceM: Math.round(distanceM) });
    }
  }

  withDistance.sort((a, b) => a.distanceM - b.distanceM);
  return withDistance.slice(0, limit);
}

/** 가장 가까운 파출소 1곳(없으면 null). */
export function nearestPolice(current: LatLng, police: PolicePoint[], options: NearestPoliceOptions = {}): NearbyPolice | null {
  return findNearestPolice(current, police, { ...options, limit: 1 })[0] ?? null;
}

/** 전화 연결용 tel: URL. 번호의 하이픈/공백을 정리한다. tel 없으면 null. */
export function toTelHref(police: Pick<PolicePoint, 'tel'>): string | null {
  const tel = police.tel?.replace(/[^0-9+]/g, '');
  if (!tel) return null;
  return `tel:${tel}`;
}

/** 거리(m)를 사람이 읽기 쉬운 한글 라벨로(예: 320m, 1.2km). */
export function formatDistance(distanceM: number): string {
  if (distanceM < 1000) return `${Math.round(distanceM)}m`;
  return `${(distanceM / 1000).toFixed(1)}km`;
}
