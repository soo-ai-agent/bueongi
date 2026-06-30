import { describe, expect, it } from 'vitest';
import type { PolicePoint } from './cdnAssets';
import { findNearestPolice, formatDistance, nearestPolice, toTelHref } from './nearestPolice';

const current = { lat: 37.5, lng: 127.0 };

const police: PolicePoint[] = [
  { id: 'a', type: 'police', name: '가까운파출소', lat: 37.501, lng: 127.0, tel: '02-111-2222' },
  { id: 'b', type: 'police', name: '먼파출소', lat: 37.7, lng: 127.0 }, // ~22km
  { id: 'c', type: 'police', name: '중간파출소', lat: 37.52, lng: 127.0, tel: '031-333-4444' }, // ~2.2km
  { id: 'd', type: 'police', name: '손상좌표', lat: Number.NaN, lng: 127.0 },
];

describe('findNearestPolice', () => {
  it('10km 이내만 거리순으로 반환한다', () => {
    const result = findNearestPolice(current, police);
    expect(result.map((p) => p.id)).toEqual(['a', 'c']); // b는 10km 밖, d는 손상
    expect(result[0].distanceM).toBeLessThan(result[1].distanceM);
  });

  it('반경/개수 제한을 적용한다', () => {
    const result = findNearestPolice(current, police, { radiusMeters: 1000 });
    expect(result.map((p) => p.id)).toEqual(['a']);
  });

  it('손상 좌표는 제외한다', () => {
    expect(findNearestPolice(current, police).some((p) => p.id === 'd')).toBe(false);
  });
});

describe('nearestPolice', () => {
  it('가장 가까운 1곳', () => {
    expect(nearestPolice(current, police)?.id).toBe('a');
  });

  it('반경 내 후보 없으면 null', () => {
    expect(nearestPolice(current, police, { radiusMeters: 1 })).toBeNull();
  });
});

describe('toTelHref / formatDistance', () => {
  it('하이픈을 제거한 tel: URL', () => {
    expect(toTelHref({ tel: '02-111-2222' })).toBe('tel:021112222');
  });

  it('tel 없으면 null', () => {
    expect(toTelHref({ tel: undefined })).toBeNull();
  });

  it('거리 라벨', () => {
    expect(formatDistance(320)).toBe('320m');
    expect(formatDistance(1234)).toBe('1.2km');
  });
});
