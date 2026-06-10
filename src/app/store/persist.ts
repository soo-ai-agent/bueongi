/**
 * localStorage 영속을 시도하고 성공 여부를 반환한다(silent swallow 금지).
 *
 * 안심귀가 앱에서 긴급 연락처·자주 가는 장소·목적지 저장이 실패(Safari 프라이빗 모드
 * quota≈0 / 용량 초과 / 정책 차단)했는데 호출부가 "등록됐어요"라고 단언하면,
 * 사용자는 저장된 줄 믿지만 새로고침 시 소실 → 위급 시 미전달(거짓 확신).
 * 호출부가 결과를 보고 정직하게 안내할 수 있도록 boolean으로 표면화한다.
 * raw DOMException(quota 등)은 노출하지 않는다.
 *
 * @returns true=저장 성공, false=저장 실패(비영속, in-memory만 유지됨)
 */
export function persistAppState(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
