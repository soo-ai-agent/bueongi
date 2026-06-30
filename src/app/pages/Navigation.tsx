import { RouteMap, type RouteMapPoi } from '../components/map/RouteMap';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Button } from '../components/ui/Button';
import {
  Phone, AlertCircle, MapPin, Search, PhoneCall, Share2, CheckCircle2, Home as HomeIcon,
  ArrowUp, CornerUpLeft, CornerUpRight, RefreshCw, MoveUp, MoveDown, Navigation2, Footprints, Eye,
  type LucideIcon,
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { useApp } from '../store/appStore';
import { shareOrCopyText, composeEmergencyShareMessage, composeArrivalShareMessage } from '../utils/share';
import { endShare, getShareWatching, isShareApiConfigured } from '../utils/shareSession';
import { mockRoutes } from './RouteComparison';
import { resolveRouteWithApiOptions, parseEtaMinutes, getRouteDestinationContext, normalizeRouteType } from '../utils/routeSelection';
import { loadNearestPolice } from '../utils/policeSource';
import { formatDistance, toTelHref, type NearbyPolice } from '../utils/nearestPolice';
import { getBrowserCurrentLocation, getCurrentLocationErrorMessage, CurrentLocationError } from '../utils/currentLocation';
import { haversineMeters } from '../utils/geo';
import { formatDistanceKo } from '../utils/directRoute';
import type { NavStep } from '../utils/tmap';
import type { LatLng } from '../utils/routeCompare';

const sanitizePhone = (phone: string) => phone.replace(/[^0-9+]/g, '');

/**
 * Tmap turnType → 방향 아이콘/레이블. 미정의 코드는 직진으로 폴백.
 * 코드 출처: Tmap 보행자 경로 API 실응답(11~19 회전, 12x 시설 통과, 200/201 출발·도착, 21x 횡단보도).
 */
const TURN_GUIDE: Record<number, { Icon: LucideIcon; label: string }> = {
  11: { Icon: ArrowUp, label: '직진' },
  12: { Icon: CornerUpLeft, label: '좌회전' },
  16: { Icon: CornerUpLeft, label: '8시 방향 좌회전' },
  17: { Icon: CornerUpLeft, label: '10시 방향 좌회전' },
  13: { Icon: CornerUpRight, label: '우회전' },
  18: { Icon: CornerUpRight, label: '2시 방향 우회전' },
  19: { Icon: CornerUpRight, label: '4시 방향 우회전' },
  14: { Icon: RefreshCw, label: 'U턴' },
  125: { Icon: MoveUp, label: '육교 이용' },
  126: { Icon: MoveDown, label: '지하보도 이용' },
  127: { Icon: MoveUp, label: '계단 이용' },
  // 출발/도착(Tmap: 200=출발지, 201=목적지)
  200: { Icon: Navigation2, label: '출발' },
  201: { Icon: MapPin, label: '도착' },
  // 횡단보도(Tmap: 211 정면 / 212~217 방향별)
  211: { Icon: Footprints, label: '횡단보도 건너기' },
  212: { Icon: Footprints, label: '좌측 횡단보도 건너기' },
  213: { Icon: Footprints, label: '우측 횡단보도 건너기' },
  214: { Icon: Footprints, label: '8시 방향 횡단보도 건너기' },
  215: { Icon: Footprints, label: '10시 방향 횡단보도 건너기' },
  216: { Icon: Footprints, label: '2시 방향 횡단보도 건너기' },
  217: { Icon: Footprints, label: '4시 방향 횡단보도 건너기' },
};

function turnGuide(turnType: number): { Icon: LucideIcon; label: string } {
  return TURN_GUIDE[turnType] ?? { Icon: ArrowUp, label: '직진' };
}

/** 15m 이내 접근 시 다음 단계로 전진하는 판정 반경(m). */
const STEP_ADVANCE_METERS = 15;

export function NavigationScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { destination, primaryContact, routeOrigin, apiRouteOptions, activeShare, setActiveShare } = useApp();
  // 목적지 컨텍스트 — RouteDetail/RouteComparison/ConfirmLocation 가드와 동일 기준(단일 헬퍼).
  const { canRequestRoute, hasDestination, destinationName } = getRouteDestinationContext(destination);
  // RouteDetail에서 선택한 경로를 길안내로 이어받는다(없으면 추천 경로로 폴백).
  const routeOption = resolveRouteWithApiOptions(apiRouteOptions, mockRoutes, location.state?.routeId) ?? mockRoutes[0];
  // Tmap 키 미설정/백엔드 폴백(MockRoute)일 땐 단계/경로가 없다 → graceful fallback.
  const steps: NavStep[] = 'steps' in routeOption && routeOption.steps ? routeOption.steps : [];
  const routePath: LatLng[] | undefined = 'path' in routeOption ? routeOption.path : undefined;
  // 백엔드 안심 라우팅이 준 경로변 거점 마커(CCTV/안심집/비상벨). 길안내 지도에 그대로 표시한다.
  // 출발/도착은 origin/destination prop 으로 이미 그려지므로 시설 마커만 남긴다(중복 핀 방지).
  // useMemo: 카운트다운 등 잦은 리렌더마다 새 배열이 되면 RouteMap 이 마커 오버레이를 매번 재생성(깜빡임)하므로 고정.
  const facilityMarkers: RouteMapPoi[] = useMemo(
    () =>
      'markers' in routeOption && routeOption.markers
        ? routeOption.markers.filter((m) => m.type !== 'start' && m.type !== 'end')
        : [],
    [routeOption],
  );

  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [arrivedOpen, setArrivedOpen] = useState(false);
  const [policeLoading, setPoliceLoading] = useState(false);
  const [nearestPoliceList, setNearestPoliceList] = useState<NearbyPolice[] | null>(null);
  const [timeLeft, setTimeLeft] = useState(() => parseEtaMinutes(routeOption.time, 24)); // mins
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [livePosition, setLivePosition] = useState<LatLng | null>(routeOrigin ?? null);
  const [remainingDistanceM, setRemainingDistanceM] = useState<number | null>(null);
  const [remainingTimeS, setRemainingTimeS] = useState<number | null>(null);
  // 보호자가 현재 공유 위치를 보고 있는지(상단 '보호자 시청 중' 표시용). 공유 중일 때만 갱신된다.
  const [watching, setWatching] = useState(false);

  // 단계 안내가 없을 때만(폴백) mock 카운트다운으로 ETA를 줄인다.
  useEffect(() => {
    if (steps.length > 0) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => prev > 0 ? prev - 1 : 0);
    }, 60000);
    return () => clearInterval(timer);
  }, [steps.length]);

  // 실시간 GPS 추적: 현재 위치 갱신 + 다음 단계 근접 시 전진 + 남은 거리/시간 합산.
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLivePosition(current);
        if (steps.length > 0 && currentStepIdx < steps.length - 1) {
          const nextStep = steps[currentStepIdx + 1];
          const dist = haversineMeters(current, { lat: nextStep.lat, lng: nextStep.lng });
          if (dist < STEP_ADVANCE_METERS) {
            setCurrentStepIdx(prev => Math.min(prev + 1, steps.length - 1));
          }
        }
        // 단계 안내가 있을 때만 현재 단계 이후 남은 거리/시간을 합산한다(steps[i]의 distance/time은
        // i→i+1 구간 기준). 단계가 없는 폴백 경로에서는 잔여값을 null로 두어 경로 자체의 시간/거리
        // (route.time/route.dist)를 표시한다 — 0m/1분 오표시 방지.
        if (steps.length > 0) {
          const remaining = steps.slice(currentStepIdx).reduce(
            (acc, s) => ({ dist: acc.dist + s.distanceM, time: acc.time + s.timeS }),
            { dist: 0, time: 0 },
          );
          // per-step 거리/시간이 0(백엔드가 단계별 값 미제공)이면 잔여값을 두지 않고 경로 총합
          // (route.time/route.dist)으로 폴백한다 — "0m/1분" 오표시 방지.
          if (remaining.dist > 0) setRemainingDistanceM(remaining.dist);
          if (remaining.time > 0) setRemainingTimeS(remaining.time);
        }
      },
      undefined,
      { enableHighAccuracy: true, maximumAge: 3000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [steps, currentStepIdx]);

  // 보호자가 실제로 공유 위치를 보고 있는지 5초마다 확인한다(공유 중일 때만).
  // owner_secret 으로 조회하므로 이 확인 자체는 시청자로 집계되지 않는다 — 관리자 본인 확인은 알림을 만들지 않는다.
  useEffect(() => {
    if (!activeShare || !isShareApiConfigured()) {
      setWatching(false);
      return;
    }
    let stopped = false;
    const check = async () => {
      try {
        const w = await getShareWatching(activeShare.token, activeShare.ownerSecret);
        if (!stopped) setWatching(w);
      } catch {
        if (!stopped) setWatching(false);
      }
    };
    void check();
    const timer = setInterval(() => void check(), 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [activeShare]);

  const currentStep: NavStep | null = steps[currentStepIdx] ?? null;
  const guide = currentStep ? turnGuide(currentStep.turnType) : null;
  const GuideIcon = guide?.Icon ?? Navigation2;

  const distanceText = remainingDistanceM != null ? formatDistanceKo(remainingDistanceM) : routeOption.dist;
  const minutesLeft = remainingTimeS != null ? Math.max(1, Math.round(remainingTimeS / 60)) : timeLeft;

  // 귀가 완료를 보호자에게 실제로 알린다(자동 전송 메커니즘 부재 → 공유/복사로 정직 처리).
  // 이 화면에는 실시간 위치 토큰이 없으므로 링크는 붙이지 않는다(토큰 없는 /share는 발신자 본인
  // 화면으로 라우팅돼 보호자에게 깨진 링크·거짓 위치 약속이 됨 — composeArrivalShareMessage가 차단).
  const handleNotifyArrival = async () => {
    const outcome = await shareOrCopyText({
      title: '부엉이 안심귀가',
      text: composeArrivalShareMessage(destinationName, null),
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

  // 위급 상황: 긴급 메시지를 실제로 공유(자동 전송 날조 금지). 이 화면에는 실시간 위치 토큰이
  // 없으므로 깨진 링크를 붙이지 않는다 — 위급 시 보호자가 무의미한 화면을 열게 만드는 거짓
  // "위치 링크" 약속을 차단한다(composeEmergencyShareMessage가 링크 유무를 정직하게 결정).
  const handleEmergencyShare = async () => {
    const outcome = await shareOrCopyText({
      title: '부엉이 긴급',
      text: composeEmergencyShareMessage(destinationName, null),
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

  // 위급 시 최근접 파출소: police/all.json 로컬 캐시에서 검색(네트워크 없이 동작), 전화 연결 제공.
  const handleFindPolice = async () => {
    setPoliceLoading(true);
    try {
      let current = routeOrigin;
      if (!current) current = await getBrowserCurrentLocation();
      const list = await loadNearestPolice(current, { limit: 3 });
      setNearestPoliceList(list);
      if (list.length === 0) {
        toast('10km 이내 파출소를 찾지 못했어요. 위급 시 112로 전화해 주세요.');
      }
    } catch (error) {
      setNearestPoliceList([]);
      // 위치 권한/타임아웃은 위치 안내로, 파출소 데이터 부재는 그 메시지를 그대로 표면화(정직).
      const message =
        error instanceof CurrentLocationError
          ? getCurrentLocationErrorMessage(error)
          : error instanceof Error
            ? error.message
            : '파출소를 찾지 못했어요. 위급 시 112로 전화해 주세요.';
      toast.error(message);
    } finally {
      setPoliceLoading(false);
    }
  };

  // 귀가 완료: 진행 중인 위치 공유가 있으면 즉시 종료한다 → 보호자가 연 공유 URL이 "공유 종료"로 바뀐다.
  // 종료는 멱등이고, 실패해도 도착 흐름을 막지 않는다(공유 서버는 어차피 TTL로 자동 만료된다).
  const handleArrived = () => {
    if (activeShare) {
      void endShare(activeShare.token, { ownerSecret: activeShare.ownerSecret }).catch(() => {});
      setActiveShare(null);
    }
    setArrivedOpen(true);
  };

  // 목적지/좌표가 없으면(직접 진입·새로고침·state 소실·구버전 저장데이터) 가짜 "목적지로 가는 중" 길안내를 띄우거나
  // 보호자에게 "목적지에 안전하게 도착"/긴급 메시지를 의미 없는 플레이스홀더 위치로 보내지 않는다.
  // 검색으로 유도한다(RouteDetail/RouteComparison/ConfirmLocation 가드와 동일 — 단일 기준).
  if (!canRequestRoute) {
    return (
      <div className="flex flex-col h-full bg-slate-800 items-center justify-center text-center px-8 gap-4">
        <div className="w-14 h-14 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-400">
          <MapPin className="w-6 h-6" />
        </div>
        <p className="text-slate-300 font-medium">
          {hasDestination ? '목적지 위치를 다시 확인해 주세요' : '선택된 목적지가 없어요'}
        </p>
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
        {/* 보호자 시청 중 표시 — 보호자가 공유 링크로 실제 위치를 보는 동안만 노출되고, 나가면 사라진다. */}
        {watching && (
          <div className="flex justify-center mt-2 pointer-events-auto">
            <div
              data-testid="nav-watching-badge"
              className="bg-blue-500/20 backdrop-blur-md text-blue-200 text-sm font-bold px-4 py-2 rounded-full border border-blue-400/30 flex items-center gap-2 shadow-lg"
            >
              <Eye className="w-4 h-4" />
              보호자가 보는 중
            </div>
          </div>
        )}

        {/* 현재 단계 안내 카드 — 실제 턴바이턴 단계가 있을 때만 표시.
            (단계 없을 때 뜨던 "경로를 따라 이동해 주세요" 기본 안내 팝업은 제거.) */}
        {currentStep && (
          <div className="mt-3 max-w-[340px] mx-auto pointer-events-auto">
            <div className="bg-slate-900/80 backdrop-blur-md text-slate-50 rounded-[24px] shadow-lg border border-slate-700 px-5 py-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0">
                <GuideIcon className="w-7 h-7 text-emerald-300" />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold leading-tight">{guide?.label}</p>
                <p className="text-slate-300 text-sm mt-0.5 truncate">{currentStep.description || `${guide?.label} 안내`}</p>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      <div className="flex-1 w-full h-full relative">
        {/* 동행 중 지도 — 실좌표 경로선 + 실시간 현재 위치 마커 */}
        <RouteMap
          showRoute
          active
          showControls
          origin={routeOrigin}
          destination={destination}
          routeType={normalizeRouteType(routeOption.type)}
          livePosition={livePosition}
          path={routePath}
          pois={facilityMarkers}
        />
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
        {/* 남은 시간·거리(핵심 정보만 유지) */}
        <div className="flex items-baseline gap-2 mb-5">
          <span className="text-4xl font-bold text-slate-50">{minutesLeft}<span className="text-2xl text-slate-400">분</span></span>
          <span className="text-slate-300 text-lg font-medium">남음 ({distanceText})</span>
        </div>

        <div className="flex gap-3">
          <Button data-testid="nav-share-btn" variant="outline" className="h-14 rounded-[20px] px-6" onClick={() => navigate('/share')}>
            <Share2 className="w-5 h-5" />
          </Button>
          <Button className="flex-1 h-14 rounded-[20px] bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-bold" onClick={handleArrived}>
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
              <div className="text-left flex-1 min-w-0">
                <div className="text-lg font-bold">보호자에게 연락</div>
                <div className="text-slate-300 text-sm mt-1 font-medium truncate">{primaryContact.name}</div>
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
              <div className="text-slate-300 text-sm mt-1 font-medium">목적지와 함께 도움을 요청해요</div>
            </div>
          </button>

          <div className="grid grid-cols-3 gap-3 mt-3">
            <div className="bg-slate-700 border border-slate-600 p-4 rounded-[20px] flex flex-col items-center gap-2 shadow-sm opacity-60">
              <div className="p-2 bg-slate-600 rounded-full"><AlertCircle className="w-6 h-6 text-red-400" /></div>
              <span className="text-slate-200 text-sm font-medium">비상벨</span>
            </div>
            <div className="bg-slate-700 border border-slate-600 p-4 rounded-[20px] flex flex-col items-center gap-2 shadow-sm opacity-60">
              <div className="p-2 bg-slate-600 rounded-full"><Search className="w-6 h-6 text-blue-400" /></div>
              <span className="text-slate-200 text-sm font-medium">편의점</span>
            </div>
            <button
              data-testid="nav-find-police"
              onClick={handleFindPolice}
              disabled={policeLoading}
              className="bg-slate-700 border border-slate-600 p-4 rounded-[20px] flex flex-col items-center gap-2 hover:bg-slate-600 transition-colors shadow-sm active:scale-95 disabled:opacity-60"
            >
              <div className="p-2 bg-slate-600 rounded-full"><MapPin className="w-6 h-6 text-blue-400" /></div>
              <span className="text-slate-200 text-sm font-medium">{policeLoading ? '검색 중…' : '파출소'}</span>
            </button>
          </div>

          {/* 최근접 파출소 결과 — 로컬 검색(오프라인 OK) + 전화 연결 */}
          {nearestPoliceList && nearestPoliceList.length > 0 && (
            <div className="mt-3 flex flex-col gap-2" data-testid="nearest-police-list">
              {nearestPoliceList.map((p) => {
                const tel = toTelHref(p);
                return (
                  <div key={p.id} className="bg-slate-700 border border-slate-600 rounded-[20px] p-4 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-slate-50 font-bold truncate">{p.name ?? '파출소'}</div>
                      <div className="text-slate-400 text-sm">{formatDistance(p.distanceM)}{p.address ? ` · ${p.address}` : ''}</div>
                    </div>
                    {tel ? (
                      <a href={tel} className="px-4 py-2 rounded-full bg-blue-500 text-white text-sm font-bold active:scale-95 flex items-center gap-1.5">
                        <PhoneCall className="w-4 h-4" /> 전화
                      </a>
                    ) : (
                      <span className="text-slate-500 text-xs">번호 없음</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
