import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * deep-verify (실DOM·실API) — "있나"가 아니라 "맞나"를 검증한다.
 *
 * 형제 스펙(route-api.spec.ts / anshim-guigi-full-flow.spec.ts)은 의도적으로
 *   - `page.route('**\/api/routes/**')` 로 백엔드 응답을 ★mock 하고,
 *   - 카카오 키 없이 ★MapMock(`map-mock`)이 그려지는 것을 검증한다.
 * 이는 UI plumbing/흐름("있나")엔 옳지만, 실제 백엔드·실제 카카오 지도가
 * "맞게" 동작하는지("맞나")는 증명하지 못한다. 카카오맵 mock-pass(거짓 완료)의 뿌리다.
 *
 * 본 스펙은 정확히 그 갭을 메운다. 따라서:
 *   1) ★mock 금지 — `page.route` 가로채기 없이 실제 백엔드(:8119)를 친다.
 *   2) ★실API 맞나 — /api/routes/compare 의 실제 응답이 200 + 비어있지 않은 실데이터.
 *   3) ★실DOM 맞나 — MapMock(`map-mock`)이 ★없고(=폴백 안 탐), 실지도 컨테이너가
 *      실제 크기(boundingBox > 0) + 카카오가 주입한 자식 노드를 가진다.
 *   4) ★증거 — 스크린샷을 screenshots/ 에 남긴다.
 *
 * ★격리(방식2): 본 파일은 부엉이 frontend-src 안에만 존재하며, 기본은 skip 이라
 *   기존 QA 워커의 `test:e2e` 실행을 바꾸지 않는다(회귀 0). 전용 스크립트로만 켠다:
 *     npm run test:e2e:deep
 *   (= DEEP_VERIFY=1 E2E_USE_EXTERNAL_SERVER=1 playwright test deep-verify-real)
 *
 * ★전제(없으면 통과 아니라 "미검증"으로 skip — si-qa-test-engineer 증거원칙):
 *   - 실제 스택이 떠 있어야 한다(백엔드 :8119, 프론트 E2E_BASE_URL/:3619).
 *   - VITE_KAKAO_JS_KEY 가 프론트 빌드/dev 에 주입돼 있어야 실지도가 켜진다(미설정=MapMock 폴백).
 *   이 둘은 secret/운영 사안(사용자 몫)이며, 충족 전에는 "맞나"를 단언할 수 없으므로
 *   거짓 통과 대신 명시적으로 미검증 처리한다.
 */

const DEEP = process.env.DEEP_VERIFY === '1';
const STORAGE_KEY = 'bueongi-app-state-v1';

const destination = {
  name: '서울시청',
  address: '서울 중구 세종대로 110',
  lat: 37.5665,
  lng: 126.978,
};

const appState = {
  destination,
  recentDestinations: [destination],
  savedPlaces: {
    home: { name: null, address: null, lat: null, lng: null },
    school: { name: null, address: null, lat: null, lng: null },
    work: { name: null, address: null, lat: null, lng: null },
  },
  contacts: [],
};

async function seedSelectedDestination(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, JSON.stringify(value)),
    [STORAGE_KEY, appState] as const,
  );
}

async function allowCurrentLocation(page: Page): Promise<void> {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 37.501, longitude: 127.039 });
}

test.describe('deep-verify: 실DOM·실API "맞나" 검증 (mock 안 믿음)', () => {
  // 기본 skip — 전용 스크립트(DEEP_VERIFY=1)로만 켠다. 기존 QA 흐름 회귀 0.
  test.skip(!DEEP, 'deep-verify는 DEEP_VERIFY=1 일 때만 실행(실 스택+카카오 키 필요).');

  test.beforeEach(async ({ page }) => {
    await seedSelectedDestination(page);
    await allowCurrentLocation(page);
  });

  test('실 백엔드 /api/routes/compare 가 진짜 데이터를 반환한다(mock 가로채기 없음)', async ({ page }) => {
    // ★mock 금지: page.route 를 걸지 않는다 → 요청이 실제 백엔드까지 간다.
    // 실제 응답을 ★관찰만(가로채지 않음) 한다.
    const comparePromise = page
      .waitForResponse((res) => /\/api\/routes\/compare$/.test(res.url()), { timeout: 20_000 })
      .catch(() => null);

    await page.goto('/search');
    await page.getByRole('button', { name: '현재 위치 확인' }).click();

    const res = await comparePromise;
    expect(res, '/api/routes/compare 실호출이 관측되지 않음 — 실 백엔드 미연결(미검증)').not.toBeNull();
    expect(res!.status(), `백엔드 응답 비정상: ${res!.status()}`).toBe(200);

    const body = await res!.json();
    // 실데이터 "맞나": 배열이고 최소 1개의 경로가 실제로 돌아와야 한다.
    expect(Array.isArray(body), '응답이 배열이 아님 — 계약 불일치').toBe(true);
    expect(body.length, '경로가 0개 — 실 백엔드가 빈 결과(맞나 실패)').toBeGreaterThan(0);
    // 화면에도 그 실데이터가 그려져야 한다(plumbing "맞나").
    await expect(page.getByTestId('route-option').first()).toBeVisible();
  });

  test('실 카카오 지도가 켜진다(MapMock 폴백이 아님 + 실 컨테이너 크기 > 0)', async ({ page }) => {
    await page.goto('/route/safe');

    const routeMap = page.getByTestId('route-map');
    await expect(routeMap, '지도 래퍼(route-map)가 없음').toBeVisible();

    // 실지도 ready 까지 대기(키 있으면 SDK 로드 후 map-mock 제거됨).
    await expect(
      page.getByTestId('map-mock'),
      'MapMock 폴백이 떠 있음 — VITE_KAKAO_JS_KEY 미주입/SDK 로드 실패(맞나 미충족)',
    ).toHaveCount(0, { timeout: 15_000 });

    // 실지도 컨테이너(route-map 안, ready일 때 display:block 되는 div)가 실제 크기를 가져야 한다.
    const mapContainer = routeMap.locator('> div').first();
    const box = await mapContainer.boundingBox();
    expect(box, '실지도 컨테이너 boundingBox 없음').not.toBeNull();
    expect(box!.width, '실지도 폭 0 — 렌더 안 됨').toBeGreaterThan(0);
    expect(box!.height, '실지도 높이 0 — 렌더 안 됨').toBeGreaterThan(0);

    // 카카오 SDK 가 실제로 주입한 타일/노드가 있어야 한다(빈 div 가 아님).
    const childCount = await mapContainer.evaluate((el) => el.childElementCount);
    expect(childCount, '실지도 컨테이너가 비어 있음 — 카카오 SDK 미주입(맞나 실패)').toBeGreaterThan(0);

    await page.screenshot({ path: path.join('screenshots', 'deep-verify-real-map.png'), fullPage: true });
  });
});
