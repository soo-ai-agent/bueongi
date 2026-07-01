import { useEffect, useRef, useState } from 'react';
import { createScreenWakeLock, type ScreenWakeLock } from '../utils/wakeLock';

/**
 * 화면 꺼짐 방지 훅. `active`가 true인 동안 Screen Wake Lock을 유지해(백그라운드 복귀 시 재요청 포함)
 * 길안내/공유 화면이 잠들지 않게 한다. 미지원 환경/요청 거부는 조용히 무시된다(안내 흐름 불방해).
 *
 * @returns supported = 이 기기가 Wake Lock을 지원하는지, active = 현재 잠금을 실제로 보유 중인지.
 */
export function useScreenWakeLock(active: boolean): { supported: boolean; active: boolean } {
  const lockRef = useRef<ScreenWakeLock | null>(null);
  const [locked, setLocked] = useState(false);
  const [supported, setSupported] = useState(false);

  // 마운트 시 1회 컨트롤러 생성, 언마운트 시 해제(리스너/잠금 정리).
  useEffect(() => {
    const lock = createScreenWakeLock({ onChange: setLocked });
    lockRef.current = lock;
    setSupported(lock.supported);
    return () => {
      void lock.disable();
      lockRef.current = null;
    };
  }, []);

  // active 토글에 따라 유지/해제.
  useEffect(() => {
    const lock = lockRef.current;
    if (!lock) return;
    if (active) void lock.enable();
    else void lock.disable();
  }, [active]);

  return { supported, active: locked };
}
