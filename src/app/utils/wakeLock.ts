/**
 * 화면 꺼짐 방지(Screen Wake Lock) 컨트롤러 — 백그라운드 길안내의 웹 스택 핵심.
 *
 * 웹 앱은 네이티브처럼 완전한 백그라운드 실행이 불가능하다(탭이 숨겨지거나 화면이 꺼지면 JS·GPS가
 * 멈춘다). 그래서 길안내/공유 중에는 Screen Wake Lock으로 **화면이 꺼지지 않게** 유지해, 페이지가
 * 계속 보이는 상태로 GPS 추적과 안내가 이어지도록 한다(내비 앱의 표준 동작).
 *
 * Wake Lock은 문서가 숨겨지면(탭 전환/화면 잠금) 브라우저가 자동 해제한다. 그래서 visibilitychange로
 * 다시 보일 때 재요청한다. 순수 컨트롤러(navigator/document 주입 가능)라 시계·DOM 없이 단위 검증한다.
 */

/** navigator.wakeLock.request가 돌려주는 sentinel(최소 계약). */
export interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

export interface WakeLockNavigatorLike {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
}

export interface VisibilityDocLike {
  visibilityState: DocumentVisibilityState;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface ScreenWakeLock {
  /** 이 환경이 Screen Wake Lock을 지원하는지(navigator.wakeLock + document 존재). */
  readonly supported: boolean;
  /** 잠금 유지 시작(중복 호출 무해). 화면이 보이면 즉시 요청, 숨겨져 있으면 보일 때 요청한다. */
  enable(): Promise<void>;
  /** 잠금 해제 + visibility 리스너 정리. */
  disable(): Promise<void>;
  /** 현재 잠금을 실제로 보유 중인지(인디케이터/테스트용). */
  isActive(): boolean;
}

export interface WakeLockDeps {
  nav?: WakeLockNavigatorLike | null;
  doc?: VisibilityDocLike | null;
  /** 잠금 보유 상태가 바뀔 때 호출(UI 인디케이터 갱신용). */
  onChange?: (active: boolean) => void;
}

/** Screen Wake Lock 컨트롤러 생성. 의존성 미주입 시 전역 navigator/document를 쓴다(없으면 미지원). */
export function createScreenWakeLock(deps: WakeLockDeps = {}): ScreenWakeLock {
  const nav: WakeLockNavigatorLike | null =
    deps.nav ?? (typeof navigator !== 'undefined' ? (navigator as WakeLockNavigatorLike) : null);
  const doc: VisibilityDocLike | null =
    deps.doc ?? (typeof document !== 'undefined' ? (document as unknown as VisibilityDocLike) : null);
  const supported = !!(nav && nav.wakeLock && doc);

  let desired = false;
  let sentinel: WakeLockSentinelLike | null = null;
  let acquiring = false;
  let visBound = false;

  const isActive = () => !!sentinel && !sentinel.released;
  const notify = () => deps.onChange?.(isActive());

  const onVisibilityChange = () => {
    // 다시 보이면 재요청(숨김 중 브라우저가 자동 해제했을 수 있음).
    if (desired && doc && doc.visibilityState === 'visible') void acquire();
  };

  async function acquire(): Promise<void> {
    if (!supported || !desired || sentinel || acquiring) return;
    if (doc!.visibilityState !== 'visible') return; // 보일 때만 요청 가능
    acquiring = true;
    try {
      const s = await nav!.wakeLock!.request('screen');
      // 요청 대기 중 disable됐으면 즉시 반납.
      if (!desired) {
        void s.release().catch(() => {});
        return;
      }
      sentinel = s;
      s.addEventListener('release', () => {
        // 화면 숨김 등으로 풀리면 sentinel을 비우고, 다시 보일 때 onVisibilityChange가 재요청한다.
        sentinel = null;
        notify();
      });
      notify();
    } catch {
      // 권한/정책 거부 등 — 조용히 실패(활성 false 유지, 안내 흐름은 막지 않는다).
    } finally {
      acquiring = false;
    }
  }

  return {
    supported,
    async enable() {
      desired = true;
      if (!supported) return;
      if (!visBound) {
        doc!.addEventListener('visibilitychange', onVisibilityChange);
        visBound = true;
      }
      await acquire();
    },
    async disable() {
      desired = false;
      if (visBound && doc) {
        doc.removeEventListener('visibilitychange', onVisibilityChange);
        visBound = false;
      }
      const s = sentinel;
      sentinel = null;
      if (s && !s.released) {
        try {
          await s.release();
        } catch {
          /* 이미 해제됨 등 — 무해 */
        }
      }
      notify();
    },
    isActive,
  };
}
