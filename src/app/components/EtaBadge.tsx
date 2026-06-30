import { Clock } from 'lucide-react';
import { formatEta } from '../utils/eta';

/**
 * 길안내 화면 예상 도착 시간(ETA) 배지.
 *  minutes(분)를 "도착까지 약 N분"으로 표시. 데이터 없으면(0 이하) 렌더하지 않는다.
 */
export function EtaBadge({ minutes }: { minutes: number }) {
  const label = formatEta(minutes);
  if (!label) return null;
  return (
    <div
      data-testid="eta-badge"
      className="inline-flex items-center gap-1.5 bg-slate-900/70 backdrop-blur-md text-emerald-300 font-semibold text-sm px-4 py-2 rounded-full shadow-lg border border-emerald-400/30 pointer-events-auto"
    >
      <Clock className="w-4 h-4" />
      <span>도착까지 {label}</span>
    </div>
  );
}
