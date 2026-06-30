import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CLIENT_ENV_ALLOWLIST,
  assertClientEnvSafe,
  isClientEnvAllowed,
  isServerOnlyEnvName,
} from './clientEnv';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, '../..'); // .../src

/** src 트리에서 `VITE_*` 식별자를 모두 수집(테스트 파일 제외). */
function collectViteEnvNamesInSrc(dir: string): Set<string> {
  const found = new Set<string>();
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      for (const n of collectViteEnvNamesInSrc(full)) found.add(n);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) continue;
    const text = readFileSync(full, 'utf8');
    for (const m of text.matchAll(/VITE_[A-Z0-9_]+/g)) found.add(m[0]);
  }
  return found;
}

describe('CLIENT_ENV_ALLOWLIST 무결성', () => {
  it('vite-env.d.ts에 선언된 VITE_ 키와 정확히 일치', () => {
    const dts = readFileSync(path.join(srcRoot, 'vite-env.d.ts'), 'utf8');
    const declared = new Set(Array.from(dts.matchAll(/readonly (VITE_[A-Z0-9_]+)\??:/g), (m) => m[1]));
    expect([...declared].sort()).toEqual([...CLIENT_ENV_ALLOWLIST].sort());
  });

  it('src에서 실제 참조되는 모든 VITE_ 키가 allowlist에 등록돼 있다', () => {
    const used = collectViteEnvNamesInSrc(srcRoot);
    const unregistered = [...used].filter((n) => !(CLIENT_ENV_ALLOWLIST as readonly string[]).includes(n));
    expect(unregistered).toEqual([]);
  });

  it('allowlist의 어떤 키도 server-only credential 패턴에 걸리지 않는다', () => {
    const leaky = CLIENT_ENV_ALLOWLIST.filter(isServerOnlyEnvName);
    expect(leaky).toEqual([]);
  });
});

describe('isServerOnlyEnvName (server-side credential 차단)', () => {
  it('Kakao REST API 키는 클라이언트 금지(=triplan SEC-KAKAO-REST-KEY 회귀 가드)', () => {
    expect(isServerOnlyEnvName('VITE_KAKAO_REST_API_KEY')).toBe(true);
  });

  it.each([
    'VITE_KAKAO_CLIENT_SECRET',
    'VITE_APP_SECRET',
    'VITE_GCP_PRIVATE_KEY',
    'VITE_SERVICE_ACCOUNT_JSON',
    'VITE_AUTH_REFRESH_TOKEN',
    'VITE_SEOUL_ADMIN_KEY',
  ])('%s 는 server-only로 차단', (name) => {
    expect(isServerOnlyEnvName(name)).toBe(true);
  });

  it('공개 설계 키(JS 키/AppKey/base URL)는 server-only가 아니다', () => {
    expect(isServerOnlyEnvName('VITE_KAKAO_JS_KEY')).toBe(false);
    expect(isServerOnlyEnvName('VITE_TMAP_APP_KEY')).toBe(false);
    expect(isServerOnlyEnvName('VITE_CDN_BASE_URL')).toBe(false);
  });
});

describe('isClientEnvAllowed / assertClientEnvSafe', () => {
  it('allowlist 키는 허용', () => {
    expect(isClientEnvAllowed('VITE_KAKAO_JS_KEY')).toBe(true);
  });

  it('미등록/서버전용 키는 불허', () => {
    expect(isClientEnvAllowed('VITE_KAKAO_REST_API_KEY')).toBe(false);
    expect(isClientEnvAllowed('VITE_UNKNOWN')).toBe(false);
  });

  it('현재 allowlist 전체는 안전 검증 통과', () => {
    expect(() => assertClientEnvSafe([...CLIENT_ENV_ALLOWLIST])).not.toThrow();
  });

  it('REST 키가 섞이면 throw', () => {
    expect(() => assertClientEnvSafe(['VITE_KAKAO_JS_KEY', 'VITE_KAKAO_REST_API_KEY'])).toThrow(
      /server-side credential/,
    );
  });

  it('미등록 공개키도 throw(드리프트 차단)', () => {
    expect(() => assertClientEnvSafe(['VITE_NEW_PUBLIC_FLAG'])).toThrow(/허용 목록/);
  });
});
