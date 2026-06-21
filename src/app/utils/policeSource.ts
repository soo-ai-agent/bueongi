import type { LatLng } from './routeCompare';
import { getCdnBaseUrl } from './env';
import { fileVersion, loadManifest, loadPolice, readCachedPolice } from './cdnAssets';
import { findNearestPolice, type NearbyPolice } from './nearestPolice';

/**
 * 최근접 파출소 조회 진입점(작업 3 위급 기능).
 *
 * 설계 기준: police/all.json을 로컬 캐시에서 읽어 네트워크 없이 동작한다.
 * - 캐시가 있으면 즉시 로컬 검색(오프라인 OK).
 * - 캐시가 없을 때만 CDN에서 1회 받아 캐시한 뒤 검색한다(CDN 미설정이면 명확히 throw).
 */

export interface NearestPoliceLookupOptions {
  signal?: AbortSignal;
  limit?: number;
  radiusMeters?: number;
  now?: number;
}

export async function loadNearestPolice(current: LatLng, options: NearestPoliceLookupOptions = {}): Promise<NearbyPolice[]> {
  const search = { limit: options.limit, radiusMeters: options.radiusMeters };

  // 1) 캐시 우선 — 네트워크 없이 동작.
  const cached = readCachedPolice();
  if (cached && cached.length) {
    return findNearestPolice(current, cached, search);
  }

  // 2) 캐시가 없으면 CDN에서 1회 수신(설정 없으면 정직하게 실패).
  if (!getCdnBaseUrl()) {
    throw new Error('파출소 데이터가 아직 없습니다. 네트워크 연결 후 다시 시도해 주세요.');
  }
  const manifest = await loadManifest({ signal: options.signal });
  const police = await loadPolice(fileVersion(manifest, 'police/all.json'), { signal: options.signal, now: options.now });
  return findNearestPolice(current, police, search);
}
