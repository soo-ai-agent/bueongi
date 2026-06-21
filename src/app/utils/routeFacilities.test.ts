import { describe, expect, it, vi } from 'vitest';
import type { Destination } from '../store/appStore';
import { getApiErrorUserMessage } from './apiError';
import {
  buildRouteFacilitiesRequest,
  fetchRouteFacilities,
  ROUTE_FACILITIES_ENDPOINT,
} from './routeFacilities';

const destination: Destination = {
  name: '홍대입구역',
  address: '서울 마포구 양화로',
  lat: 37.5572,
  lng: 126.9245,
};

const origin = { lat: 37.4979, lng: 127.0276 };

describe('buildRouteFacilitiesRequest', () => {
  it('compare와 같은 RouteRequest에 routeType을 추가한다', () => {
    expect(buildRouteFacilitiesRequest(destination, origin, 'safe')).toEqual({
      origin,
      destination: { lat: 37.5572, lng: 126.9245, name: '홍대입구역' },
      routeType: 'safe',
    });
  });

  it('routeType이 없으면 백엔드 기본 safe 정책에 맡기도록 생략한다', () => {
    expect(buildRouteFacilitiesRequest(destination, origin, null)).toEqual({
      origin,
      destination: { lat: 37.5572, lng: 126.9245, name: '홍대입구역' },
    });
  });

  it('명시 origin 없이는 시설 요청도 만들지 않는다', () => {
    expect(() => buildRouteFacilitiesRequest(destination, null, 'safe')).toThrow(
      'Route compare requires valid origin coordinates',
    );
  });

  it('알 수 없는 routeType은 백엔드 호출 전에 차단한다', () => {
    expect(() => buildRouteFacilitiesRequest(destination, origin, 'unknown' as 'safe')).toThrow(
      'Route facilities requires a valid route type',
    );
  });
});

describe('fetchRouteFacilities', () => {
  it('POST /api/routes/facilities 요청 body를 백엔드 계약으로 직렬화한다', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          pois: [
            { type: 'start', x: 12, y: 84, lat: 37.4979, lng: 127.0276 },
            { type: 'cctv', x: 35, y: 70, lat: 37.52, lng: 126.99, name: 'CCTV' },
            { type: 'store', x: 65, y: 40, lat: 37.54, lng: 126.95 },
            { type: 'end', x: 88, y: 16, lat: 37.5572, lng: 126.9245 },
          ],
          summary: { cctv: 1, bell: 0, store: 1, police: 0, total: 2 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(fetchRouteFacilities(destination, origin, 'safe', { fetchImpl })).resolves.toEqual({
      pois: [
        { type: 'start', x: 12, y: 84, lat: 37.4979, lng: 127.0276 },
        { type: 'cctv', x: 35, y: 70, lat: 37.52, lng: 126.99, name: 'CCTV' },
        { type: 'store', x: 65, y: 40, lat: 37.54, lng: 126.95 },
        { type: 'end', x: 88, y: 16, lat: 37.5572, lng: 126.9245 },
      ],
      summary: { cctv: 1, bell: 0, store: 1, police: 0, total: 2 },
    });

    expect(fetchImpl).toHaveBeenCalledWith(ROUTE_FACILITIES_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        origin,
        destination: { lat: 37.5572, lng: 126.9245, name: '홍대입구역' },
        routeType: 'safe',
      }),
      signal: undefined,
    });
  });

  it('비정상 POI는 지도에 넘기지 않고 유효 POI만 반환한다', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          pois: [
            { type: 'cctv', x: 40, y: 60, lat: 37.52, lng: 126.99 },
            { type: 'unknown', x: 50, y: 50, lat: 37.52, lng: 126.99 },
            { type: 'bell', x: 101, y: 50, lat: 37.52, lng: 126.99 },
          ],
          summary: { cctv: 1, bell: 1, store: 0, police: 0, total: 2 },
        }),
        { status: 200 },
      ),
    );

    await expect(fetchRouteFacilities(destination, origin, 'main', { fetchImpl })).resolves.toEqual({
      pois: [{ type: 'cctv', x: 40, y: 60, lat: 37.52, lng: 126.99 }],
      summary: { cctv: 1, bell: 1, store: 0, police: 0, total: 2 },
    });
  });

  it('서버 오류는 호출부가 mock 시설을 유지할 수 있도록 reject 한다', async () => {
    const fetchImpl = vi.fn(async () => new Response('fail', { status: 500 }));
    await expect(fetchRouteFacilities(destination, origin, 'safe', { fetchImpl })).rejects.toThrow(
      'Route facilities failed: 500',
    );
  });

  it('검증 실패 응답은 사용자 안내로 매핑할 수 있는 ApiError로 reject 한다', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          title: 'Validation failed',
          errors: [{ field: 'destination.lng', code: 'VALIDATION_FAILED' }],
        }),
        { status: 400 },
      ),
    );

    const error = await fetchRouteFacilities(destination, origin, 'safe', { fetchImpl }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      name: 'ApiError',
      status: 400,
      code: 'VALIDATION_FAILED',
    });
    expect(getApiErrorUserMessage(error, '시설 정보를 불러오지 못해 기본 시설로 표시합니다.')).toBe(
      '위치 정보가 올바르지 않아요. 목적지를 다시 선택해 주세요.',
    );
  });

  it('summary 없는 응답은 계약 오류로 reject 한다', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ pois: [] }), { status: 200 }));
    await expect(fetchRouteFacilities(destination, origin, 'fast', { fetchImpl })).rejects.toThrow(
      'Route facilities response must include pois and summary',
    );
  });

  it('pois가 배열이 아닌 응답은 계약 오류로 reject 한다', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          pois: { type: 'cctv', x: 40, y: 60, lat: 37.52, lng: 126.99 },
          summary: { cctv: 1, bell: 0, store: 0, police: 0, total: 1 },
        }),
        { status: 200 },
      ),
    );

    await expect(fetchRouteFacilities(destination, origin, 'safe', { fetchImpl })).rejects.toThrow(
      'Route facilities response must include pois and summary',
    );
  });

  it('summary 집계값이 음수나 정수가 아니면 계약 오류로 reject 한다', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          pois: [{ type: 'cctv', x: 40, y: 60, lat: 37.52, lng: 126.99 }],
          summary: { cctv: 1, bell: -1, store: 0.5, police: '0', total: 1 },
        }),
        { status: 200 },
      ),
    );

    await expect(fetchRouteFacilities(destination, origin, 'safe', { fetchImpl })).rejects.toThrow(
      'Route facilities response must include pois and summary',
    );
  });
});
