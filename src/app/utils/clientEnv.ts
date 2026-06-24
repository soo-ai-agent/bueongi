/**
 * 클라이언트 번들에 노출돼도 되는 환경변수의 단일 허용 목록(allowlist) + 가드.
 *
 * 배경: Vite는 `VITE_*` 접두 env를 production 번들에 정적 인라인한다. 따라서
 * server-side credential(예: OAuth REST API 키, client secret, refresh token)을
 * 실수로 `VITE_` 이름으로 추가하면 번들에서 그대로 추출 가능해진다.
 *
 * 설계 원칙(앱 직접 호출 우선): 아래 키들은 "브라우저가 직접 호출"하도록 의도적으로
 * 번들에 주입한다. JS 앱키/AppKey/공개 base URL 류만 허용하며, 토큰 교환용 비밀키는
 * 절대 클라이언트에 두지 않는다. 새 키 추가 시 반드시 이 목록을 갱신해야 하고,
 * server-only 패턴(아래 SERVER_ONLY_ENV_PATTERNS)에 걸리면 가드/테스트가 막는다.
 */

/** 클라이언트 번들 주입이 허용된 env 키(설계상 공개/직접호출 전제). */
export const CLIENT_ENV_ALLOWLIST = [
  'VITE_KAKAO_JS_KEY', // Kakao Maps JavaScript 키(공개 설계). REST 키 아님.
  'VITE_TMAP_APP_KEY', // Tmap 보행자 경로 AppKey. 앱이 직접 호출(서버 프록시 금지).
  'VITE_CDN_BASE_URL', // 정적 안심 데이터 CDN base URL(공개).
  'VITE_SEOUL_OPENAPI_KEY', // 서울 열린데이터 Open API 인증키. 앱 직접 호출 + 로컬 캐시.
  'VITE_SHARE_API_BASE_URL', // 위치 공유 서버 base URL(공개).
] as const;

export type ClientEnvKey = (typeof CLIENT_ENV_ALLOWLIST)[number];

/**
 * "클라이언트 번들에 절대 들어가면 안 되는" server-side credential 이름 패턴.
 * triplan-frontend의 SEC-KAKAO-REST-KEY-IN-BUNDLE(REST API 키 노출)과 동일한
 * 버그 클래스를 bueongi에서 선제 차단한다.
 */
export const SERVER_ONLY_ENV_PATTERNS: readonly RegExp[] = [
  /REST_API_KEY$/i,
  /CLIENT_SECRET$/i,
  /(^|_)SECRET($|_)/i,
  /PRIVATE_KEY$/i,
  /SERVICE_ACCOUNT/i,
  /REFRESH_TOKEN$/i,
  /ADMIN_KEY$/i,
];

/** 이름만으로 server-only credential로 판별되면 true(클라이언트 번들 금지 대상). */
export function isServerOnlyEnvName(name: string): boolean {
  return SERVER_ONLY_ENV_PATTERNS.some((re) => re.test(name));
}

/** 키가 클라이언트 번들에 주입돼도 되는지(allowlist 소속 + server-only 아님). */
export function isClientEnvAllowed(name: string): name is ClientEnvKey {
  if (isServerOnlyEnvName(name)) return false;
  return (CLIENT_ENV_ALLOWLIST as readonly string[]).includes(name);
}

/**
 * 주어진 env 키 집합이 클라이언트 번들 안전 규칙을 지키는지 검증. 위반 시 throw.
 * 빌드 전/테스트에서 dist 인라인 대상 키를 넘겨 회귀를 막는 용도.
 */
export function assertClientEnvSafe(names: readonly string[]): void {
  const serverOnly = names.filter(isServerOnlyEnvName);
  if (serverOnly.length > 0) {
    throw new Error(
      `server-side credential이 클라이언트 번들에 노출될 수 있습니다(금지): ${serverOnly.join(', ')}`,
    );
  }
  const notAllowed = names.filter((n) => !(CLIENT_ENV_ALLOWLIST as readonly string[]).includes(n));
  if (notAllowed.length > 0) {
    throw new Error(
      `허용 목록(CLIENT_ENV_ALLOWLIST)에 없는 클라이언트 env 키: ${notAllowed.join(', ')}`,
    );
  }
}
