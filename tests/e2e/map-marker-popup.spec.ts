import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * 지도 화면 + 시설 마커(CCTV/안심벨) 클릭 팝업 캡처 E2E.
 *
 * 이 캡처는 ★실 카카오 지도가 떠야만 의미가 있다 — 마커 클릭 정보 카드(poi-info-card)는
 * 실지도 ready 상태에서 DOM CustomOverlay 에 붙는 클릭 핸들러로만 동작한다(MapMock 폴백엔 없음).
 * 따라서 dapi.kakao.com 을 차단하지 않고, safe-compare 만 결정론적 마커로 mock 한다.
 *
 * 전제: VITE_KAKAO_JS_KEY 주입된 dev 서버가 떠 있어야 한다(미충족 시 map-mock 폴백 → skip 처리).
 * 기본 skip — 전용 플래그로만 실행(기존 test:e2e 게이트 회귀 0):
 *   MAP_POPUP_CAPTURE=1 E2E_USE_EXTERNAL_SERVER=1 npx playwright test map-marker-popup
 */

const CAPTURE = process.env.MAP_POPUP_CAPTURE === '1';
const SHOT_DIR = 'screenshots';
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

/** 회랑 내 시설 마커를 가진 결정론적 safe-compare 응답(실 백엔드/Tmap 불요). */
function mockRoute(type: 'safe' | 'main' | 'fast', score: number) {
  return {
    id: type,
    name: type === 'safe' ? '추천 경로' : type === 'main' ? '큰길 경로' : '빠른 경로',
    time: '24분',
    dist: '1.2km',
    desc: '실데이터 기반 안심 경로',
    type,
    tags: [{ text: '안심', variant: 'mint' as const }],
    score,
    path: [
      { lat: 37.5662, lng: 126.9785 },
      { lat: 37.5665, lng: 126.978 },
    ],
    // 시설 마커(cctv/bell)는 출발/도착보다 북쪽(높은 위도)에 둬 지도 상단(하단 컨트롤바 비간섭)에 렌더.
    markers: [
      { type: 'start', x: 10, y: 90, lat: 37.5662, lng: 126.9785 },
      {
        type: 'cctv',
        x: 45,
        y: 35,
        lat: 37.57,
        lng: 126.9782,
        name: '서울광장앞 생활방범 CCTV',
        purpose: '생활방범',
        cameraCount: 3,
      },
      { type: 'bell', x: 60, y: 30, lat: 37.5702, lng: 126.9789, name: '서울광장 안전비상벨' },
      { type: 'end', x: 90, y: 95, lat: 37.5665, lng: 126.978 },
    ],
  };
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: false });
}

test.describe('지도 화면 + 마커 팝업 캡처', () => {
  test.skip(!CAPTURE, '캡처 전용 — MAP_POPUP_CAPTURE=1 + 실 카카오 키 dev 서버에서만 실행.');

  test('지도 + CCTV/안심벨 마커 클릭 팝업을 각각 캡처', async ({ page, context }) => {
    // 실 카카오 SDK 로드 + 다단계 플로우라 기본 30s 로는 부족 → 넉넉히.
    test.setTimeout(90_000);
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 37.5662, longitude: 126.9785 });
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, JSON.stringify(value)),
      [STORAGE_KEY, appState] as const,
    );

    // safe-compare 만 mock(실 카카오 지도는 그대로 로드).
    await page.route('**/api/routes/safe-compare', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockRoute('safe', 88), mockRoute('main', 80), mockRoute('fast', 72)]),
      }),
    );

    // 1) 경로 비교 → 현재 위치 확인(routeOrigin 설정) → 경로 로드
    await page.goto('/search');
    await page.getByRole('button', { name: '현재 위치 확인' }).click();
    await expect(page.getByTestId('route-option').first()).toBeVisible();

    // 2) 상세 → 길안내(/navigate)로 진입 — 지도가 화면 대부분을 차지하고 시설 마커만 표시되는 화면.
    await page.getByTestId('route-preview-option').first().click();
    await page.getByTestId('route-detail-link').first().click();
    await expect(page).toHaveURL(/\/route\/(safe|main|fast)$/);
    await page.getByTestId('start-navigation-btn').click();
    await expect(page).toHaveURL(/\/navigate$/);

    // 3) 실 카카오 지도 ready 대기(MapMock 폴백이면 캡처 의미 없음 → 명시적 실패로 신호)
    await expect(page.getByTestId('route-map')).toBeVisible();
    await expect(
      page.getByTestId('map-mock'),
      'MapMock 폴백 — VITE_KAKAO_JS_KEY 미주입/SDK 로드 실패로 실지도 마커 팝업 캡처 불가',
    ).toHaveCount(0, { timeout: 15_000 });

    // 마커(CustomOverlay DOM)는 data-poi 로 식별. 출발/도착 외 시설은 클릭 시 정보 카드.
    const cctv = page.locator('[data-poi="cctv"]').first();
    const bell = page.locator('[data-poi="bell"]').first();
    await expect(cctv).toBeVisible({ timeout: 15_000 });

    // 캡처 ①: 지도 화면(마커 표시 상태)
    await shot(page, '10-map-screen.png');

    // 캡처 ②: CCTV 마커 클릭 → 용도·카메라대수 팝업
    await cctv.click();
    const card = page.getByTestId('poi-info-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('생활방범');
    await shot(page, '11-cctv-popup.png');

    // 정보 카드 닫고 안심벨 마커 클릭 → 팝업
    await page.getByLabel('정보 닫기').click();
    await expect(card).toHaveCount(0);
    await bell.click();
    await expect(card).toBeVisible();
    await expect(card).toContainText('안전 비상벨');
    await shot(page, '12-bell-popup.png');

    // 실 카카오 지도(WebGL/타이머)를 언마운트한 뒤 종료 — headless 컨텍스트 close 행(hang) 회피.
    await page.goto('about:blank');
  });
});
