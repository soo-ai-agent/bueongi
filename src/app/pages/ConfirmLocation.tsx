import { ArrowLeft, MapPin, Crosshair } from 'lucide-react';
import { useNavigate } from 'react-router';
import { MapMock } from '../components/map/MapMock';
import { Button } from '../components/ui/Button';
import { useApp } from '../store/appStore';

export function ConfirmLocation() {
  const navigate = useNavigate();
  const { destination } = useApp();

  // 목적지가 없으면(직접 진입) 검색으로 되돌림
  if (!destination) {
    return (
      <div className="flex flex-col h-full bg-slate-800 items-center justify-center text-center px-8 gap-4">
        <div className="w-14 h-14 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-400">
          <MapPin className="w-6 h-6" />
        </div>
        <p className="text-slate-300 font-medium">선택된 목적지가 없어요</p>
        <Button onClick={() => navigate('/place-search')} className="rounded-[20px]">
          목적지 검색하기
        </Button>
      </div>
    );
  }

  const handleConfirm = () => {
    navigate('/search');
  };

  return (
    <div className="flex flex-col h-full bg-slate-800 relative">
      <header className="absolute top-0 inset-x-0 z-30 px-4 pt-8 mt-4 flex items-center">
        <button onClick={() => navigate(-1)} aria-label="뒤로 가기" className="p-3 text-slate-200 bg-slate-700/90 backdrop-blur-md rounded-full shadow-lg border border-slate-600 active:scale-95 transition-transform">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="ml-3 px-4 py-2.5 bg-slate-700/90 backdrop-blur-md rounded-full text-slate-50 font-bold border border-slate-600 shadow-lg text-sm">
          목적지 확인
        </div>
      </header>

      <div className="flex-1 w-full h-full relative">
        {/* Map with destination point */}
        <MapMock pois={[{ type: 'end', x: 50, y: 50 }]} zoom={1.5} />

        {/* Center Target overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Crosshair className="w-8 h-8 text-emerald-400 mb-12 opacity-50" />
        </div>
      </div>

      {/* Bottom Sheet style overlay */}
      <div className="absolute bottom-0 inset-x-0 bg-slate-800 rounded-t-[32px] p-6 pb-8 shadow-[0_-8px_30px_rgba(0,0,0,0.3)] border-t border-slate-700 z-20">
        <div className="flex justify-center mb-6">
          <div className="w-12 h-1.5 bg-slate-600 rounded-full" />
        </div>

        <h2 className="text-xl font-bold text-slate-50 mb-4">이 목적지가 맞나요?</h2>
        <div className="flex items-center gap-4 bg-slate-700 p-4 rounded-[24px] border border-slate-600 mb-8 shadow-sm">
          <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center text-emerald-400 border border-slate-600">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <div className="text-slate-100 font-bold text-lg">{destination.name}</div>
            <div className="text-slate-400 text-sm mt-0.5">{destination.address}</div>
          </div>
        </div>

        <Button data-testid="confirm-route-btn" size="lg" fullWidth className="h-16 text-lg rounded-[24px]" onClick={handleConfirm}>
          안심 경로 보기
        </Button>
      </div>
    </div>
  );
}
