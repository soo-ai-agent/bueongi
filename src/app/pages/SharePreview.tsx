import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, MapPin, Loader2, Clock, ShieldAlert, ShieldCheck, RefreshCw, WifiOff, Eye, EyeOff } from 'lucide-react';
import { RouteMap } from '../components/map/RouteMap';
import { useApp } from '../store/appStore';
import { getShareOwnerView, isShareApiConfigured, type ShareOwnerView } from '../utils/shareSession';
import {
  deriveState,
  isLocationStale,
  headerSubtitle,
  formatUpdatedAt,
  GUARDIAN_POLL_INTERVAL_MS,
  type GuardianState,
} from './GuardianShare';

/**
 * 관리자(공유한 사용자 본인) 전용 미리보기 — 보호자에게 보이는 실시간 화면을 '따로' 본다.
 *
 * 보호자 페이지(GuardianShare)와 다른 점:
 * - 토큰을 URL 파라미터가 아니라 진행 중인 공유(activeShare)의 owner_secret 으로 조회한다.
 * - GET /location(시청자 집계) 대신 POST /watching(owner_secret) 으로 폴링한다 →
 *   관리자 본인 미리보기가 길안내 화면의 '부엉이 동행 중' 알림을 만들지 않는다(시청자 미집계).
 * - 보호자가 지금 보고 있는지(watching)도 함께 표시한다.
 *
 * 상태 머신/신선도/표시 문구는 보호자 페이지와 동일 헬퍼(deriveState/isLocationStale/headerSubtitle)를 재사용한다.
 */
export function SharePreview() {
  const navigate = useNavigate();
  const { activeShare } = useApp();
  const [view, setView] = useState<ShareOwnerView | null>(null);
  const [baseState, setBaseState] = useState<GuardianState>('loading');
  const [now, setNow] = useState<number>(() => Date.now());
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!activeShare || !isShareApiConfigured()) return;
    stoppedRef.current = false;

    const pollOnce = async () => {
      try {
        const res = await getShareOwnerView(activeShare.token, activeShare.ownerSecret);
        if (stoppedRef.current) return;
        setView(res);
        setBaseState(deriveState(res));
      } catch {
        if (stoppedRef.current) return;
        // 일시적 네트워크 오류: 마지막 위치를 지우지 않고 error 로 표기(보호자 페이지와 동일).
        setBaseState('error');
      }
    };

    void pollOnce();
    const poll = setInterval(() => void pollOnce(), GUARDIAN_POLL_INTERVAL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stoppedRef.current = true;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [activeShare]);

  // 진행 중인 공유가 없으면(공유 시작 전/종료 후) 미리볼 대상이 없다 — 정직하게 안내한다.
  if (!activeShare) {
    return (
      <PreviewShell onBack={() => navigate('/share')}>
        <EmptyState
          icon={<ShieldAlert className="w-8 h-8 text-slate-400" />}
          title="진행 중인 공유가 없어요"
          desc="먼저 보호자에게 위치를 공유하면, 보호자에게 보이는 화면을 여기서 미리볼 수 있어요."
        />
      </PreviewShell>
    );
  }

  // 공유 서버 미설정(정적 폴백 모드)에서는 라이브 위치가 없으므로 미리보기도 동작하지 않는다.
  if (!isShareApiConfigured()) {
    return (
      <PreviewShell onBack={() => navigate(-1)}>
        <EmptyState
          icon={<WifiOff className="w-8 h-8 text-slate-400" />}
          title="실시간 미리보기를 사용할 수 없어요"
          desc="위치 공유 서버가 설정되지 않아 실시간 위치를 받을 수 없습니다."
        />
      </PreviewShell>
    );
  }

  // live 지만 마지막 갱신이 오래됐으면 '실시간'을 내리고 stale 로 표기(보호자 화면과 동일 기준).
  const effectiveState: GuardianState =
    baseState === 'live' && isLocationStale(view?.updatedAt ?? null, now) ? 'stale' : baseState;

  const hasLocation = view?.lat != null && view?.lng != null;
  const location = hasLocation ? { lat: view!.lat as number, lng: view!.lng as number } : null;
  const guardianWatching = view?.watching === true;

  return (
    <PreviewShell onBack={() => navigate(-1)} subtitle={headerSubtitle(effectiveState)}>
      {/* 관리자 미리보기 안내 — 보호자에게 보이는 화면이며, 이 보기는 시청자로 집계되지 않음을 명시 */}
      <div className="px-4 pt-3">
        <div className="bg-blue-500/15 border border-blue-500/30 rounded-2xl px-4 py-3 flex items-start gap-2.5">
          <ShieldCheck className="w-5 h-5 text-blue-300 shrink-0 mt-0.5" />
          <p className="text-blue-100 text-sm leading-snug">
            보호자에게 보이는 화면이에요. 이 미리보기는 보호자 시청으로 집계되지 않아요.
          </p>
        </div>
      </div>

      {/* 보호자가 지금 보고 있는지 */}
      <div className="px-4 pt-2.5 pb-1">
        {guardianWatching ? (
          <div
            data-testid="preview-guardian-watching"
            className="flex items-center gap-2 text-emerald-300 text-sm font-bold"
          >
            <Eye className="w-4 h-4" />
            보호자가 함께 보는 중
          </div>
        ) : (
          <div
            data-testid="preview-guardian-idle"
            className="flex items-center gap-2 text-slate-400 text-sm font-medium"
          >
            <EyeOff className="w-4 h-4" />
            현재 보고 있는 보호자 없음
          </div>
        )}
      </div>

      <div className="relative flex-1 min-h-0">
        {effectiveState !== 'expired' && (
          <RouteMap destination={location} showRoute={false} active={effectiveState === 'live'} />
        )}

        {effectiveState === 'loading' && (
          <StatusOverlay testid="preview-loading" icon={<Loader2 className="w-8 h-8 text-blue-300 animate-spin" />} title="위치를 불러오는 중" desc="잠시만 기다려 주세요." />
        )}
        {effectiveState === 'waiting' && (
          <StatusOverlay testid="preview-waiting" icon={<Clock className="w-8 h-8 text-amber-300" />} title="아직 위치를 받는 중" desc="이동을 시작하면 위치가 표시됩니다." />
        )}
        {effectiveState === 'stale' && (
          <div className="absolute inset-x-0 top-0 z-30 p-4" data-testid="preview-stale">
            <div className="bg-amber-500/15 border border-amber-500/40 rounded-2xl p-3 flex items-center gap-2.5">
              <WifiOff className="w-5 h-5 text-amber-300 shrink-0" />
              <p className="text-amber-100 text-sm leading-snug">실시간 갱신이 끊겼어요. 아래는 마지막으로 받은 위치입니다.</p>
            </div>
          </div>
        )}
        {effectiveState === 'expired' && (
          <StatusOverlay testid="preview-expired" icon={<ShieldAlert className="w-8 h-8 text-rose-300" />} title="공유가 종료되었어요" desc="공유 시간이 만료되었거나 중단되었습니다." />
        )}
        {effectiveState === 'error' && (
          <div className="absolute inset-x-0 bottom-0 z-30 p-4">
            <div className="bg-slate-700/95 border border-slate-600 rounded-2xl p-4 flex items-center gap-2 text-slate-200 text-sm">
              <RefreshCw className="w-4 h-4 text-amber-300" />
              연결이 일시적으로 끊겼어요. 다시 연결하는 중…
            </div>
          </div>
        )}
      </div>

      {(effectiveState === 'live' || effectiveState === 'stale' || effectiveState === 'waiting') && (
        <div className="px-4 py-3 border-t border-slate-700 bg-slate-800 flex items-center justify-between">
          <span className="text-slate-400 text-sm">마지막 갱신</span>
          <span className="text-slate-100 font-medium text-sm" data-testid="preview-updated-at">
            {formatUpdatedAt(view?.updatedAt ?? null, now)}
          </span>
        </div>
      )}
    </PreviewShell>
  );
}

function PreviewShell({
  children,
  onBack,
  subtitle,
}: {
  children: React.ReactNode;
  onBack: () => void;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col h-full bg-slate-800" data-testid="share-preview">
      <header className="px-4 py-4 pt-6 border-b border-slate-700 bg-slate-800">
        <div className="flex items-center gap-2">
          <button onClick={onBack} aria-label="뒤로 가기" className="p-1.5 -ml-1.5 text-slate-300 hover:text-slate-50 rounded-full hover:bg-slate-700">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <MapPin className="w-5 h-5 text-blue-300" />
          <h1 className="text-lg font-bold text-slate-50">관리자 미리보기</h1>
        </div>
        {subtitle && <p className="text-slate-400 text-sm mt-1 pl-8">{subtitle}</p>}
      </header>
      {children}
    </div>
  );
}

function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex-1 flex items-center justify-center text-center px-8">
      <div className="flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center">{icon}</div>
        <h2 className="text-slate-50 font-bold text-xl">{title}</h2>
        <p className="text-slate-300 text-sm leading-relaxed">{desc}</p>
      </div>
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
