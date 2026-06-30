# 지도 화면 · 마커 팝업 캡처

안심 귀가 길안내(`/navigate`) 실 카카오 지도에서 캡처한 증거 스크린샷.
시설 마커(CCTV/안심벨)를 누르면 용도·정보 팝업(정보 카드)이 뜬다.

| 파일 | 내용 |
|---|---|
| `map-screen.png` | 길안내 지도 화면(경로선 + 회랑 시설 마커) |
| `cctv-marker-popup.png` | CCTV 마커 클릭 팝업 — 용도(설치목적구분=생활방범)·카메라 대수·좌표 |
| `bell-marker-popup.png` | 안심벨 마커 클릭 팝업 — 유형·관리기관·좌표 |

## 재생성

실 카카오 키(`VITE_KAKAO_JS_KEY`)가 주입된 dev 서버(:3619)가 떠 있어야 한다(미충족 시 MapMock 폴백 → 캡처 불가).

```sh
# dev 서버가 이미 떠 있는 상태에서
MAP_POPUP_CAPTURE=1 E2E_USE_EXTERNAL_SERVER=1 npx playwright test map-marker-popup
# 산출물: screenshots/10-map-screen.png, 11-cctv-popup.png, 12-bell-popup.png
```

스펙: [`tests/e2e/map-marker-popup.spec.ts`](../../tests/e2e/map-marker-popup.spec.ts) (기본 skip, `MAP_POPUP_CAPTURE=1` 일 때만 실행 — 기존 `test:e2e` 게이트 무영향).
