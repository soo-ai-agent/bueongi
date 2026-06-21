import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { MapPin, Loader2, Clock, ShieldAlert, RefreshCw } from 'lucide-react';
import { RouteMap } from '../components/map/RouteMap';
import { getShareLocation, type ShareLocationResponse } from '../utils/shareSession';

/**
 * 보호자 위치 공유 지도 페이지(작업 5).
 *
 * 설계 기준:
 * - 로그인 없이 공유 URL(/share/{token})만으로 접근.
 * - 5초마다 GET /share/{token}/location 폴링, 탭/페이지 종료(언마운트) 시 중단.
 * - 상태 머신: loading → live | waiting | expired | error. 위치 미수신/만료에도 깨진 지도 대신 안내.
 * - 보호자 등록/페어링/푸시 없음.
 */

export const GUARDIAN_POLL_INTERVAL_MS = 5000;

type GuardianState = 'loading' | 'live' | 'waiting' | 'expired' | 'error';

interface GuardianView {
  state: GuardianState;
  lat: number | null;
  lng: number | null;
  updatedAt: string | null;
}

export function deriveState(res: ShareLocationResponse): GuardianState {
  if (res.expired) return 'expired';
  if (res.lat === null || res.lng === null) return 'waiting';
  return 'live';
}

export function formatUpdatedAt(updatedAt: string | null, now: number): string {
  if (!updatedAt) return '아직 위치 없음';
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return '갱신 시각 미상';
  const diffSec = Math.max(0, Math.round((now - ts) / 1000));
  if (diffSec < 10) return '방금 전';
  if (diffSec < 60) return `${diffSec}초 전`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  return `${Math.floor(diffSec / 3600)}시간 전`;
}

export function GuardianShare() {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<GuardianView>({ state: 'loading', lat: null, lng: null, updatedAt: null });
  const [now, setNow] = useState<number>(() => Date.now());
  const stoppedRef = useRef(false);

  async function pollOnce(): Promise<void> {
    if (!token) {
      setView({ state: 'error', lat: null, lng: null, updatedAt: null });
      return;
    }
    try {
      const res = await getShareLocation(token);
      if (stoppedRef.current) return;
      setView({ state: deriveState(res), lat: res.lat, lng: res.lng, updatedAt: res.updatedAt });
    } catch {
      if (stoppedRef.current) return;
      // 네트워크 일시 오류: 마지막 위치를 지우지 않고 error 상태로 수동 새로고침 유도.
      setView((prev) => ({ ...prev, state: 'error' }));
    }
  }

  useEffect(() => {
    stoppedRef.current = false;
    void pollOnce();
    const poll = setInterval(() => {
      void pollOnce();
    }, GUARDIAN_POLL_INTERVAL_MS);
    // 상대 시간 표시 갱신용 1초 틱.
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stoppedRef.current = true;
      clearInterval(poll);
      clearInterval(tick);
    };
    // token이 바뀌면 새로 폴링 시작.
  }, [token]);

  const hasLocation = view.lat !== null && view.lng !== null;
  const location = hasLocation ? { lat: view.lat as number, lng: view.lng as number } : null;

  return (
    <div className="flex flex-col h-full bg-slate-800" data-testid="guardian-share">
      <header className="px-4 py-4 pt-6 border-b border-slate-700 bg-slate-800">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-blue-300" />
          <h1 className="text-lg font-bold text-slate-50">실시간 위치 공유</h1>
        </div>
        <p className="text-slate-400 text-sm mt-1">보호자에게 공유된 안심귀가 위치입니다 · 5초마다 갱신</p>
      </header>

      <div className="relative flex-1 min-h-0">
        {/* live/waiting/error는 지도를 유지하고, expired만 지도를 가린다(깨진 지도 방지). */}
        {view.state !== 'expired' && (
          <RouteMap destination={location} showRoute={false} active={view.state === 'live'} />
        )}

        {/* 상태 오버레이 */}
        {view.state === 'loading' && (
          <StatusOverlay testid="guardian-loading" icon={<Loader2 className="w-8 h-8 text-blue-300 animate-spin" />} title="위치를 불러오는 중" desc="잠시만 기다려 주세요." />
        )}
        {view.state === 'waiting' && (
          <StatusOverlay testid="guardian-waiting" icon={<Clock className="w-8 h-8 text-amber-300" />} title="아직 위치를 받는 중" desc="공유자가 이동을 시작하면 위치가 표시됩니다." />
        )}
        {view.state === 'expired' && (
          <StatusOverlay testid="guardian-expired" icon={<ShieldAlert className="w-8 h-8 text-rose-300" />} title="공유가 종료되었어요" desc="공유 시간이 만료되었거나 중단되었습니다." />
        )}
        {view.state === 'error' && (
          <div className="absolute inset-x-0 bottom-0 z-30 p-4">
            <div className="bg-slate-700/95 border border-slate-600 rounded-2xl p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-slate-200 text-sm">
                <RefreshCw className="w-4 h-4 text-amber-300" />
                연결이 일시적으로 끊겼어요.
              </div>
              <button
                data-testid="guardian-retry"
                onClick={() => void pollOnce()}
                className="px-3 py-1.5 rounded-full bg-blue-500 text-white text-sm font-medium active:scale-95"
              >
                새로고침
              </button>
            </div>
          </div>
        )}
      </div>

      {(view.state === 'live' || view.state === 'waiting') && (
        <div className="px-4 py-3 border-t border-slate-700 bg-slate-800 flex items-center justify-between">
          <span className="text-slate-400 text-sm">마지막 갱신</span>
          <span className="text-slate-100 font-medium text-sm" data-testid="guardian-updated-at">
            {formatUpdatedAt(view.updatedAt, now)}
          </span>
        </div>
      )}
    </div>
  );
}

function StatusOverlay({ testid, icon, title, desc }: { testid: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div data-testid={testid} className="absolute inset-0 z-30 flex items-center justify-center bg-slate-800/85 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 text-center px-8">
        {icon}
        <h2 className="text-slate-50 font-bold text-xl">{title}</h2>
        <p className="text-slate-300 text-sm">{desc}</p>
      </div>
    </div>
  );
}
