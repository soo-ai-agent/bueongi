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

/**
 * 안심귀가 진행 상태를 보호자에게 공유할 메시지 본문을 만든다.
 * 목적지를 포함해 수신자가 행선지를 알 수 있게 한다(빈 목적지는 안전 기본 라벨로 폴백).
 */
export function buildReturnShareText(destName: string): string {
  const where = destName.trim() || '목적지';
  return `[부엉이 안심귀가] ${where}(으)로 이동 중입니다. 실시간 위치를 확인해 주세요.`;
}

/**
 * 보호자에게 보낼 안심귀가 공유 전문(메시지 + 선택적 위치 링크)을 정직하게 합성한다.
 *
 * - liveLocationUrl이 있으면: "실시간 위치를 확인해 주세요" 약속 + 링크를 포함한다.
 * - liveLocationUrl이 없으면(공유 서버 미설정/토큰 생성 실패): 약속도 링크도 넣지 않고
 *   이동 사실만 전한다. 토큰 없는 `/share`는 발신자 본인 화면으로 라우팅되므로,
 *   보호자가 열면 위치 대신 무의미한 화면이 떠 "실시간 위치 확인" 약속이 거짓이 된다 —
 *   그 거짓 확신/깨진 링크를 원천 차단한다.
 */
export function composeReturnShareMessage(destName: string, liveLocationUrl: string | null): string {
  const url = liveLocationUrl?.trim();
  if (url) {
    return `${buildReturnShareText(destName)}\n${url}`;
  }
  const where = destName.trim() || '목적지';
  return `[부엉이 안심귀가] ${where}(으)로 이동 중입니다.`;
}

/**
 * 위급 상황 긴급 메시지를 보호자에게 보낼 전문(메시지 + 선택적 위치 링크)으로 합성한다.
 *
 * composeReturnShareMessage와 동일한 정직성 계약을 따른다:
 * - liveLocationUrl이 실제 토큰 링크면 메시지 + 링크를 함께 보낸다.
 * - 없으면(토큰 미생성/공유 서버 미설정) 링크를 붙이지 않는다. 토큰 없는 `/share`는
 *   발신자 본인 화면(ShareStatus)으로 라우팅되므로, 위급 상황에서 보호자가 열면
 *   위치 지도 대신 무의미한 화면이 떠 깨진 링크 + 거짓 "위치 링크" 약속이 된다 —
 *   그 거짓 확신을 원천 차단하고 긴급 사실만 정직하게 전한다.
 */
export function composeEmergencyShareMessage(destName: string, liveLocationUrl: string | null): string {
  const text = buildEmergencyShareText(destName);
  const url = liveLocationUrl?.trim();
  return url ? `${text}\n${url}` : text;
}

/**
 * 귀가 완료 메시지를 보호자에게 보낼 전문(메시지 + 선택적 위치 링크)으로 합성한다.
 * composeEmergencyShareMessage와 동일하게, 실제 토큰 링크가 없으면 깨진 `/share` 링크를
 * 붙이지 않고 도착 사실만 전한다.
 */
export function composeArrivalShareMessage(destName: string, liveLocationUrl: string | null): string {
  const text = buildArrivalShareText(destName);
  const url = liveLocationUrl?.trim();
  return url ? `${text}\n${url}` : text;
}

/**
 * 귀가 완료를 보호자에게 알릴 메시지 본문을 만든다.
 * 목적지를 포함해 수신자가 어디에 도착했는지 알 수 있게 한다(빈 목적지는 안전 기본 라벨로 폴백).
 * (기존엔 NavigationScreen 인라인 문자열이라 미테스트였고, 목적지 미선택 시 "목적지에 도착"이라는
 *  의미 없는 위치를 보호자에게 보낼 수 있었다 — 호출부 가드 + 이 util로 회귀 방어.)
 */
export function buildArrivalShareText(destName: string): string {
  const where = destName.trim() || '목적지';
  return `[부엉이 안심귀가] ${where}에 안전하게 도착했습니다.`;
}

/**
 * 도착 예정시각이 지났는데 아직 이동 중일 때(미도착 안전망) 보호자에게 보낼 메시지 본문을 만든다.
 * 목적지를 포함해 수신자가 행선지를 알 수 있게 한다(빈 목적지는 안전 기본 라벨로 폴백).
 */
export function buildRunningLateShareText(destName: string): string {
  const where = destName.trim() || '목적지';
  return `[부엉이 안심귀가] ${where} 도착 예정 시간이 지났어요. 아직 이동 중이니 위치를 확인해 주세요.`;
}

/**
 * 미도착 안전망 알림을 보호자에게 보낼 전문(메시지 + 선택적 위치 링크)으로 합성한다.
 * composeArrivalShareMessage와 동일한 정직성 계약: 실제 공유 링크가 있으면 붙이고,
 * 없으면(공유 미시작) 링크 없이 지연 사실만 전한다.
 */
export function composeRunningLateShareMessage(destName: string, liveLocationUrl: string | null): string {
  const text = buildRunningLateShareText(destName);
  const url = liveLocationUrl?.trim();
  return url ? `${text}\n${url}` : text;
}
