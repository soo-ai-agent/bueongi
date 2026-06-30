/**
 * 빌드 시 주입되는 환경변수 접근 단일 창구.
 *
 * 설계 원칙: 앱 직접 호출 우선. Tmap AppKey/서울 열린데이터 키는 빌드 시 주입되며
 * 로그에 남기지 않는다(키 자체를 반환만 하고 호출부가 마스킹). import.meta.env가 없는
 * 런타임(SSR/일부 테스트)에서는 process.env로 폴백한다.
 */

import type { ClientEnvKey } from './clientEnv';

// 클라이언트 번들 주입 허용 키의 단일 출처는 clientEnv.ts(CLIENT_ENV_ALLOWLIST).
// 여기서 별도 union을 두지 않고 거기서 파생해 드리프트를 막는다.
type EnvKey = ClientEnvKey;

function readEnv(key: EnvKey): string | undefined {
  // import.meta.env 우선(Vite 정적 주입), 없으면 process.env(테스트/Node).
  const metaEnv =
    typeof import.meta !== 'undefined'
      ? (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      : undefined;
  const fromMeta = metaEnv?.[key];
  if (typeof fromMeta === 'string' && fromMeta.length > 0) return fromMeta;

  const proc = typeof process !== 'undefined' ? (process as { env?: Record<string, string | undefined> }).env : undefined;
  const fromProc = proc?.[key];
  if (typeof fromProc === 'string' && fromProc.length > 0) return fromProc;

  return undefined;
}

/** Tmap 보행자 경로(E-1) AppKey. 미설정이면 직접 호출 불가 → 호출부가 백엔드/목업 폴백. */
export function getTmapAppKey(): string | undefined {
  return readEnv('VITE_TMAP_APP_KEY');
}

/** CDN 정적 JSON base URL. 끝의 슬래시를 정규화해 경로 조립을 결정적으로 만든다. */
export function getCdnBaseUrl(): string | undefined {
  const raw = readEnv('VITE_CDN_BASE_URL');
  if (!raw) return undefined;
  return raw.replace(/\/+$/, '');
}

/** 서울 열린데이터광장 A-1/A-2/A-3 인증키. 미설정이면 캐시/CDN 점수로만 추천. */
export function getSeoulOpenApiKey(): string | undefined {
  return readEnv('VITE_SEOUL_OPENAPI_KEY');
}

/** 위치 공유 서버 base URL. 미설정이면 공유 시작은 정적 폴백으로 동작. */
export function getShareApiBaseUrl(): string | undefined {
  const raw = readEnv('VITE_SHARE_API_BASE_URL');
  if (!raw) return undefined;
  return raw.replace(/\/+$/, '');
}

/** 키/시크릿을 로그에 남길 때 앞 6자리만 남기고 마스킹(설계 보안 기준). */
export function maskSecret(secret: string | undefined): string {
  if (!secret) return '(none)';
  if (secret.length <= 6) return `${secret[0] ?? ''}***`;
  return `${secret.slice(0, 6)}…`;
}
