import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { AppProvider } from '../store/appStore';
import {
  fallbackDetailPois,
  fallbackFacilitySummary,
  getRouteDetailFacilitySummary,
  getSafehouseCount,
  getVisibleRouteDetailPois,
  RouteDetail,
} from './RouteDetail';
import type { FacilitiesResponse } from '../utils/routeFacilities';

// 렌더 스모크 테스트(BUE-CANARY-3)
// jsdom/testing-library 미설치 + vitest node 환경이므로 react-dom/server의
// renderToString으로 "크래시 없이 렌더되는가"만 검증한다. renderToString은
// useEffect를 실행하지 않으므로 provider는 useApp(AppProvider)·useNavigate/
// useParams(MemoryRouter)가 요구하는 컨텍스트만 최소로 감싼다.
// node 환경엔 localStorage가 없어 loadState가 초기상태(destination=null)로 폴백 →
// "선택된 목적지가 없어요" 가드 분기가 렌더된다(MapMock·window 의존 회피).
describe('RouteDetail (smoke)', () => {
  it('목적지 미선택 시 가드 화면을 크래시 없이 렌더한다', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/route/1']}>
        <AppProvider>
          <RouteDetail />
        </AppProvider>
      </MemoryRouter>
    );

    expect(html).toContain('no-destination-guard');
    expect(html).toContain('선택된 목적지가 없어요');
  });
});

describe('getVisibleRouteDetailPois', () => {
  it('origin 확인 전에는 목적지 POI만 노출한다', () => {
    expect(getVisibleRouteDetailPois(false, null)).toEqual([{ type: 'end', x: 80, y: 20 }]);
  });

  it('facilities API POI가 있으면 mock 대신 API POI를 지도에 넘긴다', () => {
    const facilities: FacilitiesResponse = {
      pois: [
        { type: 'start', x: 10, y: 90, lat: 37.1, lng: 127.1 },
        { type: 'cctv', x: 44, y: 58, lat: 37.2, lng: 127.2, name: '골목 CCTV' },
        { type: 'end', x: 88, y: 12, lat: 37.3, lng: 127.3 },
      ],
      summary: { cctv: 1, bell: 0, store: 0, police: 0, total: 1 },
    };

    expect(getVisibleRouteDetailPois(true, facilities)).toEqual(facilities.pois);
  });

  it('facilities API POI가 비어 있으면 기존 mock 시설을 유지한다', () => {
    const facilities: FacilitiesResponse = {
      pois: [],
      summary: { cctv: 0, bell: 0, store: 0, police: 0, total: 0 },
    };

    expect(getVisibleRouteDetailPois(true, facilities)).toEqual(fallbackDetailPois);
  });
});

describe('getRouteDetailFacilitySummary', () => {
  it('facilities API POI가 있으면 API summary를 표시한다', () => {
    const facilities: FacilitiesResponse = {
      pois: [{ type: 'bell', x: 50, y: 50, lat: 37.2, lng: 127.2 }],
      summary: { cctv: 0, bell: 1, store: 0, police: 0, total: 1 },
    };

    expect(getRouteDetailFacilitySummary(facilities)).toEqual(facilities.summary);
  });

  it('facilities API POI가 비어 있으면 mock summary를 유지한다', () => {
    const facilities: FacilitiesResponse = {
      pois: [],
      summary: { cctv: 0, bell: 0, store: 0, police: 0, total: 0 },
    };

    expect(getRouteDetailFacilitySummary(facilities)).toEqual(fallbackFacilitySummary);
  });
});

describe('getSafehouseCount', () => {
  it('summary.safehouse가 있으면 그 값을 쓴다', () => {
    const facilities: FacilitiesResponse = {
      pois: [{ type: 'safehouse', x: 55, y: 50, lat: 37.2, lng: 127.2 }],
      summary: { cctv: 0, bell: 0, store: 0, police: 0, safehouse: 2, total: 1 },
    };

    expect(getSafehouseCount(facilities, getVisibleRouteDetailPois(true, facilities))).toBe(2);
  });

  it('summary에 safehouse가 없는 구버전 응답은 표시 중인 POI에서 직접 센다', () => {
    const facilities: FacilitiesResponse = {
      pois: [
        { type: 'safehouse', x: 55, y: 50, lat: 37.2, lng: 127.2 },
        { type: 'safehouse', x: 60, y: 45, lat: 37.21, lng: 127.21 },
        { type: 'cctv', x: 35, y: 70, lat: 37.22, lng: 127.22 },
      ],
      summary: { cctv: 1, bell: 0, store: 0, police: 0, total: 3 },
    };

    expect(getSafehouseCount(facilities, getVisibleRouteDetailPois(true, facilities))).toBe(2);
  });

  it('facilities가 없으면 fallback POI의 안심집 수를 센다', () => {
    const pois = getVisibleRouteDetailPois(true, null);
    expect(getSafehouseCount(null, pois)).toBe(
      fallbackDetailPois.filter((poi) => poi.type === 'safehouse').length,
    );
  });
});
