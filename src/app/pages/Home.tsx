import { Search, Home as HomeIcon, GraduationCap, Briefcase, Clock, ShieldAlert, ChevronRight, UserCircle, MapPin, X } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useLocation, useNavigate } from 'react-router';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp, type Destination, type SavedPlaceKey } from '../store/appStore';

export function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const { savedPlaces, recentDestinations, selectDestination } = useApp();
  const [showPopupAd, setShowPopupAd] = useState(false);

  useEffect(() => {
    // Check if we navigated back from the arrival screen
    if (location.state?.showAdPopup) {
      setShowPopupAd(true);
      // Clean up the state so it doesn't show again on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  const quickPlaces: {
    key: SavedPlaceKey;
    icon: React.ReactNode;
    label: string;
    color: string;
    bg: string;
    isSet: boolean;
    address: string | null;
  }[] = [
    { key: 'home', icon: <HomeIcon className="w-6 h-6" />, label: '집', color: 'text-blue-400', bg: 'bg-blue-500/10', isSet: savedPlaces.home.address != null, address: savedPlaces.home.address },
    { key: 'school', icon: <GraduationCap className="w-6 h-6" />, label: '학교', color: 'text-emerald-400', bg: 'bg-emerald-500/10', isSet: savedPlaces.school.address != null, address: savedPlaces.school.address },
    { key: 'work', icon: <Briefcase className="w-6 h-6" />, label: '회사', color: 'text-amber-400', bg: 'bg-amber-500/10', isSet: savedPlaces.work.address != null, address: savedPlaces.work.address },
  ];

  const goToRoutes = (dest: Destination) => {
    selectDestination(dest);
    navigate('/search');
  };

  const handleQuickPlace = (place: (typeof quickPlaces)[number]) => {
    if (place.isSet && place.address) {
      goToRoutes({ name: place.label, address: place.address });
    } else {
      // 미설정 장소: 등록 모드로 장소 검색 진입
      navigate('/place-search', { state: { saveAs: place.key } });
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-800 relative overflow-hidden">
      {/* Decorative gradient header */}
      <div className="absolute top-0 inset-x-0 h-72 bg-gradient-to-b from-blue-800/20 to-slate-800 pointer-events-none" />
      
      {/* Header */}
      <header className="px-6 pt-16 pb-4 flex justify-between items-center relative z-10">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-6 h-6 bg-slate-700 rounded-full flex items-center justify-center shadow-sm border border-slate-600">
              <span className="text-sm">🦉</span>
            </div>
            <p className="text-blue-300 font-bold text-sm tracking-wide">프로젝트 부엉이</p>
          </div>
          <h1 className="text-[28px] font-bold text-slate-50 tracking-tight leading-tight">오늘도 안전하게<br />모실게요.</h1>
        </div>
        <button onClick={() => navigate('/mypage')} className="w-12 h-12 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-200 hover:text-white hover:bg-slate-600 transition-colors shadow-sm">
          <UserCircle className="w-7 h-7" />
        </button>
      </header>

      <div className="px-6 py-4 flex-1 flex flex-col gap-8 relative z-10 overflow-y-auto pb-6">
        {/* Main CTA / Search */}
        <div
          data-testid="home-search-trigger"
          onClick={() => navigate('/place-search')}
          className="w-full bg-slate-700 border border-slate-600 rounded-[28px] p-5 flex items-center gap-4 cursor-text shadow-md hover:shadow-lg transition-shadow"
        >
          <Search className="w-6 h-6 text-emerald-400 ml-1" />
          <span className="text-slate-300 text-lg flex-1">어디로 가시나요?</span>
        </div>

        {/* Quick places */}
        <div className="grid grid-cols-3 gap-4">
          {quickPlaces.map((place) => (
            <button
              key={place.key}
              onClick={() => handleQuickPlace(place)}
              className="flex flex-col items-center justify-center py-5 bg-slate-700 border border-slate-600 rounded-[24px] hover:bg-slate-600 transition-colors shadow-sm gap-3 active:scale-95 relative"
            >
              <div className={`p-4 rounded-full ${place.bg} ${place.color}`}>
                {place.icon}
              </div>
              <span className="text-sm font-medium text-slate-200">{place.label}</span>
              {!place.isSet && (
                <div className="absolute top-3 right-3 w-2 h-2 bg-red-400 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Recent */}
        <div>
          <h3 className="text-slate-300 text-sm font-medium mb-3 flex items-center gap-2 px-1">
            <Clock className="w-4 h-4" />
            최근 목적지
          </h3>
          <div className="flex flex-col bg-slate-700 border border-slate-600 rounded-[24px] shadow-sm divide-y divide-slate-600 overflow-hidden mb-6">
            {recentDestinations.length === 0 && (
              <div className="p-5 text-slate-400 text-sm">최근 목적지가 없어요.</div>
            )}
            {recentDestinations.map((place, i) => (
              <button key={i} onClick={() => goToRoutes(place)} className="flex items-center gap-4 p-5 hover:bg-slate-600 transition-colors text-left group">
                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 group-hover:text-blue-300 transition-colors">
                  <MapPin className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="text-slate-100 font-medium">{place.name}</div>
                  <div className="text-slate-400 text-sm mt-0.5">{place.address}</div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-200 transition-colors" />
              </button>
            ))}
          </div>
        </div>

        {/* Kakao AdFit Native Mock (Button Style) */}
        <div className="mb-[80px]">
          <div className="flex items-center justify-between px-2 mb-2">
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-3.5 bg-[#FEE500] rounded-sm flex items-center justify-center">
                <span className="text-[#191919] text-[9px] font-black leading-none">K</span>
              </div>
              <span className="text-[11px] text-slate-400 font-bold">KakaoAdFit</span>
            </div>
            <span className="text-[10px] text-slate-500 font-medium px-1">AD</span>
          </div>
          <button className="w-full bg-slate-700 border border-slate-600 rounded-[24px] shadow-sm flex items-center gap-4 p-4 hover:bg-slate-600 transition-colors text-left group">
            <div className="w-12 h-12 rounded-[16px] bg-slate-800 border border-slate-600 flex items-center justify-center text-blue-400 shrink-0 group-hover:scale-105 transition-transform">
              <span className="text-2xl">🛍️</span>
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="text-slate-100 font-bold text-[15px] truncate">카카오 맞춤형 스폰서 광고</div>
              <div className="text-slate-400 text-sm mt-0.5 truncate">앱 내 카카오 광고 API 연동 영역</div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-200 transition-colors shrink-0" />
          </button>
        </div>
      </div>

      {/* Footer Banner */}
      <div className="absolute bottom-6 inset-x-6 z-20">
        <a 
          href="https://www.sexoffender.go.kr"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between bg-slate-700 border border-slate-600 p-4 rounded-2xl text-slate-200 hover:bg-slate-600 transition-colors shadow-md active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-800 rounded-full text-slate-300 border border-slate-600">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <span className="font-medium text-sm">공식 성범죄자알림e 확인</span>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400" />
        </a>
      </div>

      {/* Kakao AdFit Interstitial Popup Overlay */}
      <AnimatePresence>
        {showPopupAd && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/85 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-slate-800 border border-slate-600 rounded-[32px] overflow-hidden w-full max-w-[320px] shadow-2xl relative flex flex-col"
            >
              {/* Kakao AdFit Header */}
              <div className="px-4 py-3 bg-slate-700/80 flex justify-between items-center border-b border-slate-600">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 bg-[#FEE500] rounded-sm flex items-center justify-center">
                    <span className="text-[#191919] text-[10px] font-black leading-none">K</span>
                  </div>
                  <span className="text-[11px] text-slate-300 font-bold">KakaoAdFit</span>
                </div>
                <button onClick={() => setShowPopupAd(false)} className="p-1.5 bg-slate-800 rounded-full border border-slate-600 text-slate-400 hover:text-slate-100 hover:bg-slate-600 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              {/* Ad Content */}
              <div className="h-[280px] bg-slate-700 flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#FEE500] via-slate-700 to-slate-800" />
                <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-5 border border-slate-600 shadow-lg z-10">
                  <span className="text-4xl">📢</span>
                </div>
                <h3 className="text-xl font-bold text-slate-50 mb-3 z-10">카카오 전면 광고 영역</h3>
                <p className="text-slate-400 text-sm leading-relaxed z-10">
                  카카오 광고 API(AdFit)를 통해<br/>사용자 맞춤형 광고가 노출됩니다.
                </p>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                  <span className="text-[10px] bg-slate-800 border border-slate-600 text-slate-400 px-2 py-0.5 rounded-full">스폰서 AD</span>
                </div>
              </div>
              
              {/* Footer Actions */}
              <div className="p-4 bg-slate-800 border-t border-slate-600 flex justify-between items-center">
                <button 
                  onClick={() => setShowPopupAd(false)}
                  className="text-sm text-slate-400 font-medium hover:text-slate-200"
                >
                  오늘 하루 보지 않기
                </button>
                <button 
                  onClick={() => setShowPopupAd(false)}
                  className="text-sm text-blue-400 font-bold hover:text-blue-300 px-3 py-1.5 bg-blue-500/10 rounded-full"
                >
                  광고 닫기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
