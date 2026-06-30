import { describe, it, expect } from 'vitest';
import { summarizeSafetyFacilities, toSafetyFacilityItems } from './safetyFacilities';

describe('summarizeSafetyFacilities', () => {
  it('POI 목록에서 시설 종류별 개수와 합계를 센다', () => {
    const pois = [
      { type: 'start' },
      { type: 'end' },
      { type: 'cctv' },
      { type: 'cctv' },
      { type: 'bell' },
      { type: 'store' },
      { type: 'police' },
    ];
    expect(summarizeSafetyFacilities(pois)).toEqual({
      cctv: 2,
      bell: 1,
      store: 1,
      police: 1,
      total: 5,
    });
  });

  it('start/end·알 수 없는 타입은 합계에서 제외한다', () => {
    const pois = [{ type: 'start' }, { type: 'end' }, { type: 'unknown' }];
    expect(summarizeSafetyFacilities(pois).total).toBe(0);
  });

  it('빈 목록/누락 입력은 모두 0으로 안전 처리한다', () => {
    expect(summarizeSafetyFacilities([]).total).toBe(0);
    expect(summarizeSafetyFacilities(null).total).toBe(0);
    expect(summarizeSafetyFacilities(undefined).total).toBe(0);
  });
});

describe('toSafetyFacilityItems', () => {
  it('개수 0인 시설은 렌더 항목에서 제외한다', () => {
    const items = toSafetyFacilityItems({ cctv: 2, bell: 0, store: 1, police: 0, total: 3 });
    expect(items.map((i) => i.type)).toEqual(['cctv', 'store']);
    expect(items.find((i) => i.type === 'cctv')?.count).toBe(2);
  });

  it('모든 시설이 0이면 빈 배열을 반환한다', () => {
    expect(toSafetyFacilityItems({ cctv: 0, bell: 0, store: 0, police: 0, total: 0 })).toEqual([]);
  });

  it('항목 라벨은 한글 시설명으로 노출한다', () => {
    const items = toSafetyFacilityItems({ cctv: 1, bell: 1, store: 1, police: 1, total: 4 });
    expect(items.map((i) => i.label)).toEqual(['CCTV', '비상벨', '편의점', '파출소']);
  });
});
