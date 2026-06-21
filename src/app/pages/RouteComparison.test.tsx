import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { AppProvider } from '../store/appStore';
import {
  fallbackComparisonPois,
  getRouteComparisonPreviewType,
  getVisibleRouteComparisonPois,
  RouteComparison,
} from './RouteComparison';
import type { FacilitiesResponse } from '../utils/routeFacilities';

describe('RouteComparison (smoke)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('목적지 미선택 시 가드 화면을 크래시 없이 렌더한다', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/search']}>
        <AppProvider>
          <RouteComparison />
        </AppProvider>
      </MemoryRouter>,
    );

    expect(html).toContain('선택된 목적지가 없어요');
  });

  it('목적지가 있어도 origin 확인 전에는 경로 옵션 대신 현재 위치 CTA를 렌더한다', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() =>
        JSON.stringify({
          destination: {
            name: '강남역 2번 출구',
            address: '서울 강남구 강남대로',
            lat: 37.4979,
            lng: 127.0276,
          },
          recentDestinations: [],
          savedPlaces: {},
          contacts: [],
        }),
      ),
      setItem: vi.fn(),
    });

    const html = renderToString(
      <MemoryRouter initialEntries={['/search']}>
        <AppProvider>
          <RouteComparison />
        </AppProvider>
      </MemoryRouter>,
    );

    expect(html).toContain('현재 위치 확인이 필요해요');
    expect(html).toContain('현재 위치 확인');
    expect(html).not.toContain('data-testid="route-option"');
  });
});

describe('getVisibleRouteComparisonPois', () => {
  it('origin 확인 전에는 목적지 POI만 노출한다', () => {
    expect(getVisibleRouteComparisonPois(false, null)).toEqual([{ type: 'end', x: 80, y: 20 }]);
  });

  it('facilities API POI가 있으면 비교 지도 preview에 API POI를 넘긴다', () => {
    const facilities: FacilitiesResponse = {
      pois: [
        { type: 'start', x: 10, y: 90, lat: 37.1, lng: 127.1 },
        { type: 'store', x: 58, y: 48, lat: 37.2, lng: 127.2, name: '24시 편의점' },
        { type: 'end', x: 88, y: 12, lat: 37.3, lng: 127.3 },
      ],
      summary: { cctv: 0, bell: 0, store: 1, police: 0, total: 1 },
    };

    expect(getVisibleRouteComparisonPois(true, facilities)).toEqual(facilities.pois);
  });

  it('facilities API POI가 비어 있으면 기존 preview POI를 유지한다', () => {
    const facilities: FacilitiesResponse = {
      pois: [],
      summary: { cctv: 0, bell: 0, store: 0, police: 0, total: 0 },
    };

    expect(getVisibleRouteComparisonPois(true, facilities)).toEqual(fallbackComparisonPois);
  });
});

describe('getRouteComparisonPreviewType', () => {
  it('사용자가 포커스한 경로 type을 비교 지도 preview 기준으로 사용한다', () => {
    expect(getRouteComparisonPreviewType([{ type: 'safe' }, { type: 'main' }, { type: 'fast' }], 'main')).toBe('main');
  });

  it('선택된 type이 현재 경로 목록에 없으면 첫 경로 type으로 폴백한다', () => {
    expect(getRouteComparisonPreviewType([{ type: 'main' }, { type: 'fast' }], 'safe')).toBe('main');
  });

  it('경로 목록이 비어 있으면 safe preview를 기본값으로 사용한다', () => {
    expect(getRouteComparisonPreviewType([], 'fast')).toBe('safe');
  });
});
