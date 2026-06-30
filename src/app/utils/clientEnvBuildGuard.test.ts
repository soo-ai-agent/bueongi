import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clientEnvBuildGuard } from './clientEnvBuildGuard';

/** 플러그인의 config 훅을 직접 호출(빌드 시 Vite가 부르는 진입점). */
function runConfigHook(cwd: string): void {
  const plugin = clientEnvBuildGuard(cwd);
  const hook = plugin.config;
  // Vite Plugin.config는 함수 또는 {handler} 객체일 수 있음 — 여기선 함수.
  if (typeof hook !== 'function') throw new Error('config 훅이 함수가 아님');
  hook({}, { command: 'build', mode: 'production' });
}

describe('clientEnvBuildGuard (빌드 타임 회귀 가드)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'cebg-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('allowlist 키만 있으면 통과', () => {
    writeFileSync(
      path.join(dir, '.env.production'),
      ['VITE_KAKAO_JS_KEY=jsk', 'VITE_TMAP_APP_KEY=tk', 'VITE_CDN_BASE_URL=https://cdn.x'].join('\n'),
    );
    expect(() => runConfigHook(dir)).not.toThrow();
  });

  it('VITE_ 키가 전혀 없으면 통과(인라인 대상 없음)', () => {
    writeFileSync(path.join(dir, '.env.production'), 'NOT_VITE_VAR=1\n');
    expect(() => runConfigHook(dir)).not.toThrow();
  });

  it('REST API 키가 인라인 대상이면 빌드 차단(throw)', () => {
    writeFileSync(
      path.join(dir, '.env.production'),
      ['VITE_KAKAO_JS_KEY=jsk', 'VITE_KAKAO_REST_API_KEY=leaky'].join('\n'),
    );
    expect(() => runConfigHook(dir)).toThrow(/server-side credential/);
  });

  it('allowlist 미등록 공개키도 빌드 차단(드리프트 가드)', () => {
    writeFileSync(path.join(dir, '.env.production'), 'VITE_NEW_PUBLIC_FLAG=1\n');
    expect(() => runConfigHook(dir)).toThrow(/허용 목록/);
  });
});
