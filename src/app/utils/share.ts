/**
 * Web Share API(navigator.share) 실패가 사용자 취소(정상 흐름)인지 판정한다.
 *
 * 취소(AbortError)면 true → 호출부는 조용히 종료한다.
 * 그 외 실제 오류(NotAllowedError/DataError/네트워크 등)면 false → 호출부는 클립보드 등으로 폴백해야 한다.
 *
 * 안심귀가 앱에서 실제 오류를 "취소"로 삼키면 보호자에게 위치/메시지가 미전달인데
 * 사용자는 공유된 줄 착각하는 거짓 확신이 발생하므로 분기가 필수다.
 */
export function isUserCancelledShare(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: unknown }).name === 'AbortError'
  );
}

export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'failed';

/**
 * 메시지를 Web Share API로 공유하고, 미지원/실제 오류 시 클립보드 복사로 폴백한다.
 * 결과를 정직하게 반환해 호출부가 거짓 확신("전송했습니다") 없이 실제 처리 결과를 안내할 수 있게 한다.
 *  - 'shared'    : 공유 시트로 실제 전달됨
 *  - 'cancelled' : 사용자가 공유를 취소(정상) → 폴백하지 않음
 *  - 'copied'    : 공유 불가/실패로 클립보드에 복사됨(사용자가 직접 전달 필요)
 *  - 'failed'    : 공유·복사 모두 실패
 */
export async function shareOrCopyText(opts: {
  title: string;
  text: string;
  url?: string;
}): Promise<ShareOutcome> {
  const fullText = opts.url ? `${opts.text}\n${opts.url}` : opts.text;

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: opts.title, text: opts.text, url: opts.url });
      return 'shared';
    } catch (err) {
      if (isUserCancelledShare(err)) return 'cancelled';
      // 실제 오류는 아래 클립보드 폴백으로 이어진다(raw 에러는 노출하지 않음).
    }
  }

  try {
    await navigator.clipboard.writeText(fullText);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/**
 * 위급 상황에서 보호자에게 보낼 긴급 메시지 본문을 만든다.
 * 목적지를 반드시 포함해 수신자가 사용자의 행선지를 알 수 있게 한다(안전 회귀 가드 대상).
 */
export function buildEmergencyShareText(destName: string): string {
  const where = destName.trim() || '목적지 미상';
  return `[부엉이 긴급] 도움이 필요합니다. 목적지: ${where}`;
}
