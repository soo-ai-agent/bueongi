import { describe, it, expect } from 'vitest';
import { filterPlaces } from './placeSearch';
import type { Destination } from '../store/appStore';

const catalog: Destination[] = [
  { name: '강남역 2번 출구', address: '서울 강남구 강남대로 396' },
  { name: '역삼역 3번 출구', address: '서울 강남구 테헤란로' },
  { name: 'Starbucks 신사점', address: '서울 강남구 도산대로' },
];

describe('filterPlaces', () => {
  it('빈 검색어는 빈 배열 (최근 검색 노출을 호출부에 위임)', () => {
    expect(filterPlaces(catalog, '')).toEqual([]);
    expect(filterPlaces(catalog, '   ')).toEqual([]);
  });

  it('이름 부분일치', () => {
    const r = filterPlaces(catalog, '강남역');
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('강남역 2번 출구');
  });

  it('주소 부분일치', () => {
    const r = filterPlaces(catalog, '테헤란로');
    expect(r.map((p) => p.name)).toEqual(['역삼역 3번 출구']);
  });

  it('앞뒤 공백을 트림한 뒤 매칭', () => {
    expect(filterPlaces(catalog, '  역삼  ')).toHaveLength(1);
  });

  it('라틴 대소문자를 무시', () => {
    expect(filterPlaces(catalog, 'starbucks')).toHaveLength(1);
  });

  it('미일치는 빈 배열', () => {
    expect(filterPlaces(catalog, '부산')).toEqual([]);
  });
});
