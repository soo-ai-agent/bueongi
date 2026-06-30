import { describe, expect, it } from 'vitest';
import {
  countWithinCorridor,
  distancePointToSegmentMeters,
  haversineMeters,
  isWithinCorridor,
  minDistanceToPathMeters,
  overlapLengthMeters,
  pathLengthMeters,
} from './geo';

describe('haversineMeters', () => {
  it('같은 점은 0m', () => {
    expect(haversineMeters({ lat: 37.5, lng: 127 }, { lat: 37.5, lng: 127 })).toBe(0);
  });

  it('위도 1도는 약 111km(±1%)', () => {
    const d = haversineMeters({ lat: 37, lng: 127 }, { lat: 38, lng: 127 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

describe('pathLengthMeters', () => {
  it('좌표 2개 미만은 0', () => {
    expect(pathLengthMeters([])).toBe(0);
    expect(pathLengthMeters([{ lat: 37, lng: 127 }])).toBe(0);
  });

  it('구간 거리를 합산한다', () => {
    const path = [
      { lat: 37.5, lng: 127.0 },
      { lat: 37.5, lng: 127.001 },
      { lat: 37.5, lng: 127.002 },
    ];
    const total = pathLengthMeters(path);
    const single = haversineMeters(path[0], path[1]);
    expect(total).toBeCloseTo(single * 2, 0);
  });
});

describe('distancePointToSegmentMeters', () => {
  it('선분 위의 점은 0에 가깝다', () => {
    const a = { lat: 37.5, lng: 127.0 };
    const b = { lat: 37.5, lng: 127.01 };
    const mid = { lat: 37.5, lng: 127.005 };
    expect(distancePointToSegmentMeters(mid, a, b)).toBeLessThan(1);
  });

  it('선분 끝 너머의 점은 끝점까지 거리로 클램프된다', () => {
    const a = { lat: 37.5, lng: 127.0 };
    const b = { lat: 37.5, lng: 127.01 };
    const beyond = { lat: 37.5, lng: 127.02 };
    const d = distancePointToSegmentMeters(beyond, a, b);
    expect(d).toBeCloseTo(haversineMeters(beyond, b), -1);
  });

  it('퇴화 선분(한 점)은 점-점 거리', () => {
    const a = { lat: 37.5, lng: 127.0 };
    const p = { lat: 37.501, lng: 127.0 };
    expect(distancePointToSegmentMeters(p, a, a)).toBeCloseTo(haversineMeters(p, a), -1);
  });
});

describe('minDistanceToPathMeters / corridor', () => {
  const path = [
    { lat: 37.5, lng: 127.0 },
    { lat: 37.5, lng: 127.01 },
  ];

  it('빈 경로는 Infinity', () => {
    expect(minDistanceToPathMeters({ lat: 37.5, lng: 127 }, [])).toBe(Infinity);
  });

  it('30m 버퍼 안/밖을 판정한다', () => {
    // 경로에서 위도로 약 11m 떨어진 점(0.0001도 ≈ 11m) → 30m 안.
    expect(isWithinCorridor({ lat: 37.5001, lng: 127.005 }, path, 30)).toBe(true);
    // 약 220m 떨어진 점(0.002도) → 30m 밖.
    expect(isWithinCorridor({ lat: 37.502, lng: 127.005 }, path, 30)).toBe(false);
  });

  it('버퍼 안 점만 센다', () => {
    const points = [
      { lat: 37.5001, lng: 127.005 }, // 안
      { lat: 37.502, lng: 127.005 }, // 밖
      { lat: 37.4999, lng: 127.002 }, // 안
    ];
    expect(countWithinCorridor(points, path, 30)).toBe(2);
  });
});

describe('overlapLengthMeters', () => {
  const base = [
    { lat: 37.5, lng: 127.0 },
    { lat: 37.5, lng: 127.01 },
    { lat: 37.5, lng: 127.02 },
  ];

  it('완전히 겹치는 경로는 base 길이에 근접', () => {
    const overlap = overlapLengthMeters(base, base, 30);
    expect(overlap).toBeCloseTo(pathLengthMeters(base), -1);
  });

  it('멀리 떨어진 경로는 겹침 0', () => {
    const other = [
      { lat: 37.6, lng: 127.0 },
      { lat: 37.6, lng: 127.02 },
    ];
    expect(overlapLengthMeters(base, other, 30)).toBe(0);
  });

  it('좌표 부족 경로는 0', () => {
    expect(overlapLengthMeters([base[0]], base, 30)).toBe(0);
  });
});
