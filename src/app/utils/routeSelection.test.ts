import { describe, it, expect } from 'vitest';
import { resolveRoute, parseEtaMinutes } from './routeSelection';
import type { MockRoute } from '../pages/RouteComparison';

const routes: MockRoute[] = [
  { id: '1', name: '추천 경로', time: '24분', dist: '1.2km', desc: '', tags: [], type: 'safe' },
  { id: '2', name: '큰길 위주', time: '28분', dist: '1.4km', desc: '', tags: [], type: 'main' },
  { id: '3', name: '빠른 경로', time: '18분', dist: '1.0km', desc: '', tags: [], type: 'fast' },
];

describe('resolveRoute', () => {
  it('id로 정확히 매칭', () => {
    expect(resolveRoute(routes, '3')?.name).toBe('빠른 경로');
  });

  it('없는 id는 첫 경로(추천)로 폴백', () => {
    expect(resolveRoute(routes, '999')?.id).toBe('1');
  });

  it('null/undefined(직접 진입·state 소실)도 첫 경로로 폴백', () => {
    expect(resolveRoute(routes, null)?.id).toBe('1');
    expect(resolveRoute(routes, undefined)?.id).toBe('1');
  });

  it('빈 목록은 undefined', () => {
    expect(resolveRoute([], '1')).toBeUndefined();
  });
});

describe('parseEtaMinutes', () => {
  it('표시 문자열에서 분 정수 추출', () => {
    expect(parseEtaMinutes('24분')).toBe(24);
    expect(parseEtaMinutes('18분')).toBe(18);
  });

  it('숫자 없으면 fallback', () => {
    expect(parseEtaMinutes('곧 도착', 5)).toBe(5);
    expect(parseEtaMinutes('')).toBe(0);
  });
});
