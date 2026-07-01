import { MapPin, BellRing, ArrowRight, UserPlus, Check, LocateFixed, Phone } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../components/ui/Button';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { hasSeenOnboarding, markOnboardingSeen } from '../utils/onboarding';
import { recordOnboardingEvent } from '../utils/onboardingMetrics';
import { validateContactInput } from '../utils/contactValidation';
import { useApp, MAX_CONTACTS } from '../store/appStore';

// 정보 슬라이드(0~2). 이후 3=위치 권한, 4=보호자 등록 인터랙티브 단계가 이어진다.
const infoSlides: { icon: ReactNode; title: string; desc: string }[] = [
  {
    icon: <span className="text-6xl">🦉</span>,
    title: "부엉이와 함께하는\n가장 안심되는 길",
    desc: "가장 빠른 길보다, 밝고 안전시설이 많은\n귀가 경로를 우선으로 안내합니다."
  },
  {
    icon: <MapPin className="w-16 h-16 text-blue-400" />,
    title: "보호자와 귀가 상태 공유",
    desc: "현재 위치와 도착 예정 시간을\n소중한 사람에게 실시간으로 공유하세요."
  },
  {
    icon: <BellRing className="w-16 h-16 text-amber-400" />,
    title: "긴급 상황 빠른 대응",
    desc: "도움이 필요할 때 원터치로 112 신고와\n주변 안심 시설을 확인할 수 있습니다."
  }
];

const PERMISSION_STEP = 3;
const GUARDIAN_STEP = 4;
const TOTAL_STEPS = 5;

type PermStatus = 'idle' | 'requesting' | 'granted' | 'denied';

export function Onboarding() {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const { addContact } = useApp();
  // 온보딩은 '처음 앱을 켤 때' 1회만 노출한다. 이미 본(또는 건너뛴) 사용자는 콜드스타트 시
  // 슬라이드를 한 프레임도 그리지 않고(깜빡임 방지) 홈으로 바로 진입한다(위급 시 접근 지연 방지).
  const [seen] = useState(() => hasSeenOnboarding());
  const startedRef = useRef(false);

  // 위치 권한 요청 상태(3단계).
  const [permStatus, setPermStatus] = useState<PermStatus>('idle');
  // 보호자 등록 입력(4단계).
  const [gName, setGName] = useState('');
  const [gPhone, setGPhone] = useState('');

  useEffect(() => {
    if (seen) {
      navigate('/home', { replace: true });
      return;
    }
    // 온보딩 시작 1회 계측(StrictMode 이중 호출 방지 ref 가드).
    if (!startedRef.current) {
      startedRef.current = true;
      recordOnboardingEvent('onboarding_started');
    }
  }, [seen, navigate]);

  if (seen) return null; // 이미 본 사용자: 온보딩을 그리지 않는다.

  const completeOnboarding = () => {
    recordOnboardingEvent('onboarding_completed');
    markOnboardingSeen();
    navigate('/home');
  };

  // 정보 슬라이드(0~2) 다음 버튼: 마지막 정보 슬라이드에서 위치 권한 단계로 넘어간다.
  const handleInfoNext = () => {
    if (step < infoSlides.length - 1) setStep(step + 1);
    else setStep(PERMISSION_STEP);
  };

  // 위치 권한 요청 — 브라우저 권한 프롬프트를 띄운다. 허용/거부 어느 쪽이든 온보딩을 막지 않고 결과만 계측한다.
  const requestPermission = () => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setPermStatus('denied');
      recordOnboardingEvent('location_permission_denied');
      return;
    }
    setPermStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      () => {
        setPermStatus('granted');
        recordOnboardingEvent('location_permission_granted');
      },
      () => {
        setPermStatus('denied');
        recordOnboardingEvent('location_permission_denied');
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  };

  const skipPermission = () => {
    recordOnboardingEvent('location_permission_skipped');
    setStep(GUARDIAN_STEP);
  };

  // 보호자 등록 — 위급 시점에 번호를 찾지 않도록 온보딩에서 미리 1명 등록한다(등록 경로 존재 = AC).
  const handleRegisterGuardian = () => {
    const valid = validateContactInput(gName, gPhone);
    if (!valid.ok) {
      toast.error(valid.error!);
      return;
    }
    const { added, persisted } = addContact(valid.name, valid.phone);
    if (!added) {
      toast.error(`보호자는 최대 ${MAX_CONTACTS}명까지 등록할 수 있어요.`);
      return;
    }
    recordOnboardingEvent('guardian_registered');
    if (!persisted) {
      // in-memory 등록은 됐지만 저장 실패 → 거짓 확신 금지, 비영속 사실을 정직 고지(그래도 온보딩은 완료).
      toast.error('보호자를 등록했지만 저장 공간 문제로 저장되지 않았어요. 새로고침하면 사라질 수 있어요.');
    } else {
      toast(`${valid.name} 보호자를 등록했어요.`);
    }
    completeOnboarding();
  };

  const skipGuardian = () => {
    recordOnboardingEvent('guardian_skipped');
    completeOnboarding();
  };

  // 단계별 헤더(아이콘/제목/설명).
  const header: { icon: ReactNode; title: string; desc: string } =
    step <= infoSlides.length - 1
      ? infoSlides[step]
      : step === PERMISSION_STEP
        ? {
            icon: <LocateFixed className="w-16 h-16 text-blue-400" />,
            title: '위치 권한을 켜 주세요',
            desc: '현재 위치로 안전한 경로를 안내하고,\n위급할 때 가장 가까운 파출소를 찾을 수 있어요.',
          }
        : {
            icon: <UserPlus className="w-16 h-16 text-emerald-400" />,
            title: '보호자 한 명을 등록해 주세요',
            desc: '미리 등록해 두면 도착이 늦거나 위급할 때\n번호를 찾지 않고 바로 알릴 수 있어요.',
          };

  return (
    <div className="flex-1 flex flex-col pt-24 pb-10 px-6 relative bg-slate-800">
      <button
        data-testid="onboarding-skip"
        onClick={completeOnboarding}
        className="absolute top-8 right-6 z-10 text-slate-400 text-sm font-medium px-2 py-1 rounded-lg hover:text-slate-200 transition-colors"
      >
        건너뛰기
      </button>
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center text-center mt-6 w-full">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center w-full pb-6"
        >
          <div className="mb-8 p-6 bg-slate-700 rounded-full shadow-[0_0_40px_rgba(0,0,0,0.1)] border border-slate-600">
            {header.icon}
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mb-4 whitespace-pre-line leading-tight">
            {header.title}
          </h1>
          <p className="text-slate-300 text-lg whitespace-pre-line leading-relaxed">
            {header.desc}
          </p>

          {/* 위치 권한 결과 피드백 */}
          {step === PERMISSION_STEP && permStatus === 'granted' && (
            <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-500/15 border border-emerald-400/30 px-4 py-2 text-emerald-300 font-bold">
              <Check className="w-5 h-5" /> 위치 권한이 켜졌어요
            </div>
          )}
          {step === PERMISSION_STEP && permStatus === 'denied' && (
            <div className="mt-6 rounded-2xl bg-slate-700 border border-slate-600 px-4 py-3 text-slate-300 text-sm leading-relaxed max-w-[320px]">
              권한이 꺼져 있어요. 나중에 브라우저·기기 설정에서 위치를 켤 수 있어요.
            </div>
          )}

          {/* 보호자 등록 폼 */}
          {step === GUARDIAN_STEP && (
            <div className="mt-7 w-full max-w-[340px] flex flex-col gap-3">
              <input
                data-testid="onboarding-guardian-name"
                type="text"
                placeholder="이름 (예: 엄마)"
                value={gName}
                onChange={(e) => setGName(e.target.value)}
                maxLength={20}
                className="w-full bg-slate-700 border border-slate-600 rounded-[16px] px-4 py-3.5 text-slate-50 placeholder:text-slate-500 outline-none focus:border-emerald-400 transition-colors text-left"
              />
              <input
                data-testid="onboarding-guardian-phone"
                type="tel"
                inputMode="tel"
                placeholder="전화번호 (예: 010-1234-5678)"
                value={gPhone}
                onChange={(e) => setGPhone(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-[16px] px-4 py-3.5 text-slate-50 placeholder:text-slate-500 outline-none focus:border-emerald-400 transition-colors text-left"
              />
            </div>
          )}
        </motion.div>
      </div>

      <div className="flex flex-col items-center gap-6 w-full mt-auto shrink-0 pt-4">
        <div className="flex gap-2">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === step ? 'w-6 bg-blue-400' : 'w-2 bg-slate-600'
              }`}
            />
          ))}
        </div>

        {/* 정보 슬라이드(0~2): 다음 버튼 */}
        {step <= infoSlides.length - 1 && (
          <Button data-testid="onboarding-next" size="lg" fullWidth onClick={handleInfoNext} className="group h-16 text-lg rounded-2xl">
            다음
            <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Button>
        )}

        {/* 위치 권한 단계 */}
        {step === PERMISSION_STEP && (
          <div className="w-full flex flex-col items-center gap-3">
            {permStatus === 'granted' || permStatus === 'denied' ? (
              <Button data-testid="onboarding-permission-next" size="lg" fullWidth onClick={() => setStep(GUARDIAN_STEP)} className="group h-16 text-lg rounded-2xl">
                다음
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            ) : (
              <Button
                data-testid="onboarding-permission-allow"
                size="lg"
                fullWidth
                disabled={permStatus === 'requesting'}
                onClick={requestPermission}
                className="h-16 text-lg rounded-2xl"
              >
                <LocateFixed className="w-5 h-5 mr-2" />
                {permStatus === 'requesting' ? '권한 확인 중…' : '위치 권한 허용'}
              </Button>
            )}
            {permStatus !== 'granted' && permStatus !== 'denied' && (
              <button data-testid="onboarding-permission-skip" onClick={skipPermission} className="text-slate-400 text-sm font-medium py-1 hover:text-slate-200 transition-colors">
                나중에 할게요
              </button>
            )}
          </div>
        )}

        {/* 보호자 등록 단계 */}
        {step === GUARDIAN_STEP && (
          <div className="w-full flex flex-col items-center gap-3">
            <Button data-testid="onboarding-guardian-register" size="lg" fullWidth onClick={handleRegisterGuardian} className="h-16 text-lg rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-bold">
              <Phone className="w-5 h-5 mr-2" />
              등록하고 시작하기
            </Button>
            <button data-testid="onboarding-guardian-skip" onClick={skipGuardian} className="text-slate-400 text-sm font-medium py-1 hover:text-slate-200 transition-colors">
              건너뛰고 시작하기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
