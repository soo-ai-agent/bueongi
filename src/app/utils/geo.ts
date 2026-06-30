import type { LatLng } from './routeCompare';

/**
 * 안전 점수/마커/최근접 파출소 계산에 쓰는 순수 지오메트리 유틸.
 *
 * 모든 거리는 미터(m) 단위 WGS84 기준. 도심 규모(수 km)에서는 위경도를
 * 국소 평면(equirectangular)으로 투영해도 오차가 작아 경로 버퍼(30m) 판정과
 * 최근접 검색(10km)에 충분하다. 서버 경유 없이 앱 로컬에서 결정적으로 계산한다.
 */

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** 두 WGS84 좌표 사이 대권거리(haversine, m). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

interface PlanarPoint {
  x: number;
  y: number;
}

/**
 * 기준 위도 근처에서 위경도를 국소 평면(m)으로 투영한다.
 * 점-선분 최단거리처럼 평면 기하가 필요한 계산에서만 쓴다.
 */
function toPlanar(point: LatLng, originLat: number): PlanarPoint {
  const latScale = (Math.PI / 180) * EARTH_RADIUS_M;
  const lngScale = latScale * Math.cos(toRad(originLat));
  return { x: point.lng * lngScale, y: point.lat * latScale };
}

/** 경로(폴리라인) 전체 길이(m). 좌표가 2개 미만이면 0. */
export function pathLengthMeters(path: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += haversineMeters(path[i - 1], path[i]);
  }
  return total;
}

/** 점에서 선분 [a,b]까지의 최단거리(m). 국소 평면 투영 후 계산. */
export function distancePointToSegmentMeters(p: LatLng, a: LatLng, b: LatLng): number {
  const originLat = p.lat;
  const pp = toPlanar(p, originLat);
  const pa = toPlanar(a, originLat);
  const pb = toPlanar(b, originLat);

  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const segLenSq = dx * dx + dy * dy;

  // 선분이 한 점으로 퇴화하면 점-점 거리.
  if (segLenSq === 0) {
    return Math.hypot(pp.x - pa.x, pp.y - pa.y);
  }

  // 투영 매개변수 t를 [0,1]로 클램프해 선분 위 최근접점을 구한다.
  let t = ((pp.x - pa.x) * dx + (pp.y - pa.y) * dy) / segLenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = pa.x + t * dx;
  const cy = pa.y + t * dy;
  return Math.hypot(pp.x - cx, pp.y - cy);
}

/** 점에서 경로(폴리라인)까지의 최단거리(m). 빈/단일 좌표 경로 방어. */
export function minDistanceToPathMeters(p: LatLng, path: LatLng[]): number {
  if (path.length === 0) return Infinity;
  if (path.length === 1) return haversineMeters(p, path[0]);
  let min = Infinity;
  for (let i = 1; i < path.length; i += 1) {
    const d = distancePointToSegmentMeters(p, path[i - 1], path[i]);
    if (d < min) min = d;
  }
  return min;
}

/** 점이 경로 버퍼(corridor, 기본 30m) 안에 있는지. */
export function isWithinCorridor(p: LatLng, path: LatLng[], meters: number): boolean {
  return minDistanceToPathMeters(p, path) <= meters;
}

/** 점 집합 중 경로 버퍼 안에 드는 개수. 밀도 점수 계산용. */
export function countWithinCorridor(points: LatLng[], path: LatLng[], meters: number): number {
  let count = 0;
  for (const point of points) {
    if (isWithinCorridor(point, path, meters)) count += 1;
  }
  return count;
}

/**
 * 두 경로의 겹침 길이(m) 근사.
 * 기준 경로(base)의 각 선분 중점이 다른 경로(other) 버퍼 안에 들면 그 선분 길이를 겹침으로 본다.
 * A-1/A-4 안심귀갓길과 Tmap 경로의 보너스 산정에 쓰는 결정적 근사치.
 */
export function overlapLengthMeters(base: LatLng[], other: LatLng[], meters: number): number {
  if (base.length < 2 || other.length < 2) return 0;
  let overlap = 0;
  for (let i = 1; i < base.length; i += 1) {
    const a = base[i - 1];
    const b = base[i];
    const mid: LatLng = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
    if (minDistanceToPathMeters(mid, other) <= meters) {
      overlap += haversineMeters(a, b);
    }
  }
  return overlap;
}
