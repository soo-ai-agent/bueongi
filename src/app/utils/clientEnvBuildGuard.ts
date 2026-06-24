import { loadEnv, type Plugin } from 'vite';
import { assertClientEnvSafe } from './clientEnv';

/**
 * 빌드 타임 가드 Vite 플러그인.
 *
 * Vite는 `VITE_*` 접두 env를 production 번들에 정적 인라인한다. 이 플러그인은 빌드가
 * 실제로 인라인할 키 집합을 모아 {@link assertClientEnvSafe}로 검증하고, server-only
 * credential(REST API 키·client secret·refresh token 등)이나 allowlist 미등록 키가
 * 섞이면 빌드를 즉시 실패시킨다. triplan SEC-KAKAO-REST-KEY-IN-BUNDLE(REST 키 번들
 * 노출) 버그 클래스가 bueongi에 재유입되는 것을 dist 산출 이전에 차단하는 회귀 가드.
 *
 * @param cwd 검사 기준 디렉터리(테스트 주입용; 기본 process.cwd()).
 */
export function clientEnvBuildGuard(cwd: string = process.cwd()): Plugin {
  return {
    name: 'client-env-build-guard',
    config(_config, { mode }) {
      // Vite가 실제로 인라인하는 대상과 동일하게 'VITE_' 접두 키만 수집.
      const injected = Object.keys(loadEnv(mode, cwd, 'VITE_'));
      // 인라인 대상이 없으면(키 미설정 CI 등) 노출 벡터 자체가 없으므로 통과.
      if (injected.length === 0) return;
      assertClientEnvSafe(injected);
    },
  };
}
