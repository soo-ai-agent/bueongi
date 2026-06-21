import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { RouteMap } from './RouteMap';

// node/SSR 환경에서는 useEffect가 실행되지 않아 Kakao SDK 초기화가 일어나지 않는다 →
// RouteMap은 MapMock으로 폴백한다. 이는 키 미설정/로드 실패 시의 실제 런타임 폴백과 동일하며,
// 기존 E2E가 검증하는 map-mock 가시성을 유지한다.
describe('RouteMap (폴백)', () => {
  it('SDK 미초기화 시 route-map 컨테이너와 MapMock 폴백을 함께 렌더한다', () => {
    const html = renderToString(
      <RouteMap
        origin={{ lat: 37.5, lng: 127.0 }}
        destination={{ lat: 37.51, lng: 127.03 }}
        showRoute
        routeType="safe"
        pois={[{ type: 'cctv', x: 40, y: 60, lat: 37.505, lng: 127.01 }]}
      />,
    );

    expect(html).toContain('data-testid="route-map"');
    // 실지도가 켜지기 전에는 MapMock이 노출되어 화면이 비지 않는다.
    expect(html).toContain('data-testid="map-mock"');
  });

  it('좌표 없이도 크래시 없이 렌더된다', () => {
    const html = renderToString(<RouteMap pois={[{ type: 'end', x: 50, y: 50 }]} />);
    expect(html).toContain('data-testid="map-mock"');
  });
});
