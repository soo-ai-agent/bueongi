import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 설정 — 안심귀가(bueongi) 프론트엔드.
 *
 * 단계 ②(맥 로컬): 풀플로우 1개 + 캡처. CI/게이트/대시보드는 별 단계(③④⑤).
 * - 단위 테스트(vitest, src/**)와 디렉터리(tests/e2e) 분리 → 충돌 없음.
 * - 모바일 앱 형태이므로 iPhone 13 viewport(390x844)로 에뮬레이션하되,
 *   이번엔 chromium만 설치 → browserName을 chromium으로 고정(webkit 미설치).
 */
export default defineConfig({
  testDir: 'tests/e2e',

  // 영상·trace 산출물 저장 경로(실행마다 정리됨 → stale 없음).
  outputDir: 'test-results',

  // 로컬은 재시도 0(flake를 숨기지 않음), CI는 ③단계에서 2회.
  retries: process.env.CI ? 2 : 0,
  fullyParallel: true,
  // CI에서 test.only 누락 방지(로컬 무영향).
  forbidOnly: !!process.env.CI,

  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],

  use: {
    baseURL: 'http://localhost:3619',
    // 실패 시 자동 캡처(기본 정책). 통과 시엔 무동작 → 디스크 절약.
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      // iPhone 13 모바일 viewport/터치/UA 유지 + 브라우저만 chromium으로 고정.
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
  ],

  // recon 실측: vite dev는 :3619에서 HTTP 200으로 마운트됨.
  webServer: {
    command: 'npm run dev',
    port: 3619,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
