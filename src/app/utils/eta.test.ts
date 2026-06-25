import { describe, it, expect } from 'vitest';
import { formatEta } from './eta';

describe('formatEta', () => {
  it('0 이하·비정상은 빈 문자열(배지 숨김)', () => {
    expect(formatEta(0)).toBe('');
    expect(formatEta(-5)).toBe('');
    expect(formatEta(Number.NaN)).toBe('');
    expect(formatEta(Infinity)).toBe('');
  });

  it('60분 미만은 "약 N분"(반올림)', () => {
    expect(formatEta(24)).toBe('약 24분');
    expect(formatEta(1)).toBe('약 1분');
    expect(formatEta(59.4)).toBe('약 59분');
  });

  it('60분 이상은 "약 H시간 M분"', () => {
    expect(formatEta(60)).toBe('약 1시간');
    expect(formatEta(90)).toBe('약 1시간 30분');
    expect(formatEta(125)).toBe('약 2시간 5분');
  });
});
