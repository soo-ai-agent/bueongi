import type { LatLng } from './routeCompare';
import { hasValidLatLng } from './routeCompare';
import { ShareExpiredError, updateShareLocation, type ShareClientOptions } from './shareSession';

/**
 * 공유 중 현재 위치 전송 루프(작업 5).
 *
 * 설계 기준(보호자 웹의 5초 폴링과 짝):
 * - 공유가 활성인 동안 앱이 5초마다 POST /share/{token}/location 으로 사용자 좌표를 보낸다.
 * - 위치를 못 얻거나(권한 거부/타임아웃) 좌표가 유효하지 않으면 그 틱만 건너뛰고 루프는 유지한다
 *   (한 번의 GPS 실패로 공유를 끊지 않는다 — 다음 틱에 복구될 수 있다).
 * - 서버가 만료/토큰부재(404 → ShareExpiredError)를 주면 더 보낼 필요가 없으므로 루프를 멈춘다.
 * - 일시적 네트워크 오류는 onError로 표면화하되 루프는 계속한다(거짓 "공유 종료" 금지).
 */

export const SHARE_LOCATION_INTERVAL_MS = 5000;

export type ShareLocationTickResult =
  | { status: 'sent'; location: LatLng }
  | { status: 'skipped'; reason: 'no-location' | 'invalid-location' }
  | { status: 'expired' }
  | { status: 'error'; error: unknown };

/** 현재 위치 공급자. null/throw 시 해당 틱은 전송을 건너뛴다. */
export type LocationProvider = () => Promise<LatLng | null> | LatLng | null;

export interface ShareLocationLoopOptions extends ShareClientOptions {
  /** 전송 1회당 좌표 공급자(GPS). */
  getLocation: LocationProvider;
  /** 전송 주기(ms). 기본 5초. */
  intervalMs?: number;
  /** 전송 성공 시 호출. */
  onSent?: (location: LatLng) => void;
  /** 공유 만료(서버 404) 시 호출. 이후 루프는 자동 중단된다. */
  onExpired?: () => void;
  /** 일시적 전송 실패 시 호출(루프는 계속). */
  onError?: (error: unknown) => void;
}

/**
 * 위치 전송 1회(순수 — 타이머 없이 단위 테스트 가능).
 * getLocation 실패/무효 좌표는 skip, 서버 만료는 expired, 그 외 오류는 error로 분류한다.
 */
export async function sendShareLocationOnce(
  token: string,
  options: ShareLocationLoopOptions,
): Promise<ShareLocationTickResult> {
  let location: LatLng | null;
  try {
    location = await options.getLocation();
  } catch {
    // GPS 권한/타임아웃 등 — 이 틱만 건너뛴다(루프 유지).
    return { status: 'skipped', reason: 'no-location' };
  }
  if (!location) return { status: 'skipped', reason: 'no-location' };
  if (!hasValidLatLng(location)) return { status: 'skipped', reason: 'invalid-location' };

  try {
    await updateShareLocation(token, location, options);
    return { status: 'sent', location };
  } catch (error) {
    if (error instanceof ShareExpiredError) return { status: 'expired' };
    return { status: 'error', error };
  }
}

export interface ShareLocationLoopHandle {
  /** 루프 중단(멱등). */
  stop: () => void;
  /** 진행 중 여부. */
  isRunning: () => boolean;
}

/**
 * 5초 간격 위치 전송 루프 시작. 즉시 1회 보낸 뒤 interval로 반복하고,
 * 만료(404)를 받으면 스스로 멈춘다. 반환된 handle.stop()으로 언마운트 시 중단한다.
 */
export function startShareLocationLoop(
  token: string,
  options: ShareLocationLoopOptions,
): ShareLocationLoopHandle {
  const intervalMs = options.intervalMs ?? SHARE_LOCATION_INTERVAL_MS;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const tick = async () => {
    if (stopped) return;
    const result = await sendShareLocationOnce(token, options);
    if (stopped) return;
    switch (result.status) {
      case 'sent':
        options.onSent?.(result.location);
        break;
      case 'expired':
        options.onExpired?.();
        stop(); // 더 보낼 필요 없음 — 루프 종료.
        break;
      case 'error':
        options.onError?.(result.error);
        break;
      case 'skipped':
        break;
    }
  };

  void tick(); // 진입 즉시 1회.
  timer = setInterval(() => {
    void tick();
  }, intervalMs);

  return { stop, isRunning: () => !stopped };
}
