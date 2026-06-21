import { expect, test, type Page } from '@playwright/test';

const STORAGE_KEY = 'bueongi-app-state-v1';

const destination = {
  name: '서울시청',
  address: '서울 중구 세종대로 110',
  lat: 37.5665,
  lng: 126.978,
};

const routeRequestDestination = {
  name: destination.name,
  lat: destination.lat,
  lng: destination.lng,
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

async function seedSelectedDestination(page: Page) {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, JSON.stringify(value)),
    [STORAGE_KEY, appState] as const,
  );
}

async function allowCurrentLocation(page: Page) {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 37.501, longitude: 127.039 });
}

test.describe('route API UI integration', () => {
  test.beforeEach(async ({ page }) => {
    await seedSelectedDestination(page);
    await allowCurrentLocation(page);
  });

  test('RouteComparison shows backend route options after origin confirmation', async ({ page }) => {
    const facilityRouteTypes: string[] = [];

    await page.route('**/api/routes/compare', async (route) => {
      const body = route.request().postDataJSON();
      expect(body).toMatchObject({
        origin: { lat: 37.501, lng: 127.039 },
        destination: routeRequestDestination,
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'api-safe',
            name: '서버 추천 안심길',
            time: '21분',
            dist: '1.1km',
            desc: '실시간 안전 시설 밀도가 높은 경로입니다.',
            tags: [{ text: 'CCTV 8대', variant: 'mint' }],
            type: 'safe',
          },
          {
            id: 'api-main',
            name: '서버 큰길 위주',
            time: '25분',
            dist: '1.3km',
            desc: '대로변과 영업 중인 매장을 우선하는 경로입니다.',
            tags: [{ text: '큰길 중심', variant: 'blue' }],
            type: 'main',
          },
        ]),
      });
    });
    await page.route('**/api/routes/facilities', async (route) => {
      const body = route.request().postDataJSON();
      expect(body).toMatchObject({
        origin: { lat: 37.501, lng: 127.039 },
        destination: routeRequestDestination,
      });
      facilityRouteTypes.push(body.routeType);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          pois: [
            { type: 'start', x: 20, y: 80, lat: 37.501, lng: 127.039 },
            { type: 'cctv', x: 42, y: 58, lat: 37.52, lng: 127.01, name: '비교 지도 CCTV' },
            { type: 'end', x: 80, y: 20, lat: destination.lat, lng: destination.lng },
          ],
          summary: { cctv: 1, bell: 0, store: 0, police: 0, total: 1 },
        }),
      });
    });

    await page.goto('/search');
    await page.getByRole('button', { name: '현재 위치 확인' }).click();

    await expect(page.getByText('서버 추천 안심길')).toBeVisible();
    await expect(page.getByText('21분')).toBeVisible();
    await expect(page.getByText('CCTV 8대')).toBeVisible();
    await expect.poll(() => facilityRouteTypes.includes('safe')).toBe(true);

    await page.getByText('서버 큰길 위주').click();
    await expect(page).toHaveURL(/\/search$/);
    await expect.poll(() => facilityRouteTypes.includes('main')).toBe(true);
  });

  test('Navigation keeps the selected backend route from comparison detail', async ({ page }) => {
    await page.route('**/api/routes/compare', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'api-safe',
            name: '서버 추천 안심길',
            time: '21분',
            dist: '1.1km',
            desc: '실시간 안전 시설 밀도가 높은 경로입니다.',
            tags: [{ text: 'CCTV 8대', variant: 'mint' }],
            type: 'safe',
          },
          {
            id: 'api-main',
            name: '서버 큰길 위주',
            time: '25분',
            dist: '1.3km',
            desc: '대로변과 영업 중인 매장을 우선하는 경로입니다.',
            tags: [{ text: '큰길 중심', variant: 'blue' }],
            type: 'main',
          },
        ]),
      });
    });
    await page.route('**/api/routes/facilities', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          pois: [
            { type: 'start', x: 20, y: 80, lat: 37.501, lng: 127.039 },
            { type: 'end', x: 80, y: 20, lat: destination.lat, lng: destination.lng },
          ],
          summary: { cctv: 0, bell: 0, store: 0, police: 0, total: 0 },
        }),
      });
    });

    await page.goto('/search');
    await page.getByRole('button', { name: '현재 위치 확인' }).click();
    await page.getByRole('button', { name: '서버 큰길 위주 경로 보기' }).click();

    await expect(page).toHaveURL(/\/route\/main$/);
    await expect(page.getByRole('heading', { name: '서버 큰길 위주' })).toBeVisible();
    await page.getByTestId('start-navigation-btn').click();

    await expect(page).toHaveURL(/\/navigate$/);
    await expect(page.getByText('서울시청로 가는 중 · 서버 큰길 위주')).toBeVisible();
    await expect(page.getByText('25분')).toBeVisible();
    await expect(page.getByText('남음 (1.3km)')).toBeVisible();
  });

  test('RouteComparison maps standard API errors and keeps fallback routes visible', async ({ page }) => {
    await page.route('**/api/routes/compare', async (route) => {
      await route.fulfill({
        status: 422,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          title: 'Origin required',
          errors: [{ code: 'ORIGIN_REQUIRED' }],
        }),
      });
    });
    await page.route('**/api/routes/facilities', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          pois: [
            { type: 'start', x: 20, y: 80, lat: 37.501, lng: 127.039 },
            { type: 'end', x: 80, y: 20, lat: destination.lat, lng: destination.lng },
          ],
          summary: { cctv: 0, bell: 0, store: 0, police: 0, total: 0 },
        }),
      });
    });

    await page.goto('/search');
    await page.getByRole('button', { name: '현재 위치 확인' }).click();

    await expect(page.getByText('현재 위치를 확인한 뒤 다시 시도해 주세요.')).toBeVisible();
    await expect(page.getByText('추천 경로')).toBeVisible();
  });

  test('RouteDetail shows facilities returned by the backend', async ({ page }) => {
    await page.route('**/api/routes/facilities', async (route) => {
      const body = route.request().postDataJSON();
      expect(body).toMatchObject({
        origin: { lat: 37.501, lng: 127.039 },
        destination: routeRequestDestination,
        routeType: 'safe',
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          pois: [
            { type: 'start', x: 20, y: 80, lat: 37.501, lng: 127.039 },
            { type: 'cctv', x: 40, y: 60, lat: 37.52, lng: 127.01, name: '골목 CCTV' },
            { type: 'end', x: 80, y: 20, lat: destination.lat, lng: destination.lng },
          ],
          summary: { cctv: 4, bell: 2, store: 1, police: 0, total: 7 },
        }),
      });
    });

    await page.goto('/route/safe');
    await page.getByTestId('start-navigation-btn').click();

    await expect(page.getByText('총 7개')).toBeVisible();
    await expect(page.getByText('안심귀가 시작')).toBeVisible();
  });

  test('RouteDetail maps facilities API errors and keeps fallback summary visible', async ({ page }) => {
    await page.route('**/api/routes/facilities', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/problem+json',
        body: JSON.stringify({ title: 'Validation failed', code: 'VALIDATION_FAILED' }),
      });
    });

    await page.goto('/route/safe');
    await page.getByTestId('start-navigation-btn').click();

    await expect(page.getByText('위치 정보가 올바르지 않아요. 목적지를 다시 선택해 주세요.')).toBeVisible();
    await expect(page.getByText('총 5개')).toBeVisible();
  });
});
