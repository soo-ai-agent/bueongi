import { describe, expect, it } from 'vitest';
import type { LatLng } from './routeCompare';
import type { TmapRoute } from './tmap';
import type { SafetyFacilities } from './safetyScore';
import {
  formatDistanceKo,
  formatDurationKo,
  scoreAndType,
  toRouteMarkers,
  toRouteOptions,
} from './directRoute';

const safePath: LatLng[] = [
  { lat: 37.5, lng: 127.0 },
  { lat: 37.51, lng: 127.0 },
];

const longPath: LatLng[] = [
  { lat: 37.5, lng: 127.0 },
  { lat: 37.52, lng: 127.02 },
];

const empty: SafetyFacilities = { cctv: [], lamp: [], bell: [], safehouse: [] };

const routes: TmapRoute[] = [
  { searchOption: '0', path: safePath, distanceM: 1100, timeS: 900 }, // 느리지만 안전(CCTV 많음)
  { searchOption: '10', path: longPath, distanceM: 3000, timeS: 600 }, // 빠르지만 시설 없음
];

const facilities: SafetyFacilities = {
  ...empty,
  cctv: Array.from({ length: 22 }, (_, i) => ({ lat: 37.5 + (0.01 * i) / 22, lng: 127.0 })),
};

describe('formatDurationKo / formatDistanceKo', () => {
  it('초→분, 최소 1분', () => {
    expect(formatDurationKo(900)).toBe('15분');
    expect(formatDurationKo(20)).toBe('1분');
  });

  it('거리 m/km 라벨', () => {
    expect(formatDistanceKo(640)).toBe('640m');
    expect(formatDistanceKo(1100)).toBe('1.1km');
  });
});

describe('scoreAndType', () => {
  it('안심(최고점)과 빠른(최소시간)을 다른 후보로 배정한다', () => {
    const scored = scoreAndType(routes, facilities, [safePath]);
    const safe = scored.find((s) => s.type === 'safe');
    const fast = scored.find((s) => s.type === 'fast');
    expect(safe?.route.searchOption).toBe('0'); // CCTV/안심길 보너스
    expect(fast?.route.searchOption).toBe('10'); // 600초로 최단
    expect(safe?.score.score).toBeGreaterThan(fast?.score.score ?? 0);
  });

  it('빈 입력은 빈 배열', () => {
    expect(scoreAndType([], facilities)).toEqual([]);
  });
});

describe('toRouteOptions', () => {
  it('안전 점수 내림차순으로 RouteOption 계약을 만든다', () => {
    const options = toRouteOptions(scoreAndType(routes, facilities, [safePath]));
    expect(options[0].type).toBe('safe');
    expect(options[0].name).toBe('안심 경로');
    expect(options[0].tags.some((t) => t.text === '안심')).toBe(true);
    expect(options.every((o) => typeof o.time === 'string' && typeof o.dist === 'string')).toBe(true);
  });
});

describe('toRouteMarkers', () => {
  it('경로 버퍼 안 CCTV/지킴이집/비상벨만 마커로 만든다(조명 제외)', () => {
    const markers = toRouteMarkers(safePath, {
      cctv: [{ lat: 37.505, lng: 127.0 }], // 안
      bell: [{ lat: 37.6, lng: 127.0 }], // 밖
      safehouse: [{ lat: 37.5, lng: 127.0 }], // 안
    });
    const types = markers.map((m) => m.type).sort();
    expect(types).toEqual(['cctv', 'safehouse']);
    expect(markers.every((m) => typeof m.lat === 'number' && typeof m.lng === 'number')).toBe(true);
  });
});
