# 화면별 동작 케이스 & API 연결 상태 점검 (2026-06-18)

대상: `apps/bueongi/frontend-src` (dev 포트 3619) ↔ 백엔드 `apps/bueongi/backend` (Spring Boot, 포트 8119)
프록시: `vite.config.ts` `'/api' → http://localhost:8119`, CORS allowed-origins 기본 `http://localhost:3619` (일치 ✓)

## 1. 백엔드 가동/연결 상태
- 점검 시점 `localhost:8119` 미기동(`curl` → 000). **현재 모든 화면은 폴백/목업 데이터로 동작 중.**
- 프록시 경로·포트·CORS 오리진은 코드상 정상 매칭. 백엔드 기동 시 연결 가능한 구성.

## 2. 화면별 동작 케이스 & API 연결

| 화면 | 호출 API | 동작 케이스 | 연결 상태 |
|---|---|---|---|
| Onboarding | 없음 | 정적 안내 | N/A |
| Home | 없음(로컬 store) | 자주가는장소/최근목적지/광고 목업, 외부링크(sexoffender.go.kr) | N/A |
| PlaceSearch | `GET /api/places/search?keyword=` | 입력 즉시 검색 → 실패 시 로컬 카탈로그 6건으로 **무음 폴백** | 계약 일치 ✓ (단, 에러 무음) |
| ConfirmLocation | 없음 | 목적지/좌표 가드 → 없으면 검색 유도 | N/A |
| RouteComparison | `POST /api/routes/compare`, `POST /api/routes/facilities` | 현재위치 확인(geolocation) 후 호출. 실패 시 mockRoutes + 안내문구 | 계약 일치, F1 처리 완료(2026-06-18 03:17 KST) |
| RouteDetail | `POST /api/routes/facilities` | routeType별 시설 조회, 실패 시 폴백 시설 요약 | 계약 일치, F1 처리 완료 |
| Navigation | 없음(공유/전화) | Web Share/복사, tel:112·보호자. 세션 `apiRouteOptions` 우선 참조 | F2 처리 완료(2026-06-18 03:17 KST) |
| ShareStatus / MyPage / EmergencyContact | 없음 | 공유·복사, 로컬 store CRUD | N/A |

## 3. 발견 사항 (플랫폼/수정 필요)

### F1. 프론트–백엔드 에러코드 계약 드리프트 (처리 완료)
백엔드 `ApiExceptionHandler`가 내는 복구 가능 코드 중 프론트 `apiError.ts`의
`STANDARD_API_ERROR_MESSAGES`에 **매핑되지 않은 코드**:
- `SAME_ORIGIN_DESTINATION` (422) — 백엔드 주석상 "도착지 재선택 유도" 기대
- `TRIP_TOO_FAR` (422) — "가까운 도착지 재선택 유도" 기대
- `INVALID_KEYWORD` (400, 장소검색)

매핑된 코드: `ORIGIN_REQUIRED`, `VALIDATION_FAILED`, `MALFORMED_REQUEST` (정상).

처리: 2026-06-18 03:17 KST에 프론트 `apiError.ts` 표준 메시지 매핑에 3개 코드를 추가했고,
`apiError.test.ts` 회귀 테스트로 고정함.

### F2. Navigation 화면이 실시간 경로(apiRouteOptions)를 무시 (처리 완료)
- `RouteDetail`은 `apiRouteOptions`(예: id `api-safe`)로 경로를 표시·선택하고
  `navigate('/navigate', { state: { routeId: 'api-safe' } })` 전달.
- `Navigation.tsx`는 `resolveRoute(mockRoutes, routeId)`로 **mockRoutes에서만** 해석 →
  `api-*` id는 매칭 실패 → 항상 `mockRoutes[0]`(추천 경로 24분/1.2km)로 폴백.
처리: 2026-06-18 03:17 KST에 `resolveRouteWithApiOptions()`를 추가하고 `NavigationScreen`이
세션 `apiRouteOptions`를 mockRoutes보다 우선 참조하도록 수정함. `routeSelection.test.ts` 회귀 테스트로 고정함.

## 4. 정상 확인 사항
- 좌표 검증 범위(lat -90~90, lng -180~180) 프·백 일치, 요청 전 차단.
- `PlaceItem`/`RouteOption`/`FacilityPoi` 필드 계약 프·백 일치, 프론트 런타임 파서가 비정형 응답 방어.
- e2e `tests/e2e/route-api.spec.ts`가 compare/facilities 정상·ORIGIN_REQUIRED·VALIDATION_FAILED 케이스 커버.
