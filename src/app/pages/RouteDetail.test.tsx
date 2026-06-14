import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { AppProvider } from '../store/appStore';
import { RouteDetail } from './RouteDetail';

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
