import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * 안심귀가 풀플로우 E2E (단계 ②) — maps 키 없이 mock 상태에서
 * "UI 흐름·화면 렌더링·plumbing(데이터 전파)·목적지 가드"를 검증/캡처한다.
 *
 * mock 경계(정직): 실 경로의 지리적 정확성은 maps 키 이후라야 의미 있음.
 *   지금 검증되는 것 = 검색→선택→경로→길안내까지 ★흐름이 끊기지 않고,
 *   각 화면이 ★실제로 그려지며(mock 지도 포함), ★목적지 컨텍스트가 전파되는가.
 */

const SHOT_DIR = 'screenshots';

/** 단계별 명시적 스크린샷(통과/실패 무관) — 사용자가 흐름을 시각으로 재현하는 용도. */
async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: true });
}

test.describe('안심귀가 풀플로우 (mock)', () => {
  test('Onboarding→home→place-search→confirm-location→search→route/:id→navigate→share', async ({
    page,
  }) => {
    // 1) Onboarding — 새 컨텍스트(localStorage 비어있음)면 온보딩 노출
    await page.goto('/');
    await expect(page.getByTestId('onboarding-next')).toBeVisible();
    await shot(page, '01-onboarding.png');
    // 슬라이드 3장 진행(다음·다음·시작하기) → /home
    await page.getByTestId('onboarding-next').click();
    await page.getByTestId('onboarding-next').click();
    await page.getByTestId('onboarding-next').click();

    // 2) Home — 메인 검색 진입점이 보이고 클릭 가능한가
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByTestId('home-search-trigger')).toBeVisible();
    await shot(page, '02-home.png');
    await page.getByTestId('home-search-trigger').click();

    // 3) PlaceSearch — 실시간 필터: 입력하면 결과가 렌더되는가
    await expect(page).toHaveURL(/\/place-search$/);
    await page.getByTestId('place-search-input').fill('강남역');
    const firstResult = page.getByTestId('place-result').first();
    await expect(firstResult).toBeVisible();
    await shot(page, '03-place-search.png');
    // 시각회귀 baseline ① — 맵·무한 애니메이션이 없는 결정론적 페이지에만(diff 검증은 ③에서).
    await expect(page).toHaveScreenshot('place-search-results.png', { animations: 'disabled' });
    await firstResult.click();

    // 4) ConfirmLocation — 선택한 목적지가 표시되고 mock 지도가 마운트되는가
    await expect(page).toHaveURL(/\/confirm-location$/);
    await expect(page.getByText('강남역 2번 출구')).toBeVisible();
    // recon 핵심: maps 키 없이도 mock 지도(MapMock)가 그려진다.
    await expect(page.getByTestId('map-mock')).toBeVisible();
    await shot(page, '04-confirm-location.png');
    await page.getByTestId('confirm-route-btn').click();

    // 5) RouteComparison — 경로 후보 3개 + mock 지도
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByRole('heading', { name: '경로 선택' })).toBeVisible();
    await expect(page.getByTestId('map-mock')).toBeVisible();
    await expect(page.getByTestId('route-option')).toHaveCount(3);
    await shot(page, '05-route-comparison.png');
    await page.getByTestId('route-option').first().click();

    // 6) RouteDetail — 선택 경로 상세 + 실 목적지 컨텍스트 전파(plumbing) + mock 지도
    await expect(page).toHaveURL(/\/route\/1$/);
    await expect(page.getByRole('heading', { name: '추천 경로' })).toBeVisible();
    await expect(page.getByText('강남역 2번 출구')).toBeVisible();
    await expect(page.getByTestId('map-mock')).toBeVisible();
    await shot(page, '06-route-detail.png');
    await page.getByTestId('start-navigation-btn').click();

    // 7) Navigation — 길안내(동행 중) 화면 진입 + mock 지도
    await expect(page).toHaveURL(/\/navigate$/);
    await expect(page.getByText('부엉이 동행 중')).toBeVisible();
    await expect(page.getByTestId('map-mock')).toBeVisible();
    await shot(page, '07-navigation.png');
    await page.getByTestId('nav-share-btn').click();

    // 8) ShareStatus — 보호자 공유 화면이 뜨고 공유를 트리거할 수 있는가
    //    (실제 공유 발동은 미수행 — navigator.share/clipboard 권한에 의존해 headless에서 flaky.)
    await expect(page).toHaveURL(/\/share$/);
    await expect(page.getByRole('heading', { name: '보호자에게 공유' })).toBeVisible();
    await expect(page.getByText('강남역 2번 출구')).toBeVisible();
    await expect(page.getByTestId('share-kakao-btn')).toBeEnabled();
    await shot(page, '08-share.png');
    // 시각회귀 baseline ② — 결정론적 페이지(diff 검증은 ③에서).
    await expect(page).toHaveScreenshot('share-page.png', { animations: 'disabled' });
  });

  test('가드(BUE-AUDIT-T109): 목적지 미선택 시 경로상세는 가짜 안내 대신 검색 유도', async ({ page }) => {
    // 새 컨텍스트 → 선택 목적지 없음. /route/1 직접 진입 시
    // "안심귀가 시작"(가짜 동행)을 노출하지 않고 검색으로 유도해야 한다.
    await page.goto('/route/1');
    await expect(page.getByTestId('no-destination-guard')).toBeVisible();
    await expect(page.getByText('선택된 목적지가 없어요')).toBeVisible();
    // 길안내 시작 버튼이 존재하지 않아야(가짜 동행·거짓 도착 차단).
    await expect(page.getByTestId('start-navigation-btn')).toHaveCount(0);
  });
});
