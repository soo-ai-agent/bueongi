# 안심귀가 앱 MVP — 요구사항 명세 (검증 기준)

> 목적: 본 문서는 구현된 코드를 **검증 가능한 수용 기준(AC)** 으로 고정한다.
> 각 요구사항은 화면/유틸/API 계약과 자동화 테스트(unit·e2e)에 매핑된다.
> 작성 기준: `parallel/bueongi-w2` HEAD, vitest 269 GREEN / 28 files.
> 근거 점검: `.claude/reports/screen-api-status-2026-06-18.md`.

## 0. 시스템 개요

- 프론트엔드: Vite + React Router, dev/preview 포트 **3619** (`vite.config.ts`, strictPort).
- 백엔드 프록시: `'/api' → http://localhost:8119` (`vite.config.ts`). CORS allowed-origin 기본 `http://localhost:3619`.
- 지도: Kakao Maps JS SDK를 `dapi.kakao.com`에서 런타임 동적 로드(`VITE_KAKAO_JS_KEY`). 키 부재/로드 실패 시 `MapMock`으로 자동 폴백 → 화면 무손상.
- 직접 호출 레이어(tmap/cdn/score/police/share)와 백엔드 프록시 레거시 폴백 관계는 `src/app/utils/*`에 구현.

원칙(전 화면 공통):
- **무손상 폴백**: 외부 API(백엔드·지도·공공데이터) 실패 시에도 화면이 깨지지 않고 목업/로컬 카탈로그로 동작한다.
- **가짜 안내 금지**: 데이터가 없으면 그럴듯한 가짜 결과 대신 명시적 가드(검색 유도 등)를 노출한다.

---

## 1. 화면별 요구사항 (라우트 기준 — `src/app/routes.tsx`)

### R1. Onboarding (`/`)
- AC1.1 정적 안내를 표시하고 `onboarding-next`로 `/home`으로 진입한다.
- 검증: e2e `anshim-guigi-full-flow.spec.ts` (Onboarding→home 단계), `onboarding.test.ts`.

### R2. Home (`/home`)
- AC2.1 자주가는장소/최근목적지/광고는 로컬 store 목업으로 표시된다(외부 API 미호출).
- AC2.2 `home-search-trigger`로 `/place-search`로 이동한다.
- AC2.3 외부 안전정보 링크(sexoffender.go.kr)는 새 탭/외부로 연결된다.
- 검증: e2e 풀플로우 home 단계.

### R3. PlaceSearch (`/place-search`)
- AC3.1 입력 즉시 `GET /api/places/search?keyword=`를 호출한다(계약: `PlaceItem`).
- AC3.2 호출 실패 시 로컬 카탈로그(6건)로 **무음 폴백**하여 결과를 보여준다.
- AC3.3 비정형 응답은 런타임 파서가 방어한다(앱 크래시 0).
- 검증: `placeSearch.test.ts`, e2e place-search 결과 노출.

### R4. ConfirmLocation (`/confirm-location`)
- AC4.1 목적지/좌표가 없으면 가드로 검색을 유도한다(가짜 좌표 사용 금지).
- AC4.2 선택된 목적지(예: "강남역 2번 출구")와 지도(MapMock 폴백 포함)를 표시한다.
- 검증: e2e confirm-location 단계(`map-mock` 가시성).

### R5. RouteComparison (`/search`)
- AC5.1 "현재 위치 확인"(geolocation) 후 `POST /api/routes/compare`, `POST /api/routes/facilities`를 호출한다.
- AC5.2 좌표 검증 범위(lat -90~90, lng -180~180)를 **요청 전** 적용한다(프·백 일치).
- AC5.3 호출 실패 시 `mockRoutes`(3건) + 안내문구로 폴백한다.
- AC5.4 복구 가능 에러코드(`SAME_ORIGIN_DESTINATION`, `TRIP_TOO_FAR`, `INVALID_KEYWORD`, `ORIGIN_REQUIRED`, `VALIDATION_FAILED`, `MALFORMED_REQUEST`)는 사용자 메시지로 매핑된다.
- 검증: `apiError.test.ts`, `routeCompare.test.ts`, `geo.test.ts`, e2e `route-api.spec.ts`(compare/facilities/ORIGIN_REQUIRED/VALIDATION_FAILED), 풀플로우(route-option 3건).

### R6. RouteDetail (`/route/:id`)
- AC6.1 routeType별 시설을 `POST /api/routes/facilities`로 조회하고, 실패 시 폴백 시설 요약을 보여준다.
- AC6.2 목적지 미선택 시(`/route/1` 직접 진입) `no-destination-guard`를 노출하고 `start-navigation-btn`을 제공하지 않는다(가짜 안내 금지, BUE-AUDIT-T109).
- AC6.3 API 경로 옵션(예: id `api-safe`)을 표시·선택할 수 있다.
- 검증: `RouteDetail.test.tsx`, `routeFacilities.test.ts`, e2e 가드 케이스.

### R7. Navigation (`/navigate`)
- AC7.1 세션 `apiRouteOptions`를 `mockRoutes`보다 **우선** 참조하여 `api-*` id도 정확히 해석한다(F2 회귀 방지).
- AC7.2 "부엉이 동행 중" 상태와 지도를 표시하고, Web Share/복사·`tel:112`·보호자 연락을 제공한다.
- 검증: `routeSelection.test.ts`(`resolveRouteWithApiOptions`), e2e navigate 단계.

### R8. ShareStatus (`/share`) & GuardianShare (`/share/:token`)
- AC8.1 `/share`는 보호자 공유 진입점(헤더 "보호자에게 공유")과 목적지·카카오 공유 버튼(`share-kakao-btn`, enabled)을 제공한다.
- AC8.2 `/share/:token`은 **로그인 없이 URL만으로** 접근 가능하고 5초 주기로 위치를 폴링한다.
- 검증: `share.test.ts`, `shareSession.test.ts`, `GuardianShare.test.tsx`, e2e share 단계.

### R9. MyPage (`/mypage`) / EmergencyContact (`/emergency-contacts`)
- AC9.1 비상연락처 등 로컬 store CRUD가 동작한다(외부 API 미호출).
- 검증: `appStore.test.ts`, `persist.test.ts`.

---

## 2. 횡단 요구사항

### X1. 안전 점수 / 경로 비교
- 안전 점수(`safetyScore.ts`)와 경로 비교(`routeCompare.ts`, `routeSelection.ts`)는 결정적(deterministic) 결과를 낸다.
- 검증: `safetyScore.test.ts`, `routeCompare.test.ts`, `routeSelection.test.ts`.

### X2. 데이터 소스 폴백(거점/파출소/CDN)
- 경로/거점(`routeSource.ts`), 파출소(`policeSource.ts`, `nearestPolice.ts`), CDN 자산(`cdnAssets.ts`)은 원본 실패 시 로컬 폴백을 사용한다.
- 검증: `routeSource.test.ts`, `policeSource.test.ts`, `nearestPolice.test.ts`, `cdnAssets.test.ts`.

### X3. 로컬 캐시 / 세션 영속
- `localCache.ts`/`persist.ts`는 TTL·복원 규약을 지킨다.
- 검증: `localCache.test.ts`, `persist.test.ts`.

### X4. 지도 폴백
- 키 미주입(CI 포함)에서도 `RouteMap`이 `MapMock`으로 폴백하여 `map-mock` testid가 노출된다.
- 검증: `RouteMap.test.tsx`, `kakaoMaps.test.ts`, e2e 전 단계의 `map-mock` 가시성.

### X5. 에러 경계
- 라우트 렌더 오류는 `RouteErrorBoundary`가 잡아 화면 전체 크래시를 막는다.

---

## 3. 비기능 / 검증 게이트

- NF1 (테스트 GREEN): `npm test`(vitest run) 전부 통과 — 현 baseline **269 tests / 28 files**.
- NF2 (타입): `npm run typecheck`(tsc --noEmit) 오류 0.
- NF3 (e2e 파싱): 포트 미허용 환경에서도 `npm run test:e2e:list`로 테스트 디스커버리 검증.
- NF4 (e2e 실행): `npm run test:e2e`로 풀플로우 + route-api 케이스 통과(스냅샷 포함).
- NF5 (시크릿): client 번들에 서버 전용 시크릿(REST 키 등) 미포함. 지도 키는 공개 설계인 `VITE_KAKAO_JS_KEY`만 허용.

---

## 4. 추적성 매트릭스 (요구사항 → 1차 검증)

| 요구사항 | 1차 검증 자산 |
|---|---|
| R1 Onboarding | onboarding.test.ts · e2e 풀플로우 |
| R3 PlaceSearch | placeSearch.test.ts · e2e |
| R5 RouteComparison | apiError/routeCompare/geo.test.ts · route-api.spec |
| R6 RouteDetail | RouteDetail.test.tsx · routeFacilities.test.ts · e2e 가드 |
| R7 Navigation | routeSelection.test.ts · e2e navigate |
| R8 Share | share/shareSession.test.ts · GuardianShare.test.tsx |
| R9 MyPage/Contacts | appStore/persist.test.ts |
| X2 데이터 폴백 | routeSource/policeSource/nearestPolice/cdnAssets.test.ts |
| X4 지도 폴백 | RouteMap.test.tsx · kakaoMaps.test.ts |

> 미충족 항목 발견 시: 해당 AC에 대응하는 테스트를 먼저 추가(RED)한 뒤 구현으로 GREEN 전환한다.
</content>
</invoke>
