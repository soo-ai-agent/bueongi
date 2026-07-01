/**
 * 보호자(긴급 연락처) 입력 검증 — 온보딩 등록 단계와 긴급 연락처 관리 화면이 공유한다.
 *
 * 위급 시 실제 발신 가능한 번호만 등록되게 한다: 숫자 외 입력(이름 오기재 등)이 등록되면
 * 긴급 도움 시트의 tel: 링크가 빈 번호가 되어 전화가 걸리지 않는다. 한국 휴대/유선 번호는
 * 숫자만 9~11자리다(지역번호 포함). 순수 함수라 시계·DOM 없이 단위 검증한다.
 */

export interface ContactValidationResult {
  /** 검증 통과 여부 */
  ok: boolean;
  /** 트림된 이름 */
  name: string;
  /** 트림된 전화번호(표시 원문 유지 — tel: 링크는 발신 직전 숫자만 남긴다) */
  phone: string;
  /** ok=false일 때 사용자에게 보여줄 안내. ok=true면 없음 */
  error?: string;
}

/** 숫자만 남긴 전화번호 자릿수 허용 범위(한국 유선/휴대). */
export const PHONE_MIN_DIGITS = 9;
export const PHONE_MAX_DIGITS = 11;

/** 이름·전화번호를 검증해 트림 결과와 통과 여부를 돌려준다(호출부는 error를 그대로 안내). */
export function validateContactInput(nameRaw: string, phoneRaw: string): ContactValidationResult {
  const name = nameRaw.trim();
  const phone = phoneRaw.trim();
  if (!name || !phone) {
    return { ok: false, name, phone, error: '이름과 전화번호를 모두 입력해 주세요.' };
  }
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length < PHONE_MIN_DIGITS || digits.length > PHONE_MAX_DIGITS) {
    return { ok: false, name, phone, error: '올바른 전화번호를 입력해 주세요. (예: 010-1234-5678)' };
  }
  return { ok: true, name, phone };
}
