import { describe, expect, it, vi } from 'vitest';
import {
  buildTmapRequestBody,
  fetchTmapPedestrianRoute,
  fetchTmapPedestrianRoutes,
  parseTmapResponse,
  TMAP_PEDESTRIAN_ENDPOINT,
} from './tmap';

const origin = { lat: 37.4979, lng: 127.0276 };
const destination = { lat: 37.5572, lng: 126.9245, name: ' 홍대입구역 ' };

const tmapPayload = {
  features: [
    {
      geometry: { type: 'Point', coordinates: [127.0276, 37.4979] },
      properties: { totalDistance: 1234, totalTime: 789 },
    },
    {
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.0276, 37.4979],
          [127.01, 37.52],
          [126.9245, 37.5572],
          [999, 37.5],
        ],
      },
    },
  ],
};

describe('parseTmapResponse', () => {
  it('GeoJSON LineString 좌표와 총 거리/시간을 TmapRoute 원천 데이터로 변환한다', () => {
    expect(parseTmapResponse(tmapPayload)).toEqual({
      path: [
        { lat: 37.4979, lng: 127.0276 },
        { lat: 37.52, lng: 127.01 },
        { lat: 37.5572, lng: 126.9245 },
      ],
      distanceM: 1234,
      timeS: 789,
    });
  });

  it('거리 합계가 없거나 비정상 값이면 좌표열 길이로 보정하고 음수 시간은 버린다', () => {
    const parsed = parseTmapResponse({
      features: [
        {
          geometry: { type: 'Point', coordinates: [127.0276, 37.4979] },
          properties: { totalDistance: Number.NaN, totalTime: -10 },
        },
        {
          geometry: {
            type: 'LineString',
            coordinates: [
              [127.0276, 37.4979],
              [127.026, 37.4985],
            ],
          },
        },
      ],
    });

    expect(parsed.distanceM).toBeGreaterThan(0);
    expect(parsed.timeS).toBe(0);
  });

  it('features 배열이 없거나 유효한 경로 좌표가 부족하면 계약 오류로 reject 할 수 있게 throw 한다', () => {
    expect(() => parseTmapResponse({})).toThrow('Tmap 응답에 features 배열이 없습니다');
    expect(() =>
      parseTmapResponse({
        features: [{ geometry: { type: 'LineString', coordinates: [[127.0276, 37.4979]] } }],
      }),
    ).toThrow('Tmap 응답에서 경로 좌표를 찾지 못했습니다');
  });
});

describe('buildTmapRequestBody', () => {
  it('WGS84 좌표와 검색 옵션을 Tmap 보행자 API body로 직렬화한다', () => {
    expect(buildTmapRequestBody(origin, destination, '4')).toEqual({
      startX: '127.0276',
      startY: '37.4979',
      endX: '126.9245',
      endY: '37.5572',
      startName: encodeURIComponent('출발'),
      endName: encodeURIComponent('홍대입구역'),
      reqCoordType: 'WGS84GEO',
      resCoordType: 'WGS84GEO',
      searchOption: '4',
    });
  });
});

describe('fetchTmapPedestrianRoute', () => {
  it('AppKey는 헤더로만 보내고 body에는 포함하지 않는다', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(tmapPayload), { status: 200 }),
    );

    await expect(
      fetchTmapPedestrianRoute(origin, destination, {
        appKey: 'test-app-key',
        fetchImpl,
        searchOption: '10',
      }),
    ).resolves.toMatchObject({
      searchOption: '10',
      distanceM: 1234,
      timeS: 789,
    });

    expect(fetchImpl).toHaveBeenCalledWith(TMAP_PEDESTRIAN_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        appKey: 'test-app-key',
      },
      body: JSON.stringify(buildTmapRequestBody(origin, destination, '10')),
      signal: undefined,
    });
    expect(fetchImpl.mock.calls[0]?.[1]?.body).not.toContain('test-app-key');
  });

  it('AppKey나 유효 좌표가 없으면 외부 호출 전에 차단한다', async () => {
    const fetchImpl = vi.fn();

    await expect(fetchTmapPedestrianRoute(origin, destination, { appKey: '', fetchImpl })).rejects.toThrow(
      'Tmap AppKey가 설정되지 않았습니다',
    );
    await expect(
      fetchTmapPedestrianRoute({ lat: 91, lng: 127 }, destination, { appKey: 'test-app-key', fetchImpl }),
    ).rejects.toThrow('Tmap 경로 요청에 유효한 origin 좌표가 필요합니다');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('계약 밖 searchOption은 외부 호출 전에 차단한다', async () => {
    const fetchImpl = vi.fn();

    await expect(
      fetchTmapPedestrianRoute(origin, destination, {
        appKey: 'test-app-key',
        fetchImpl,
        searchOption: '99' as never,
      }),
    ).rejects.toThrow('유효한 searchOption');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('fetchTmapPedestrianRoutes', () => {
  it('후보 옵션 배열에 계약 밖 searchOption이 섞이면 외부 호출 전에 차단한다', async () => {
    const fetchImpl = vi.fn();

    await expect(
      fetchTmapPedestrianRoutes(origin, destination, ['0', '99' as never], {
        appKey: 'test-app-key',
        fetchImpl,
      }),
    ).rejects.toThrow('유효한 searchOption');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('옵션별 후보 중 실패와 중복을 제외하고 성공 후보만 반환한다', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(tmapPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(tmapPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response('fail', { status: 500 }));

    await expect(
      fetchTmapPedestrianRoutes(origin, destination, ['0', '4', '10'], {
        appKey: 'test-app-key',
        fetchImpl,
      }),
    ).resolves.toEqual([
      {
        searchOption: '0',
        path: [
          { lat: 37.4979, lng: 127.0276 },
          { lat: 37.52, lng: 127.01 },
          { lat: 37.5572, lng: 126.9245 },
        ],
        distanceM: 1234,
        timeS: 789,
      },
    ]);
  });
});
