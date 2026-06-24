import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Destination } from '../store/appStore';
import { isDirectRouteEnabled, loadComparisonRouteResult, loadComparisonRoutes } from './routeSource';

const destination: Destination = { name: '강남역', address: '서울', lat: 37.4979, lng: 127.0276 };
const origin = { lat: 37.5, lng: 127.0 };

function tmapGeojson() {
  return {
    features: [
      { geometry: { type: 'Point', coordinates: [127.0, 37.5] }, properties: { totalDistance: 1100, totalTime: 900 } },
      { geometry: { type: 'LineString', coordinates: [[127.0, 37.5], [127.0276, 37.4979]] } },
    ],
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('isDirectRouteEnabled', () => {
  it('Tmap 키가 없으면 false(백엔드 폴백)', () => {
    vi.stubGlobal('process', { env: {} });
    expect(isDirectRouteEnabled()).toBe(false);
  });

  it('Tmap 키가 있으면 true(직접 호출)', () => {
    vi.stubGlobal('process', { env: { VITE_TMAP_APP_KEY: 'k' } });
    expect(isDirectRouteEnabled()).toBe(true);
  });
});

describe('loadComparisonRoutes', () => {
  it('키 없으면 백엔드 /api/routes/compare로 폴백한다', async () => {
    vi.stubGlobal('process', { env: {} });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain('/api/routes/compare');
      return new Response(JSON.stringify([{ id: 'b', name: '기본', time: '20분', dist: '1km', desc: 'd', tags: [], type: 'safe' }]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const routes = await loadComparisonRoutes(destination, origin);
    expect(routes[0].id).toBe('b');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('키 있으면 Tmap을 직접 호출하고 안전 점수 RouteOption을 만든다', async () => {
    vi.stubGlobal('process', { env: { VITE_TMAP_APP_KEY: 'k' } }); // CDN 미설정 → Tmap 단독 점수
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain('apis.openapi.sk.com/tmap');
      return new Response(JSON.stringify(tmapGeojson()), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const routes = await loadComparisonRoutes(destination, origin);
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.every((r) => ['safe', 'main', 'fast'].includes(r.type))).toBe(true);
    // 백엔드(/api/...)가 아니라 Tmap을 호출했는지 확인.
    expect(fetchMock.mock.calls.every((c) => String(c[0]).includes('tmap'))).toBe(true);
  });

  it('Tmap 직접 호출이 실패하면 reject(백엔드 프록시로 우회하지 않음)', async () => {
    vi.stubGlobal('process', { env: { VITE_TMAP_APP_KEY: 'k' } });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response('err', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadComparisonRoutes(destination, origin)).rejects.toBeTruthy();
    // 백엔드(/api/routes/compare)를 호출하지 않았는지 검증.
    expect(fetchMock.mock.calls.every((c) => !String(c[0]).includes('/api/routes/compare'))).toBe(true);
  });

  it('Tmap은 성공했지만 CDN 시설 로딩이 실패해도 Tmap 단독 추천을 반환한다', async () => {
    vi.stubGlobal('process', {
      env: {
        VITE_TMAP_APP_KEY: 'k',
        VITE_CDN_BASE_URL: 'https://cdn.test/bueongi',
      },
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('apis.openapi.sk.com/tmap')) {
        return new Response(JSON.stringify(tmapGeojson()), { status: 200 });
      }
      return new Response('cdn down', { status: 503 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const routes = await loadComparisonRoutes(destination, origin, {
      resolveRegion: async () => ({ sigunguCode: '11680', isSeoul: true }),
    });

    expect(routes.length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/manifest.json'))).toBe(true);
    expect(fetchMock.mock.calls.every((c) => !String(c[0]).includes('/api/routes/compare'))).toBe(true);
  });
});

describe('loadComparisonRouteResult', () => {
  it('백엔드 폴백 경로에서는 markersByType가 비어 있다(레거시 facilities로 폴백)', async () => {
    vi.stubGlobal('process', { env: {} });
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify([{ id: 'b', name: '기본', time: '20분', dist: '1km', desc: 'd', tags: [], type: 'safe' }]), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadComparisonRouteResult(destination, origin);
    expect(result.routes[0].id).toBe('b');
    expect(result.markersByType).toEqual({});
  });

  it('직접 호출 경로는 유형별 거점 마커(start/end 포함, lat/lng+x/y)를 만든다', async () => {
    vi.stubGlobal('process', { env: { VITE_TMAP_APP_KEY: 'k' } });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(tmapGeojson()), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadComparisonRouteResult(destination, origin);
    const types = Object.keys(result.markersByType);
    expect(types.length).toBeGreaterThan(0);
    const markers = result.markersByType[types[0] as 'safe' | 'main' | 'fast'] ?? [];
    expect(markers.some((m) => m.type === 'start')).toBe(true);
    expect(markers.some((m) => m.type === 'end')).toBe(true);
    expect(markers.every((m) => typeof m.lat === 'number' && typeof m.x === 'number')).toBe(true);
  });
});
