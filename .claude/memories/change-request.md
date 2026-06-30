# E2E 실패 — 재작업 요청 (2026-06-17 20:07)

프로젝트: bueongi / E2E: npx playwright test (백엔드 :8119 + 프론트 :3619)

## 실패 로그(말미)

    Call log:
    [2m  - Expect "toHaveCount" with timeout 5000ms[22m
    [2m  - waiting for getByTestId('route-option')[22m
    [2m    14 × locator resolved to 0 elements[22m
    [2m       - unexpected value "0"[22m


      59 |     await expect(page.getByRole('heading', { name: '경로 선택' })).toBeVisible();
      60 |     await expect(page.getByTestId('map-mock')).toBeVisible();
    > 61 |     await expect(page.getByTestId('route-option')).toHaveCount(3);
         |                                                    ^
      62 |     await shot(page, '05-route-comparison.png');
      63 |     await page.getByTestId('route-option').first().click();
      64 |
        at /Users/soo/workspace/source-code/apps/bueongi/frontend-src/tests/e2e/anshim-guigi-full-flow.spec.ts:61:52

    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/anshim-guigi-full-flow-안심귀-e99f8-rch→route-id→navigate→share-chromium/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────

    attachment #2: video (video/webm) ──────────────────────────────────────────────────────────────
    test-results/anshim-guigi-full-flow-안심귀-e99f8-rch→route-id→navigate→share-chromium/video.webm
    ────────────────────────────────────────────────────────────────────────────────────────────────

    Error Context: test-results/anshim-guigi-full-flow-안심귀-e99f8-rch→route-id→navigate→share-chromium/error-context.md

  1 failed
    [chromium] › tests/e2e/anshim-guigi-full-flow.spec.ts:21:3 › 안심귀가 풀플로우 (mock) › Onboarding→home→place-search→confirm-location→search→route/:id→navigate→share 
  5 passed (10.4s)
