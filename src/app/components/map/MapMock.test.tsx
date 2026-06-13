import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MapMock } from './MapMock';

// 페이지/컴포넌트 단위테스트 커버리지가 0이던 차에 가장 의존성이 적은 표현 컴포넌트(MapMock —
// provider/router/store 무의존)에 대한 렌더 스모크. jsdom 미설치(vitest 기본 node 환경)이므로
// react-dom/server 의 renderToStaticMarkup 으로 마크업을 만들어 "그냥 렌더된다"만 확인한다.
describe('MapMock', () => {
  it('기본 props 로 비어있지 않은 마크업(test id 포함)을 렌더한다', () => {
    const html = renderToStaticMarkup(<MapMock />);
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain('map-mock');
  });

  it('pois·showRoute 를 주면 POI 아이콘(svg)·경로를 렌더한다', () => {
    const html = renderToStaticMarkup(
      <MapMock pois={[{ type: 'cctv', x: 10, y: 20 }]} showRoute active />,
    );
    expect(html).toContain('map-mock');
    // lucide 아이콘과 경로 SVG 가 마크업에 포함된다.
    expect(html).toContain('<svg');
  });
});
