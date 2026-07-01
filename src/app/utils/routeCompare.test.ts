import { describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  getApiErrorUserMessage,
} from './apiError';
import {
  buildRouteCompareRequest,
  fetchRouteOptions,
  hasValidLatLng,
  ROUTE_COMPARE_ENDPOINT,
} from './routeCompare';
import type { Destination } from '../store/appStore';

const destination: Destination = {
  name: '홍대입구역',
  address: '서울 마포구 양화로',
  lat: 37.5572,
  lng: 126.9245,
};

const origin = { lat: 37.4979, lng: 127.0276 };

describe('hasValidLatLng', () => {
  it('RouteRequest 좌표 범위와 같은 lat/lng만 허용한다', () => {
    expect(hasValidLatLng({ lat: -90, lng: -180 })).toBe(true);
    expect(hasValidLatLng({ lat: 90, lng: 180 })).toBe(true);
    expect(hasValidLatLng({ lat: 90.1, lng: 127 })).toBe(false);
    expect(hasValidLatLng({ lat: 37, lng: 180.1 })).toBe(false);
    expect(hasValidLatLng({ lat: NaN, lng: 127 })).toBe(false);
    expect(hasValidLatLng({ lat: 37, lng: Infinity })).toBe(false);
  });
});

describe('buildRouteCompareRequest', () => {
  it('선택 목적지 좌표와 이름을 RouteRequest destination으로 보낸다', () => {
    expect(buildRouteCompareRequest(destination, origin)).toEqual({
      origin,
      destination: { lat: 37.5572, lng: 126.9245, name: '홍대입구역' },
    });
  });

  it('목적지 이름이 공백이면 name을 생략한다', () => {
    expect(buildRouteCompareRequest({ ...destination, name: '   ' }, origin)).toEqual({
      origin,
      destination: { lat: 37.5572, lng: 126.9245 },
    });
  });

  it('origin은 추가 필드 없이 lat/lng만 직렬화한다', () => {
    expect(buildRouteCompareRequest(destination, { ...origin, accuracy: 15 } as typeof origin)).toEqual({
      origin,
      destination: { lat: 37.5572, lng: 126.9245, name: '홍대입구역' },
    });
  });

  it('origin 정책 확정 전에는 명시 origin 없이는 요청을 만들지 않는다', () => {
    expect(() => buildRouteCompareRequest(destination, null)).toThrow(
      'Route compare requires valid origin coordinates',
    );
  });

  it('좌표 없는 구버전 목적지는 백엔드 호출 전에 차단한다', () => {
    expect(() => buildRouteCompareRequest({ name: '옛 목적지', address: '서울' } as Destination, origin)).toThrow(
      'Route compare requires valid destination coordinates',
    );
  });
});

describe('fetchRouteOptions', () => {
  it('POST /api/routes/compare 요청 body를 백엔드 계약으로 직렬화한다', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            id: 'safe',
            name: '추천 경로',
            time: '24분',
            dist: '1.2km',
            desc: '밝은 길 위주',
            tags: [{ text: 'CCTV 많음', variant: 'mint' }],
            type: 'safe',
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(fetchRouteOptions(destination, origin, { fetchImpl })).resolves.toEqual([
      {
        id: 'safe',
        name: '추천 경로',
        time: '24분',
        dist: '1.2km',
        desc: '밝은 길 위주',
        tags: [{ text: 'CCTV 많음', variant: 'mint' }],
        type: 'safe',
      },
    ]);

    expect(fetchImpl).toHaveBeenCalledWith(ROUTE_COMPARE_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        origin,
        destination: { lat: 37.5572, lng: 126.9245, name: '홍대입구역' },
      }),
      signal: undefined,
    });
  });

  it('서버 오류는 호출부가 mock 경로를 유지할 수 있도록 reject 한다', async () => {
    const fetchImpl = vi.fn(async () => new Response('fail', { status: 500 }));
    await expect(fetchRouteOptions(destination, origin, { fetchImpl })).rejects.toThrow('Route compare failed: 500');
  });

  it('비정상 경로와 태그는 비교 목록에 넘기지 않고 유효 항목만 반환한다', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            id: 'safe',
            name: '추천 경로',
            time: '24분',
            dist: '1.2km',
            desc: '밝은 길 위주',
            tags: [
              { text: 'CCTV 많음', variant: 'mint' },
              { text: '잘못된 태그', variant: 'invalid' },
              { variant: 'blue' },
            ],
            type: 'safe',
          },
          {
            id: 'mystery',
            name: '알 수 없는 경로',
            time: '20분',
            dist: '1.0km',
            desc: '계약 밖 route type',
            tags: [],
            type: 'unknown',
          },
        ]),
        { status: 200 },
      ),
    );

    await expect(fetchRouteOptions(destination, origin, { fetchImpl })).resolves.toEqual([
      {
        id: 'safe',
        name: '추천 경로',
        time: '24분',
        dist: '1.2km',
        desc: '밝은 길 위주',
        tags: [{ text: 'CCTV 많음', variant: 'mint' }],
        type: 'safe',
      },
    ]);
  });

  it('표준 오류 응답은 ApiError로 reject 하며 화면 안내로 매핑할 수 있다', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ code: 'ORIGIN_REQUIRED', detail: 'origin is required' }), { status: 422 }),
    );

    await expect(fetchRouteOptions(destination, origin, { fetchImpl })).rejects.toMatchObject({
      name: 'ApiError',
      status: 422,
      code: 'ORIGIN_REQUIRED',
      userMessage: '현재 위치를 확인한 뒤 다시 시도해 주세요.',
    });

    const error = await fetchRouteOptions(destination, origin, { fetchImpl }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(getApiErrorUserMessage(error, '실시간 경로를 불러오지 못해 기본 경로로 안내합니다.')).toBe(
      '현재 위치를 확인한 뒤 다시 시도해 주세요.',
    );
  });

  it('비배열 응답은 계약 오류로 reject 한다', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'safe' }), { status: 200 }));
    await expect(fetchRouteOptions(destination, origin, { fetchImpl })).rejects.toThrow(
      'Route compare response must be an array',
    );
  });
});

describe('toRouteOption breakdown/provenance 파싱 (P0)', () => {
  const baseRoute = {
    id: 'tmap-0-0',
    name: '안심 경로',
    time: '24분',
    dist: '1.2km',
    desc: '안전 점수 88점',
    tags: [],
    type: 'safe',
    score: 88,
  };

  it('유효한 breakdown·provenance를 채운다', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            ...baseRoute,
            breakdown: {
              routeKm: 1.2, cctvDensity: 8.2, lampDensity: 12, bellDensity: 1.1,
              safehouseCount: 1, policeCount: 1, safePathOverlap: 0.6,
            },
            provenance: { kind: 'live', basedOn: '2026.06', origin: '공공데이터포털' },
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const [route] = await fetchRouteOptions(destination, origin, { fetchImpl });
    expect(route.breakdown).toEqual({
      routeKm: 1.2, cctvDensity: 8.2, lampDensity: 12, bellDensity: 1.1,
      safehouseCount: 1, policeCount: 1, safePathOverlap: 0.6,
    });
    expect(route.provenance).toEqual({ kind: 'live', basedOn: '2026.06', origin: '공공데이터포털' });
  });

  it('손상된 breakdown(비유한 수)·provenance(필수 누락)는 조용히 생략한다(경로 자체는 유지)', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            ...baseRoute,
            breakdown: { routeKm: 'bad', cctvDensity: 1, lampDensity: 1, bellDensity: 1, safehouseCount: 0, policeCount: 0, safePathOverlap: 0 },
            provenance: { basedOn: '2026.06' },
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const [route] = await fetchRouteOptions(destination, origin, { fetchImpl });
    expect(route.breakdown).toBeUndefined();
    expect(route.provenance).toBeUndefined();
    expect(route.score).toBe(88);
  });
});
