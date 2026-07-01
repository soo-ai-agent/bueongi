import { CheckCircle2, FlaskConical } from 'lucide-react';
import { cn } from './utils';

/**
 * 데이터 출처 상태 배지(P0-1). 안전점수·마커·경로가 실 공공데이터 기반인지,
 * 폴백(키 미설정·쿼터 초과·네트워크 실패)으로 예시 데이터를 보여주는 중인지 시각적으로 구분한다.
 * 무음 폴백 금지 — 폴백이면 반드시 이 배지(variant="fallback")가 화면에 떠야 한다.
 */
export function SourceBadge({ variant, className }: { variant: 'live' | 'fallback'; className?: string }) {
  const live = variant === 'live';
  return (
    <span
      data-testid={live ? 'source-badge-live' : 'source-badge-fallback'}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap',
        live
          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
          : 'bg-amber-500/15 text-amber-300 border border-amber-500/40',
        className,
      )}
    >
      {live ? <CheckCircle2 className="w-3 h-3" /> : <FlaskConical className="w-3 h-3" />}
      {live ? '실데이터' : '예시 데이터'}
    </span>
  );
}
