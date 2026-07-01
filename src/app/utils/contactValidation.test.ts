import { describe, it, expect } from 'vitest';
import { validateContactInput } from './contactValidation';

describe('validateContactInput', () => {
  it('이름·번호가 정상이면 통과하고 트림 결과를 돌려준다', () => {
    const r = validateContactInput('  엄마 ', ' 010-1234-5678 ');
    expect(r.ok).toBe(true);
    expect(r.name).toBe('엄마');
    expect(r.phone).toBe('010-1234-5678');
    expect(r.error).toBeUndefined();
  });

  it('이름 또는 번호가 비면 실패(안내 문구 포함)', () => {
    expect(validateContactInput('', '010-1234-5678').ok).toBe(false);
    expect(validateContactInput('엄마', '').ok).toBe(false);
    expect(validateContactInput('  ', '  ').error).toContain('모두 입력');
  });

  it('숫자 자릿수(9~11)를 벗어난 번호는 실패 — 발신 불가 번호 등록 차단', () => {
    // 숫자 외 문자(이름 오기재)는 자릿수 0 → 실패.
    expect(validateContactInput('엄마', '없음').ok).toBe(false);
    // 8자리 미만.
    expect(validateContactInput('엄마', '12345678').ok).toBe(false);
    // 12자리 초과.
    expect(validateContactInput('엄마', '012345678901').ok).toBe(false);
    expect(validateContactInput('엄마', '12345678').error).toContain('올바른 전화번호');
  });

  it('구분자(하이픈/공백/괄호)가 섞여도 숫자 9~11자리면 통과', () => {
    expect(validateContactInput('아빠', '02-123-4567').ok).toBe(true); // 9자리
    expect(validateContactInput('아빠', '010 1234 5678').ok).toBe(true); // 11자리
    expect(validateContactInput('아빠', '(031)123-4567').ok).toBe(true); // 10자리
  });
});
