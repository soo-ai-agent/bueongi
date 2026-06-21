import { describe, expect, it } from 'vitest';
import type { LatLng } from './routeCompare';
import { scoreRoute, WEIGHTS, type SafetyFacilities } from './safetyScore';

// 약 1.1km 직선 경로(위도 0.01도).
const path: LatLng[] = [
  { lat: 37.5, lng: 127.0 },
  { lat: 37.51, lng: 127.0 },
];

const empty: SafetyFacilities = { cctv: [], lamp: [], bell: [], safehouse: [] };

function alongRoute(count: number): LatLng[] {
  // 경로 위(버퍼 안)에 count개의 점을 균등 배치.
  return Array.from({ length: count }, (_, i) => ({ lat: 37.5 + (0.01 * i) / count, lng: 127.0 }));
}

describe('scoreRoute', () => {
  it('시설이 없으면 0점', () => {
    expect(scoreRoute({ path, facilities: empty }).score).toBe(0);
  });

  it('30m 버퍼 밖 시설은 점수에 반영되지 않는다', () => {
    const farCctv: LatLng[] = [{ lat: 37.505, lng: 127.01 }]; // 경로에서 ~880m
    const result = scoreRoute({ path, facilities: { ...empty, cctv: farCctv } });
    expect(result.breakdown.cctvDensity).toBe(0);
    expect(result.score).toBe(0);
  });

  it('CCTV 밀도가 포화 기준이면 CCTV 가중치만큼(35점) 기여', () => {
    // 약 1.1km 경로에 25개 → 약 22.5개/km(포화 20 초과) → cctv 정규화 1.0.
    const result = scoreRoute({ path, facilities: { ...empty, cctv: alongRoute(25) } });
    expect(result.breakdown.cctvDensity).toBeGreaterThanOrEqual(20);
    expect(result.score).toBe(Math.round(WEIGHTS.cctv * 100));
  });

  it('안심귀갓길 완전 겹침이면 safePath 보너스(15점) 기여', () => {
    const result = scoreRoute({ path, facilities: empty, safePaths: [path] });
    expect(result.breakdown.safePathOverlap).toBeCloseTo(1, 1);
    expect(result.score).toBe(Math.round(WEIGHTS.safePath * 100));
  });

  it('여성안심지킴이집 개수가 포화면 safehouse 가중치(5점) 기여', () => {
    const result = scoreRoute({ path, facilities: { ...empty, safehouse: alongRoute(3) } });
    expect(result.breakdown.safehouseCount).toBe(3);
    expect(result.score).toBe(Math.round(WEIGHTS.safehouse * 100));
  });

  it('빈 경로(좌표 1개)에서도 폭주 없이 유한 점수', () => {
    const result = scoreRoute({ path: [path[0]], facilities: { ...empty, cctv: [path[0]] } });
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
