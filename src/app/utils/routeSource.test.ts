import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Destination } from '../store/appStore';
import { loadComparisonRouteResult, loadComparisonRoutes } from './routeSource';

const destination: Destination = { name: '강남역', address: '서울', lat: 37.4979, lng: 127.0276 };
const origin = { lat: 37.5, lng: 127.0 };

function safeCompareResponse() {
  return [
    {
      id: 'safe-0',
      name: '안심 경로',
      time: '24분',
      dist: '1.2km',
      desc: '안전 점수 88점',
      type: 'safe',
      tags: [{ text: '안심', variant: 'mint' }],
      path: [
        { lat: 37.5, lng: 127.0 },
        { lat: 37.4979, lng: 127.0276 },
      ],
      steps: [
        { index: 0, lat: 37.5, lng: 127.0, description: '출발', turnType: 211, distanceM: 100, timeS: 60, pointType: 'SP' },
      ],
      score: 88,
      markers: [
        { type: 'start', x: 12, y: 88, lat: 37.5, lng: 127.0 },
        { type: 'cctv', x: 40, y: 50, lat: 37.499, lng: 127.01 },
        { type: 'end', x: 88, y: 12, lat: 37.4979, lng: 127.0276 },
      ],
    },
    {
      id: 'fast-1',
      name: '빠른 경로',
      time: '18분',
      dist: '1.0km',
      desc: '안전 점수 60점',
      type: 'fast',
      tags: [{ text: '빠른길', variant: 'blue' }],
      score: 60,
      markers: [
        { type: 'start', x: 10, y: 90, lat: 37.5, lng: 127.0 },
        { type: 'end', x: 90, y: 10, lat: 37.4979, lng: 127.0276 },
      ],
    },
  ];
}

afterEach(() => vi.unstubAllGlobals());

describe('loadComparisonRoutes', () => {
  it('백엔드 /api/routes/safe-compare를 호출하고 점수/경로를 포함해 반환한다', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain('/api/routes/safe-compare');
      return new Response(JSON.stringify(safeCompareResponse()), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const routes = await loadComparisonRoutes(destination, origin);
    expect(routes).toHaveLength(2);
    expect(routes[0].id).toBe('safe-0');
    expect(routes[0].score).toBe(88);
    expect(routes[0].path).toHaveLength(2);
    expect(routes[0].steps?.[0].pointType).toBe('SP');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('안심 강도(safetyPreference)를 요청 body로 전달한다', async () => {
    let sentBody: unknown;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify(safeCompareResponse()), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await loadComparisonRoutes(destination, origin, { safetyPreference: 'safest' });
    expect(sentBody).toMatchObject({
      origin,
      destination: { lat: 37.4979, lng: 127.0276, name: '강남역' },
      safetyPreference: 'safest',
    });
  });

  it('백엔드 오류는 호출부가 mock 경로를 유지하도록 reject 한다', async () => {
    const fetchMock = vi.fn(async () => new Response('fail', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadComparisonRoutes(destination, origin)).rejects.toBeTruthy();
  });
});

describe('loadComparisonRouteResult', () => {
  it('백엔드 markers를 경로 유형별 markersByType로 매핑한다', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(safeCompareResponse()), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadComparisonRouteResult(destination, origin);
    expect(Object.keys(result.markersByType).sort()).toEqual(['fast', 'safe']);
    const safeMarkers = result.markersByType.safe ?? [];
    expect(safeMarkers.some((m) => m.type === 'start')).toBe(true);
    expect(safeMarkers.some((m) => m.type === 'cctv')).toBe(true);
    expect(safeMarkers.some((m) => m.type === 'end')).toBe(true);
  });

  it('markers가 없는 경로는 markersByType에 포함하지 않는다(레거시 facilities로 폴백)', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify([{ id: 'b', name: '기본', time: '20분', dist: '1km', desc: 'd', tags: [], type: 'safe' }]),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadComparisonRouteResult(destination, origin);
    expect(result.routes[0].id).toBe('b');
    expect(result.markersByType).toEqual({});
  });
});
