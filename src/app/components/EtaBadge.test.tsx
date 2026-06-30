import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { EtaBadge } from './EtaBadge';

describe('EtaBadge', () => {
  it('minutes>0 이면 "도착까지 약 N분" 배지를 렌더한다', () => {
    const html = renderToString(<EtaBadge minutes={24} />);
    expect(html).toContain('eta-badge');
    expect(html).toContain('도착까지');
    expect(html).toContain('약 24분');
  });

  it('minutes<=0 이면 렌더하지 않는다(배지 숨김)', () => {
    expect(renderToString(<EtaBadge minutes={0} />)).toBe('');
    expect(renderToString(<EtaBadge minutes={-3} />)).toBe('');
  });

  it('60분 이상은 "약 H시간 M분"으로 표시', () => {
    expect(renderToString(<EtaBadge minutes={90} />)).toContain('약 1시간 30분');
  });
});
