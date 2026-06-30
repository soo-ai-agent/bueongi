import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { RouteMap, poiMarkerHtml, livePositionMarkerHtml } from './RouteMap';

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

describe('poiMarkerHtml (실지도 마커 구분 아이콘)', () => {
  it('CCTV·비상벨·안심집·지구대 마커가 서로 다른 글리프로 그려진다', () => {
    const cctv = poiMarkerHtml('cctv');
    const bell = poiMarkerHtml('bell');
    const safehouse = poiMarkerHtml('safehouse');
    const police = poiMarkerHtml('police');

    // 넷 다 SVG 글리프를 가지며 마커 HTML이 모두 다르다(유형별 상징 구분).
    for (const html of [cctv, bell, safehouse, police]) expect(html).toContain('<svg');
    expect(new Set([cctv, bell, safehouse, police]).size).toBe(4);

    // 유형 태그로 어떤 거점인지 식별 가능.
    expect(cctv).toContain('data-poi="cctv"');
    expect(bell).toContain('data-poi="bell"');
    expect(safehouse).toContain('data-poi="safehouse"');
    expect(police).toContain('data-poi="police"');
  });

  it('안심집(B-2) 마커는 영업시간이 아닌 지정 상태임을 라벨로 안내한다', () => {
    expect(poiMarkerHtml('safehouse')).toContain('지정 상태');
  });

  it('출발/도착은 글리프 없는 점 마커로 둔다', () => {
    expect(poiMarkerHtml('start')).not.toContain('<svg');
    expect(poiMarkerHtml('end')).not.toContain('<svg');
  });
});

describe('livePositionMarkerHtml (실시간 위치 마커)', () => {
  it('사용자를 부엉이(🦉) + emerald 맥동 링으로 표시한다', () => {
    const html = livePositionMarkerHtml();
    expect(html).toContain('🦉');
    expect(html).toContain('animation:ping');
    // heading-up(지도 회전) 시에도 부엉이가 똑바로 보이도록 지도 회전을 상쇄한다.
    expect(html).toContain('var(--map-heading');
  });
});
