import { MapMock } from '../components/map/MapMock';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Button } from '../components/ui/Button';
import { Phone, AlertCircle, MapPin, Search, PhoneCall, Share2, CheckCircle2, Home as HomeIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { useApp } from '../store/appStore';
import { shareOrCopyText, buildEmergencyShareText, buildArrivalShareText } from '../utils/share';
import { mockRoutes } from './RouteComparison';
import { resolveRoute, parseEtaMinutes, getRouteDestinationContext } from '../utils/routeSelection';

const sanitizePhone = (phone: string) => phone.replace(/[^0-9+]/g, '');

export function NavigationScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { destination, primaryContact } = useApp();
  // 목적지 컨텍스트 — RouteDetail/RouteComparison/ConfirmLocation 가드와 동일 기준(단일 헬퍼).
  const { hasDestination, destinationName } = getRouteDestinationContext(destination);
  // RouteDetail에서 선택한 경로를 길안내로 이어받는다(없으면 추천 경로로 폴백).
  const route = resolveRoute(mockRoutes, location.state?.routeId) ?? mockRoutes[0];
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [arrivedOpen, setArrivedOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState(() => parseEtaMinutes(route.time, 24)); // mins

  // Mock progress
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => prev > 0 ? prev - 1 : 0);
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // 귀가 완료를 보호자에게 실제로 알린다(자동 전송 메커니즘 부재 → 공유/복사로 정직 처리).
  const handleNotifyArrival = async () => {
    const text = buildArrivalShareText(destinationName);
    const outcome = await shareOrCopyText({
      title: '부엉이 안심귀가',
      text,
      url: `${window.location.origin}/share`,
    });
    if (outcome === 'shared') {
      toast('보호자에게 귀가 완료를 알렸어요.', {
        icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
      });
    } else if (outcome === 'copied') {
      toast('귀가 완료 메시지를 복사했어요. 보호자에게 보내 주세요.', {
        icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
      });
    } else if (outcome === 'failed') {
      toast.error('알림 전송에 실패했어요. 다시 시도해 주세요.');
    }
    // 'cancelled'(사용자 취소)는 정상 흐름 → 안내 없음
  };

  // 위급 상황: 등록 연락처로 위치 링크가 담긴 긴급 메시지를 실제로 공유(자동 전송 날조 금지).
  const handleEmergencyShare = async () => {
    const outcome = await shareOrCopyText({
      title: '부엉이 긴급',
      text: buildEmergencyShareText(destinationName),
      url: `${window.location.origin}/share`,
    });
    if (outcome === 'shared') {
      toast('긴급 메시지를 공유했어요.', { icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" /> });
    } else if (outcome === 'copied') {
      toast('긴급 메시지를 복사했어요. 보호자에게 보내 주세요.', {
        icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
      });
    } else if (outcome === 'failed') {
      toast.error('긴급 메시지 공유에 실패했어요. 112로 전화해 주세요.');
    }
    // 'cancelled'는 무안내
  };

  // 목적지가 없으면(직접 진입·새로고침·state 소실) 가짜 "목적지로 가는 중" 길안내를 띄우거나
  // 보호자에게 "목적지에 안전하게 도착"/긴급 메시지를 의미 없는 플레이스홀더 위치로 보내지 않는다.
  // 검색으로 유도한다(RouteDetail/RouteComparison/ConfirmLocation 가드와 동일 — 단일 기준).
  if (!hasDestination) {
    return (
      <div className="flex flex-col h-full bg-slate-800 items-center justify-center text-center px-8 gap-4">
        <div className="w-14 h-14 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-400">
          <MapPin className="w-6 h-6" />
        </div>
        <p className="text-slate-300 font-medium">선택된 목적지가 없어요</p>
        <p className="text-slate-400 text-sm">목적지를 검색하면 안심 경로로 동행해 드려요.</p>
        <Button onClick={() => navigate('/place-search')} className="rounded-[20px]">
          목적지 검색하기
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-800 relative overflow-hidden">
      {/* Top Banner */}
      <motion.div 
        initial={{ y: -50 }}
        animate={{ y: 0 }}
        className="absolute top-0 inset-x-0 z-30 pt-8 mt-4 px-4 pointer-events-none"
      >
        <div className="bg-emerald-500/20 backdrop-blur-md text-emerald-300 font-bold px-6 py-3.5 rounded-full shadow-lg border border-emerald-400/30 flex items-center justify-center gap-3 max-w-[200px] mx-auto pointer-events-auto">
          <span className="text-xl">🦉</span>
          부엉이 동행 중
        </div>
      </motion.div>

      <div className="flex-1 w-full h-full relative">
        {/* Mock Map with active user dot */}
        <MapMock showRoute active routeType={route.type as any} pois={[
          { type: 'cctv', x: 40, y: 65 },
          { type: 'bell', x: 45, y: 60 }
        ]} />
      </div>

      {/* Floating Emergency Button */}
      <div className="absolute right-5 bottom-[160px] z-20">
        <button 
          onClick={() => setEmergencyOpen(true)}
          className="w-16 h-16 bg-red-500 rounded-full shadow-[0_8px_30px_rgba(239,68,68,0.3)] flex items-center justify-center text-white active:scale-95 transition-transform"
        >
          <AlertCircle className="w-8 h-8" />
        </button>
      </div>

      {/* Bottom Status Bar */}
      <div className="absolute bottom-0 inset-x-0 bg-slate-700 rounded-t-[32px] p-6 pb-8 shadow-[0_-8px_30px_rgba(0,0,0,0.2)] border-t border-slate-600 z-20">
        <div className="flex justify-between items-end mb-6">
          <div>
            <p className="text-slate-300 text-sm mb-1 font-medium">{destinationName}로 가는 중 · {route.name}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-slate-50">{timeLeft}<span className="text-2xl text-slate-400">분</span></span>
              <span className="text-slate-300 text-lg font-medium">남음 ({route.dist})</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button data-testid="nav-share-btn" variant="outline" className="h-14 rounded-[20px] px-6" onClick={() => navigate('/share')}>
            <Share2 className="w-5 h-5" />
          </Button>
          <Button className="flex-1 h-14 rounded-[20px] bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-bold" onClick={() => setArrivedOpen(true)}>
            <HomeIcon className="w-5 h-5 mr-2" />
            귀가 완료
          </Button>
        </div>
      </div>

      {/* Arrival Bottom Sheet */}
      <BottomSheet isOpen={arrivedOpen} onClose={() => setArrivedOpen(false)} hideClose>
        <div className="flex flex-col items-center text-center pb-4 pt-4">
          <div className="w-24 h-24 bg-slate-700 border border-slate-600 rounded-full flex items-center justify-center mb-6 shadow-lg relative">
            <span className="text-5xl">🦉</span>
            <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center border-[3px] border-slate-800">
              <CheckCircle2 className="w-5 h-5 text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-slate-50 mb-2">안전하게 도착하셨군요!</h2>
          {primaryContact ? (
            <p className="text-slate-300 mb-8 leading-relaxed">
              {primaryContact.name} 보호자에게<br />귀가 완료 소식을 알려 보세요.
            </p>
          ) : (
            <p className="text-slate-300 mb-8 leading-relaxed">
              긴급 연락처(보호자)가 등록되어 있지 않아요.<br />등록하면 귀가 완료를 빠르게 알릴 수 있어요.
            </p>
          )}
          <div className="flex flex-col gap-3 w-full">
            {primaryContact ? (
              <Button size="lg" fullWidth className="h-16 rounded-[24px]" onClick={handleNotifyArrival}>
                <Share2 className="w-5 h-5 mr-2" />
                보호자에게 귀가 알리기
              </Button>
            ) : (
              <Button size="lg" fullWidth className="h-16 rounded-[24px]" onClick={() => navigate('/emergency-contacts')}>
                <Phone className="w-5 h-5 mr-2" />
                보호자 등록하기
              </Button>
            )}
            <Button variant="secondary" fullWidth className="h-14 rounded-[24px] bg-slate-600 text-slate-200 hover:bg-slate-500" onClick={() => navigate('/home', { state: { showAdPopup: true } })}>
              홈으로 돌아가기
            </Button>
          </div>
        </div>
      </BottomSheet>

      {/* Emergency Bottom Sheet */}
      <BottomSheet isOpen={emergencyOpen} onClose={() => setEmergencyOpen(false)} title="긴급 도움">
        <div className="flex flex-col gap-4 pb-2">
          <a
            href="tel:112"
            className="w-full bg-red-500 hover:bg-red-400 text-white rounded-[24px] p-6 flex items-center gap-5 transition-colors shadow-sm active:scale-[0.98]"
          >
            <div className="bg-white/20 p-4 rounded-full">
              <PhoneCall className="w-8 h-8" />
            </div>
            <div className="text-left">
              <div className="text-2xl font-bold">112 전화</div>
              <div className="text-red-100 font-medium mt-1">경찰에 즉시 연결됩니다</div>
            </div>
          </a>

          {primaryContact ? (
            <a
              href={`tel:${sanitizePhone(primaryContact.phone)}`}
              className="w-full bg-slate-600 hover:bg-slate-500 text-slate-50 border border-slate-500 rounded-[24px] p-5 flex items-center gap-4 transition-colors active:scale-[0.98]"
            >
              <div className="bg-slate-700 p-3 rounded-full border border-slate-600 shadow-sm">
                <Phone className="w-6 h-6 text-slate-200" />
              </div>
              <div className="text-left flex-1">
                <div className="text-lg font-bold">보호자에게 연락</div>
                <div className="text-slate-300 text-sm mt-1 font-medium">{primaryContact.name}</div>
              </div>
            </a>
          ) : (
            <button
              onClick={() => navigate('/emergency-contacts')}
              className="w-full bg-slate-600 hover:bg-slate-500 text-slate-50 border border-slate-500 rounded-[24px] p-5 flex items-center gap-4 transition-colors active:scale-[0.98]"
            >
              <div className="bg-slate-700 p-3 rounded-full border border-slate-600 shadow-sm">
                <Phone className="w-6 h-6 text-slate-200" />
              </div>
              <div className="text-left flex-1">
                <div className="text-lg font-bold">보호자 등록하기</div>
                <div className="text-slate-300 text-sm mt-1 font-medium">긴급 연락처가 없어요</div>
              </div>
            </button>
          )}

          <button
            onClick={handleEmergencyShare}
            className="w-full bg-slate-700 hover:bg-slate-600 text-slate-50 border border-red-500/40 rounded-[24px] p-5 flex items-center gap-4 transition-colors active:scale-[0.98]"
          >
            <div className="bg-red-500/20 p-3 rounded-full border border-red-500/30">
              <Share2 className="w-6 h-6 text-red-300" />
            </div>
            <div className="text-left flex-1">
              <div className="text-lg font-bold">긴급 메시지 공유</div>
              <div className="text-slate-300 text-sm mt-1 font-medium">위치 링크와 함께 도움을 요청해요</div>
            </div>
          </button>

          <div className="grid grid-cols-3 gap-3 mt-3">
            {[
              { icon: <AlertCircle className="w-6 h-6 text-red-400" />, label: '비상벨' },
              { icon: <Search className="w-6 h-6 text-blue-400" />, label: '편의점' },
              { icon: <MapPin className="w-6 h-6 text-blue-400" />, label: '파출소' }
            ].map((poi, i) => (
              <button key={i} className="bg-slate-700 border border-slate-600 p-4 rounded-[20px] flex flex-col items-center gap-2 hover:bg-slate-600 transition-colors shadow-sm active:scale-95">
                <div className="p-2 bg-slate-600 rounded-full">{poi.icon}</div>
                <span className="text-slate-200 text-sm font-medium">{poi.label}</span>
              </button>
            ))}
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
