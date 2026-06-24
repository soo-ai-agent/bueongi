# 안심귀가 앱(부엉이) MVP — 요구사항 명세 (Acceptance Criteria)

> 본 문서는 deep-verify / E2E / 코드리뷰가 "요구사항 일치"를 판정할 수 있도록 하는 **검증 기준(AC)** 의 단일 출처(single source of truth)다.
> 칸반 카드 `bscan-19`(요구사항 명세 부재) 해소를 위해, 이미 구현된 코드·테스트에 grounded 하여 작성됐다.
> 새 기능/회귀 시 본 문서의 AC를 먼저 갱신한 뒤 구현·테스트를 변경한다.

- 대상 코드베이스: `apps/bueongi/frontend-src` (Vite + React + react-router + Zustand)
- 관련 칸반: `3842fabd`(앱 데이터 캐싱·경로 추천·지도 마커), `78eb6275`(위치 공유 UX·보호자 웹 지도)
- 갱신 기준일: 2026-06-24

---

## 0. 제품 개요

야간/심야 보행자의 **안심귀가**를 돕는 모바일 웹 앱(MVP). 사용자는 목적지를 검색하고, 안전 점수가 매겨진
보행 경로를 추천받아 길안내를 받으며, 보호자에게 실시간 위치를 공유하고, 위급 시 최근접 파출소로 즉시
전화할 수 있다. 등록/페어링/푸시 없이 동작한다.

---

## 1. 설계 원칙 (불변 제약 — 위반 시 회귀로 간주)

| ID | 원칙 | 근거 코드 |
|----|------|-----------|
| P1 | **앱 직접 호출 우선** — Tmap·CDN·서울 Open API·위치공유는 서버 프록시를 거치지 않고 앱이 직접 호출한다. 키 미설정 시에만 백엔드/목업으로 전환 폴백. | `utils/routeSource.ts`, `utils/tmap.ts`, `utils/cdnAssets.ts` |
| P2 | **시크릿 위생** — 브라우저 노출 가능한 키만 클라이언트에 둔다(Kakao JS 키 등 공개 설계 키). 인증키는 로그에 남기지 않는다. | `utils/seoulSafeReturn.ts`(로그 금지 주석), `utils/clientEnv.ts` |
| P3 | **거짓 확신 방지** — 공유/저장/네트워크 실패를 성공으로 삼키지 않고 결과를 정직하게 표면화한다. | `utils/share.ts`(`ShareOutcome`), `utils/localCache.ts`(저장 실패 false) |
| P4 | **점진적 향상 & 그레이스풀 폴백** — 데이터/키가 없거나 손상돼도 화면이 깨지지 않고 0점/목업으로 수렴한다. | `RouteMap`→`MapMock` 폴백, `safetyScore.ts`(빈 입력 0점) |
| P5 | **위급 기능 오프라인 동작** — 최근접 파출소 검색은 네트워크 없이 로컬 캐시로 동작해야 한다. | `utils/nearestPolice.ts`, `utils/policeSource.ts` |

---

## 2. 데이터 소스 식별자

| 코드 | 데이터 | 출처 | 비고 |
|------|--------|------|------|
| A-1/A-2/A-3 | 서울 안심귀갓길 경로/포인트/서비스 | 서울 열린데이터광장 Open API | 앱 직접 호출, 첫 실행 1회 + 월1회 갱신, 로컬 캐시 |
| A-4 | (서울 외) 안심귀갓길 | CDN | 서울 외 지역 겹침 보너스 |
| B-1 | CCTV | CDN `cctv/{시군구코드}.json` | 안전점수 + 경로 마커 |
| B-2 | 여성안심지킴이집 | CDN | 경로 마커 |
| B-3/B-4 | 파출소/지구대 | CDN `police/all.json` | 최근접 파출소(오프라인) |
| C-1/C-2 | 가로등/보안등 | CDN | 안전점수(조명 밀도) |
| D-1 | 비상벨 | CDN | 안전점수 + 경로 마커 |
| E-1 | Tmap 보행자 경로 | SK Tmap Open API (GeoJSON, AppKey 헤더, 일 5만건) | 앱 직접 호출 |

---

## 3. 기능 요구사항 & 수용 기준 (AC)

### F1. 온보딩 / 홈 진입
- **F1-AC1**: 최초 진입(`/`)은 온보딩(`Onboarding`)을 표시하고, 완료 후 홈(`/home`)으로 이동한다.
- **F1-AC2**: 온보딩 완료 상태는 로컬에 영속되어 재방문 시 반복 노출되지 않는다.
- 근거: `routes.tsx`(index→Onboarding), `utils/onboarding.ts` + `onboarding.test.ts`

### F2. 목적지 검색 / 위치 확인
- **F2-AC1**: 장소 검색(`/place-search`)에서 질의로 후보를 얻고, 선택 시 위치 확인(`/confirm-location`)을 거쳐 목적지가 스토어에 설정된다.
- **F2-AC2**: 목적지 미설정 상태에서 경로/길안내 화면 진입 시, 검색으로 유도하는 가드가 일관되게(`getRouteDestinationContext` 단일 기준) 동작한다.
- 근거: `pages/PlaceSearch.tsx`, `pages/ConfirmLocation.tsx`, `utils/placeSearch.ts`+test, `utils/routeSelection.ts`+test, `Navigation.tsx:24,111`

### F3. 안심 경로 추천 & 안전 점수 (칸반 3842fabd-2)
- **F3-AC1**: Tmap AppKey 설정 시 E-1 보행자 경로를 **앱이 직접 호출**(GeoJSON)하여 후보를 만든다. AppKey 미설정 시에만 백엔드 `/api/routes/compare` 폴백.
- **F3-AC2**: 각 경로는 30m 코리도 내 CCTV/조명/비상벨 밀도(개/km)·여성안심지킴이집 개수로 0~100 안전점수를 매긴다. 서울이면 A-1, 그 외 A-4 겹침 비율 보너스를 더한다.
- **F3-AC3**: 가중치 합은 1.0(cctv .35 / lamp .25 / bell .2 / safehouse .05 / safePath .15), 밀도는 SATURATION 상한으로 0~1 정규화.
- **F3-AC4**: 시설 데이터가 비어도(캐시 실패 등) 점수는 0으로 수렴하고 Tmap 실경로 추천은 유지된다(P4).
- **F3-AC5**: 경로 비교(`/search`)에서 후보를 점수순으로 비교하고 상세(`/route/:id`)로 진입한다.
- 근거: `utils/routeSource.ts`, `utils/tmap.ts`+test, `utils/safetyScore.ts`+test, `utils/routeCompare.ts`+test, `pages/RouteComparison.tsx`+test, `pages/RouteDetail.tsx`+test

### F4. 경로 위 거점 마커 (칸반 3842fabd-3)
- **F4-AC1**: 경로 지도에 CCTV(B-1)·여성안심지킴이집(B-2)·비상벨(D-1) 마커를 표시한다.
- **F4-AC2**: WGS84 범위 밖/손상 좌표 아이템은 마커·점수 계산에서 제외한다.
- 근거: `utils/routeFacilities.ts`+test, `utils/cdnAssets.ts`(좌표 검증), `components/map/RouteMap.tsx`+test

### F5. 지도 렌더링 & 폴백
- **F5-AC1**: `VITE_KAKAO_JS_KEY` 설정 시 Kakao Maps JS SDK를 런타임에 `dapi.kakao.com`에서 동적 로드한다(npm 패키지 아님).
- **F5-AC2**: 키 미설정/SDK 로드 실패 시 `RouteMap`은 `MapMock`으로 자동 폴백해 화면이 깨지지 않는다(CI/키 미주입에서도 동작).
- 근거: `utils/kakaoMaps.ts`+test, `components/map/RouteMap.tsx`+test, `README.md`

### F6. 길안내
- **F6-AC1**: 길안내(`/navigate`)는 RouteDetail에서 선택한 경로를 이어받고, 없으면 추천 경로로 폴백한다.
- **F6-AC2**: 길안내 화면에서 위치 공유(`/share`)·긴급 연락(`/emergency-contacts`)으로 이동할 수 있다.
- 근거: `pages/Navigation.tsx:26,173,209`, `utils/routeSelection.ts`+test

### F7. 위치 공유 UX (칸반 78eb6275 — 앱)
- **F7-AC1**: '위치 공유' 버튼 → `POST {VITE_SHARE_API_BASE_URL}/share/create` → `share_url` 수신. 사용자가 카카오톡/문자 등 외부 메신저로 직접 공유한다(앱은 등록/페어링/푸시 없음).
- **F7-AC2**: 공유 중 5초마다 `POST /share/{token}/location` 으로 좌표를 전송한다.
- **F7-AC3**: 공유 시도 결과는 정직하게 구분된다 — `shared`/`cancelled`/`copied`/`failed`(P3). Web Share 미지원/실제 오류 시 클립보드 복사로 폴백하되 "전송 완료"로 오인시키지 않는다.
- **F7-AC4**: `VITE_SHARE_API_BASE_URL` 미설정 시 정적 링크 복사 폴백으로 동작한다.
- 근거: `utils/share.ts`+test, `utils/shareSession.ts`+test, `pages/ShareStatus.tsx`

### F8. 보호자 웹 지도 (칸반 78eb6275 — 웹)
- **F8-AC1**: `GET /share/{token}`(`/share/:token`)는 로그인 없이 URL만으로 접근 가능한 지도 페이지다.
- **F8-AC2**: 5초마다 `GET /share/{token}/location` 폴링으로 마커를 갱신한다.
- **F8-AC3**: 토큰 만료 시 안내 메시지를 표시한다(폴링 중단).
- 근거: `pages/GuardianShare.tsx`+test, `routes.tsx`(`share/:token`)

### F9. 위급 시 최근접 파출소 (칸반 3842fabd-4)
- **F9-AC1**: `/emergency-contacts`에서 현재 위치 기준 10km 이내 파출소(B-3/B-4)를 거리순으로 보여준다.
- **F9-AC2**: 로컬 캐시가 있으면 **네트워크 없이** 검색한다(P5). 캐시가 없을 때만 CDN에서 1회 수신해 캐시 후 검색하며, CDN 미설정이면 정직하게 실패(throw)한다.
- **F9-AC3**: `tel:` 링크로 전화 연결을 제공하고, 좌표 손상 항목은 제외한다.
- 근거: `utils/nearestPolice.ts`+test, `utils/policeSource.ts`+test, `pages/EmergencyContact.tsx`

### F10. 로컬 캐싱 (칸반 3842fabd-1)
- **F10-AC1**: A-1/A-2/A-3는 첫 실행 1회 다운로드 후 월1회(30일) 갱신, 서울 진입 시 우선 갱신한다.
- **F10-AC2**: CDN JSON은 위치 자치구(시군구코드) 변경 또는 `manifest.json` 버전 변경 시에만 재다운로드한다.
- **F10-AC3**: 캐시 저장 실패(Safari 프라이빗/quota)는 false로 표면화하고, 스키마 버전/페이로드 손상은 null 처리해 점수 계산에 넣지 않는다(P3·P4).
- 근거: `utils/localCache.ts`+test, `utils/cdnAssets.ts`+test, `utils/seoulSafeReturn.ts`+test, `utils/region.ts`+test

---

## 4. 화면(라우트) 맵

| 경로 | 화면 | 관련 요구사항 |
|------|------|----------------|
| `/` | Onboarding | F1 |
| `/home` | Home | F1 |
| `/place-search` | PlaceSearch | F2 |
| `/confirm-location` | ConfirmLocation | F2 |
| `/search` | RouteComparison | F3 |
| `/route/:id` | RouteDetail | F3, F4 |
| `/navigate` | Navigation | F4, F5, F6 |
| `/share` | ShareStatus | F7 |
| `/share/:token` | GuardianShare(보호자) | F8 |
| `/emergency-contacts` | EmergencyContact | F9 |
| `/mypage` | MyPage | — |

근거: `src/app/routes.tsx`

---

## 5. 환경 변수 (빌드 시 주입)

| 변수 | 용도 | 미설정 시 동작 |
|------|------|----------------|
| `VITE_KAKAO_JS_KEY` | Kakao Maps JS SDK(공개 설계 키) | MapMock 폴백 (F5-AC2) |
| `VITE_TMAP_APP_KEY` | E-1 Tmap 보행자 경로 직접 호출 | 백엔드/목업 경로 폴백 (F3-AC1) |
| `VITE_CDN_BASE_URL` | 정적 안심 데이터 CDN | 시설 점수 미반영(0 수렴), 파출소 조회 throw (F9-AC2) |
| `VITE_SEOUL_OPENAPI_KEY` | 서울 A-1/A-2/A-3 직접 호출 | CDN 기반 점수만 사용 (F3-AC2) |
| `VITE_SHARE_API_BASE_URL` | 위치 공유 서버 | 정적 링크 복사 폴백 (F7-AC4) |

> ⚠️ 시크릿 위생(P2): server-side credential(예: Kakao **REST** 키)은 클라이언트 번들에 넣지 않는다. 빌드 산출물(dist) 스캔에서 ABSENT 여야 한다. (관련 보안 카드 `SEC-KAKAO-REST-KEY-IN-BUNDLE`은 triplan 측 트래킹.)
근거: `.env.example`

---

## 6. 비기능 요구사항

- **NFR1 (CI)**: `vitest` GREEN 유지(현 테스트 파일 32개 — `src/**/*.test.*` + `tests/**/*.spec.ts`). 신규 util 추가 시 테스트 동반.
- **NFR2 (E2E)**: `npm run test:e2e`(Playwright)로 풀플로우 통과. 포트 리슨 불가 환경은 `test:e2e:list`로 디스커버리 검증.
- **NFR3 (타입/빌드)**: `tsc` + `vite build` 무오류. 파일 케이싱(대소문자)은 Linux CI와 정합(예: `Button.tsx`).
- **NFR4 (접근성/모바일)**: 모바일 웹 우선, 위급 액션(파출소 전화·긴급연락)은 큰 터치 타겟.

---

## 7. AC ↔ 검증 매핑 (verification matrix)

| 요구사항 | 단위 테스트 | E2E |
|----------|-------------|-----|
| F1 | `onboarding.test.ts` | `anshim-guigi-full-flow.spec.ts` |
| F2 | `placeSearch.test.ts`, `routeSelection.test.ts` | full-flow |
| F3 | `tmap.test.ts`, `safetyScore.test.ts`, `routeCompare.test.ts`, `routeSource.test.ts`, `directRoute.test.ts`, `RouteComparison.test.tsx`, `RouteDetail.test.tsx` | `route-api.spec.ts`, full-flow |
| F4 | `routeFacilities.test.ts`, `cdnAssets.test.ts`, `RouteMap.test.tsx` | full-flow |
| F5 | `kakaoMaps.test.ts`, `RouteMap.test.tsx` | `deep-verify-real.spec.ts` |
| F6 | `routeSelection.test.ts` | full-flow |
| F7 | `share.test.ts`, `shareSession.test.ts` | full-flow |
| F8 | `GuardianShare.test.tsx` | full-flow |
| F9 | `nearestPolice.test.ts`, `policeSource.test.ts` | full-flow |
| F10 | `localCache.test.ts`, `cdnAssets.test.ts`, `seoulSafeReturn.test.ts`, `region.test.ts` | — |

> 갭(추적 대상): F10 로컬 캐싱·F8 만료 안내는 현재 단위 테스트 위주 — 전용 E2E 시나리오 추가 검토.
