import { describe, it, expect } from 'vitest';
import {
  resolveRoute,
  resolveRouteWithApiOptions,
  parseEtaMinutes,
  normalizeRouteType,
  getRouteDestinationContext,
  hasValidRouteCoordinates,
} from './routeSelection';
import type { MockRoute } from '../pages/RouteComparison';
import type { Destination } from '../store/appStore';
import type { RouteOption } from './routeCompare';

const routes: MockRoute[] = [
  { id: '1', name: '추천 경로', time: '24분', dist: '1.2km', desc: '', tags: [], type: 'safe' },
  { id: '2', name: '큰길 위주', time: '28분', dist: '1.4km', desc: '', tags: [], type: 'main' },
  { id: '3', name: '빠른 경로', time: '18분', dist: '1.0km', desc: '', tags: [], type: 'fast' },
];

const apiRoutes: RouteOption[] = [
  {
    id: 'safe-api',
    name: '실시간 안심 경로',
    time: '22분',
    dist: '1.1km',
    desc: '백엔드가 반환한 경로입니다.',
    tags: [{ text: '실시간', variant: 'mint' }],
    type: 'safe',
  },
  {
    id: 'main-api',
    name: '실시간 큰길',
    time: '27분',
    dist: '1.5km',
    desc: '백엔드가 반환한 큰길 경로입니다.',
    tags: [{ text: '큰길', variant: 'blue' }],
    type: 'main',
  },
];

describe('resolveRoute', () => {
  it('id로 정확히 매칭', () => {
    expect(resolveRoute(routes, '3')?.name).toBe('빠른 경로');
  });

  it('API 경로 type id로도 매칭', () => {
    expect(resolveRoute(routes, 'main')?.name).toBe('큰길 위주');
    expect(resolveRoute(routes, 'fast')?.name).toBe('빠른 경로');
  });

  it('compare API RouteOption 목록도 상세 화면용으로 해석한다', () => {
    expect(resolveRoute(apiRoutes, 'main')?.name).toBe('실시간 큰길');
    expect(resolveRoute(apiRoutes, 'safe-api')?.name).toBe('실시간 안심 경로');
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

describe('resolveRouteWithApiOptions', () => {
  it('세션 API 경로 후보가 있으면 mockRoutes보다 API 경로를 우선 해석한다', () => {
    expect(resolveRouteWithApiOptions(apiRoutes, routes, 'main-api')?.name).toBe('실시간 큰길');
    expect(resolveRouteWithApiOptions(apiRoutes, routes, 'safe')?.name).toBe('실시간 안심 경로');
  });

  it('API 경로 후보가 없으면 mockRoutes로 폴백한다', () => {
    expect(resolveRouteWithApiOptions([], routes, 'fast')?.name).toBe('빠른 경로');
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

describe('normalizeRouteType', () => {
  it('지원하는 route type은 그대로 유지한다', () => {
    expect(normalizeRouteType('safe')).toBe('safe');
    expect(normalizeRouteType('main')).toBe('main');
    expect(normalizeRouteType('fast')).toBe('fast');
  });

  it('알 수 없는 route type은 safe로 폴백한다', () => {
    expect(normalizeRouteType('night')).toBe('safe');
    expect(normalizeRouteType(undefined)).toBe('safe');
  });

  it('호출부가 명시한 fallback type을 사용할 수 있다', () => {
    expect(normalizeRouteType('unknown', 'main')).toBe('main');
  });
});

describe('getRouteDestinationContext', () => {
  it('목적지가 있으면 hasDestination=true + 실제 이름 표시', () => {
    const ctx = getRouteDestinationContext({
      name: '강남역 2번 출구',
      address: '서울 강남구',
      lat: 37.4979,
      lng: 127.0276,
    });
    expect(ctx.hasDestination).toBe(true);
    expect(ctx.hasRouteCoordinates).toBe(true);
    expect(ctx.canRequestRoute).toBe(true);
    expect(ctx.destinationName).toBe('강남역 2번 출구');
  });

  it('목적지가 null이면 hasDestination=false + 폴백명(가드 신호)', () => {
    const ctx = getRouteDestinationContext(null);
    expect(ctx.hasDestination).toBe(false);
    expect(ctx.hasRouteCoordinates).toBe(false);
    expect(ctx.canRequestRoute).toBe(false);
    expect(ctx.destinationName).toBe('목적지');
  });

  it('undefined(직접 진입·state 소실)도 가드 신호', () => {
    const ctx = getRouteDestinationContext(undefined);
    expect(ctx.hasDestination).toBe(false);
    expect(ctx.hasRouteCoordinates).toBe(false);
    expect(ctx.canRequestRoute).toBe(false);
    expect(ctx.destinationName).toBe('목적지');
  });

  it('이름이 공백뿐이면 존재해도 표시명은 폴백(깨진 라벨 방지)', () => {
    const ctx = getRouteDestinationContext({
      name: '   ',
      address: '서울 어딘가',
      lat: 37.4979,
      lng: 127.0276,
    });
    expect(ctx.hasDestination).toBe(true);
    expect(ctx.canRequestRoute).toBe(true);
    expect(ctx.destinationName).toBe('목적지');
  });

  it('표시명 앞뒤 공백은 제거해 경로 화면 라벨을 안정화한다', () => {
    const ctx = getRouteDestinationContext({
      name: '  홍대입구역  ',
      address: '서울 마포구',
      lat: 37.5572,
      lng: 126.9245,
    });
    expect(ctx.destinationName).toBe('홍대입구역');
  });

  it('좌표 누락 목적지는 선택됐어도 경로 요청 불가(구버전 localStorage 방어)', () => {
    const ctx = getRouteDestinationContext({
      name: '예전 저장 목적지',
      address: '서울 어딘가',
    } as Destination);
    expect(ctx.hasDestination).toBe(true);
    expect(ctx.hasRouteCoordinates).toBe(false);
    expect(ctx.canRequestRoute).toBe(false);
  });

  it('위경도 범위 초과 목적지는 백엔드 400 전에 차단', () => {
    const ctx = getRouteDestinationContext({
      name: '범위 밖 목적지',
      address: '잘못된 좌표',
      lat: 91,
      lng: 181,
    });
    expect(ctx.hasDestination).toBe(true);
    expect(ctx.hasRouteCoordinates).toBe(false);
    expect(ctx.canRequestRoute).toBe(false);
  });
});

describe('hasValidRouteCoordinates', () => {
  it('lat -90~90, lng -180~180 경계값은 허용', () => {
    expect(hasValidRouteCoordinates({ name: 'A', address: 'B', lat: -90, lng: -180 })).toBe(true);
    expect(hasValidRouteCoordinates({ name: 'A', address: 'B', lat: 90, lng: 180 })).toBe(true);
  });

  it('NaN/Infinity/범위 밖 값은 거부', () => {
    expect(hasValidRouteCoordinates({ name: 'A', address: 'B', lat: NaN, lng: 127 })).toBe(false);
    expect(hasValidRouteCoordinates({ name: 'A', address: 'B', lat: 37, lng: Infinity })).toBe(false);
    expect(hasValidRouteCoordinates({ name: 'A', address: 'B', lat: -90.1, lng: 127 })).toBe(false);
    expect(hasValidRouteCoordinates({ name: 'A', address: 'B', lat: 37, lng: 180.1 })).toBe(false);
  });
});
