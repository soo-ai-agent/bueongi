# handoff.md — 직전 사이클 핸드오프 노트 (bueongi-frontend)

> 최종 갱신: 2026-06-19 22:31 (KST) / 엔진: Codex

## 이번 사이클에 한 일 (frontend)
- 상태 복원:
  - `frontend-src/.claude/memories/consensus.md`, `handoff.md`를 읽어 직전 상태를 복원함.
  - `/Users/soo/workspace/source-code/apps/bueongi/.claude/agents/bueongi-dev.md`에서 bueongi-dev 역할 규칙을 확인함.
  - `agent-autopilot` 스킬을 적용해 Ready task/차단/할 일 없음 상태를 판별함.
  - `frontend-src/.claude/skills/backlog-discovery/SKILL.md`는 현재 부재. 저장소 내 `.claude` 파일 목록에도 발견되지 않음.
- 깨진 빌드/테스트 확인:
  - 초기 `npm run typecheck`가 통과했고 직전 공유 메모리상 깨진 테스트 기록이 없어, 외부 키/포트 없이 닫을 수 있는 저위험 경로 소스 회귀 테스트를 이번 산출물로 선택함.
- Tmap 직접 경로 + 시설 로딩 실패 경계 고정:
  - `src/app/utils/routeSource.test.ts`에 `VITE_TMAP_APP_KEY`와 `VITE_CDN_BASE_URL`이 모두 설정된 상태에서 Tmap 응답은 성공하고 CDN manifest 요청은 503으로 실패하는 케이스를 추가함.
  - `loadComparisonRoutes()`가 이 경우에도 백엔드 `/api/routes/compare`로 우회하지 않고 Tmap 단독 추천 RouteOption을 반환하는 정책을 회귀 테스트로 고정함.

## 검증
- `npm run typecheck` -> PASS.
- `npx vitest run src/app/utils/routeSource.test.ts` -> PASS.
  - Test Files 1 passed.
  - Tests 6 passed.
  - Node `DEP0205` warning만 표시.
- `npm run test` -> PASS.
  - Test Files 27 passed.
  - Tests 239 passed.
  - Node `DEP0205`, Vitest localStorage warning만 표시.
- `npm run test:e2e:list` -> PASS.
  - 총 9개 E2E 등록 확인.
  - Node `DEP0205` warning만 표시.
- `npm run build` -> PASS.
  - Vite production build completed.
  - 기존과 같은 Rollup chunk size warning(>500kB)만 표시됨.
- `npm run test:e2e`는 이번 사이클에서 실행하지 않음.
  - 현재 Codex 샌드박스의 dev server port listen `EPERM` 제약이 이전 사이클들에서 확인되어, 실제 Chromium 실행은 포트 listen 가능 환경 또는 `E2E_BASE_URL=... npm run test:e2e:external` 경로에서 필요.

## 다음 사이클로 넘기는 것
1. 포트 listen 가능한 로컬/CI에서 `npm run test:e2e`를 실행하거나, 이미 떠 있는 서버에 `E2E_BASE_URL=http://host:port npm run test:e2e:external`로 붙어 등록된 E2E 9개를 실제 브라우저로 검증.
2. Tmap 실연동 환경에서 `VITE_TMAP_APP_KEY`를 주입한 뒤 searchOption `0/4/10/30` 후보가 실제 API에서 정상 동작하는지 smoke test. 키 값은 로그/커밋/슬랙에 남기지 말 것.
3. Kakao Local 실연동은 프론트에서 REST 키를 노출하지 말고 백엔드 `/api/places/search` 뒤에 구현하는 방향이 안전함. 프론트 응답 계약은 `PlaceItem{name,address,lat,lng}` 유지.
4. API 오류 보고를 원격 관측 도구로 보낼지 결정. 현재는 로컬 개발 console 경로만 존재.

## 주의/경계
- 기존 uncommitted/untracked 변경이 다수 있었고 되돌리지 않음.
- 이번 사이클에서 직접 수정한 핵심 파일은 `src/app/utils/routeSource.test.ts`, `.claude/memories/consensus.md`, `.claude/memories/handoff.md`.
- `src/app/utils/routeSource.test.ts`는 현재 Git 추적 전 파일 상태라 일반 `git diff`에는 표시되지 않을 수 있음. 파일 내용 기준으로 변경 완료.
- 커밋/푸시 안 함.
- 사용량 제한/쿼터 우회 없음.
