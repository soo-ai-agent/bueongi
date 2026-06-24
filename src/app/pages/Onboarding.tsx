import { ShieldCheck, MapPin, BellRing, ArrowRight } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { useState, useEffect } from 'react';
import { hasSeenOnboarding, markOnboardingSeen } from '../utils/onboarding';

const slides = [
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

export function Onboarding() {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  // 이미 온보딩을 본(또는 건너뛴) 사용자는 콜드스타트 시 홈으로 바로 진입(위급 시 접근 지연 방지)
  useEffect(() => {
    if (hasSeenOnboarding()) navigate('/home', { replace: true });
  }, [navigate]);

  const completeOnboarding = () => {
    markOnboardingSeen();
    navigate('/home');
  };

  const handleNext = () => {
    if (step < slides.length - 1) {
      setStep(step + 1);
    } else {
      completeOnboarding();
    }
  };

  return (
    <div className="flex-1 flex flex-col pt-24 pb-10 px-6 relative bg-slate-800">
      <button
        onClick={completeOnboarding}
        className="absolute top-8 right-6 z-10 text-slate-400 text-sm font-medium px-2 py-1 rounded-lg hover:text-slate-200 transition-colors"
      >
        건너뛰기
      </button>
      <div className="flex-1 flex flex-col items-center text-center mt-12">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center"
        >
          <div className="mb-10 p-6 bg-slate-700 rounded-full shadow-[0_0_40px_rgba(0,0,0,0.1)] border border-slate-600">
            {slides[step].icon}
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mb-4 whitespace-pre-line leading-tight">
            {slides[step].title}
          </h1>
          <p className="text-slate-300 text-lg whitespace-pre-line leading-relaxed">
            {slides[step].desc}
          </p>
        </motion.div>
      </div>

      <div className="flex flex-col items-center gap-8 w-full mt-auto">
        <div className="flex gap-2">
          {slides.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === step ? 'w-6 bg-blue-400' : 'w-2 bg-slate-600'
              }`}
            />
          ))}
        </div>

        <Button data-testid="onboarding-next" size="lg" fullWidth onClick={handleNext} className="group h-16 text-lg rounded-2xl">
          {step === slides.length - 1 ? '시작하기' : '다음'}
          <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </Button>
      </div>
    </div>
  );
}
