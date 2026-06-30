import { ArrowLeft, Home, GraduationCap, Briefcase, Phone, Bell, ChevronRight, ShieldAlert, Plus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useApp, type SavedPlaceKey } from '../store/appStore';

export function MyPage() {
  const navigate = useNavigate();
  const { savedPlaces, primaryContact } = useApp();

  const places: { key: SavedPlaceKey; icon: React.ReactNode; label: string; value: string | null; isSet: boolean }[] = [
    { key: 'home', icon: <Home className="w-5 h-5" />, label: '집', value: savedPlaces.home.address, isSet: savedPlaces.home.address != null },
    { key: 'school', icon: <GraduationCap className="w-5 h-5" />, label: '학교', value: savedPlaces.school.address, isSet: savedPlaces.school.address != null },
    { key: 'work', icon: <Briefcase className="w-5 h-5" />, label: '회사', value: savedPlaces.work.address, isSet: savedPlaces.work.address != null },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-800">
      <header className="px-4 py-4 pt-6 flex items-center justify-between border-b border-slate-700 bg-slate-800">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-300 hover:text-slate-50 rounded-full hover:bg-slate-700">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold text-slate-50">마이페이지</h1>
        <div className="w-10" />
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-8 pb-20 space-y-10">
        {/* User Info Mock */}
        <div className="flex items-center gap-5 mb-2">
          <div className="w-16 h-16 bg-slate-700 border border-slate-600 shadow-sm rounded-full flex items-center justify-center text-3xl">
            👋
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-50">김안심 님</h2>
            <p className="text-slate-300 font-medium mt-1">안전한 귀가를 응원합니다</p>
          </div>
        </div>

        {/* Places */}
        <section>
          <h3 className="text-slate-200 font-bold mb-3 px-1">자주 가는 장소</h3>
          <div className="bg-slate-700 rounded-[24px] border border-slate-600 overflow-hidden divide-y divide-slate-600 shadow-sm">
            {places.map((item, i) => (
              <div
                key={i}
                onClick={() => navigate('/place-search', { state: { saveAs: item.key } })}
                className="flex items-center gap-4 p-5 hover:bg-slate-600 transition-colors cursor-pointer group"
              >
                <div className="p-2.5 bg-slate-800 rounded-full text-slate-300 border border-slate-600">{item.icon}</div>
                <div className="flex-1">
                  <div className="text-slate-50 font-bold">{item.label}</div>
                  <div className={`text-sm mt-0.5 ${item.isSet ? 'text-slate-300' : 'text-slate-400'}`}>
                    {item.value ?? '미설정'}
                  </div>
                </div>
                {!item.isSet ? (
                  <div className="flex items-center text-blue-400 text-sm font-medium gap-1 bg-blue-500/10 px-3 py-1.5 rounded-full">
                    <Plus className="w-4 h-4" /> 등록
                  </div>
                ) : (
                  <div className="flex items-center text-slate-400 text-sm font-medium bg-slate-800 border border-slate-600 px-3 py-1.5 rounded-full group-hover:bg-slate-700 transition-colors">
                    수정
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Emergency Contacts */}
        <section>
          <h3 className="text-slate-200 font-bold mb-3 px-1">긴급 연락처</h3>
          <div className="bg-slate-700 rounded-[24px] border border-slate-600 overflow-hidden shadow-sm">
            <div className="flex items-center gap-4 p-5">
              <div className="p-2.5 bg-red-500/20 rounded-full text-red-400 border border-red-500/30"><Phone className="w-5 h-5" /></div>
              <div className="flex-1 min-w-0">
                <div className="text-slate-50 font-bold truncate">{primaryContact?.name ?? '미등록'}</div>
                <div className="text-slate-300 text-sm mt-0.5 truncate">{primaryContact?.phone ?? '긴급 연락처를 등록해 주세요'}</div>
              </div>
              <button
                onClick={() => navigate('/emergency-contacts')}
                className="px-4 py-2 bg-slate-600 border border-slate-500 text-slate-200 text-sm rounded-[16px] font-bold hover:bg-slate-500 active:scale-95 transition-all"
              >
                관리
              </button>
            </div>
          </div>
        </section>

        {/* Settings */}
        <section>
          <h3 className="text-slate-200 font-bold mb-3 px-1">설정 및 안내</h3>
          <div className="bg-slate-700 rounded-[24px] border border-slate-600 overflow-hidden divide-y divide-slate-600 shadow-sm">
            <div className="flex items-center gap-3 p-5">
              <div className="p-2.5 bg-slate-800 rounded-full text-slate-300 shrink-0"><Bell className="w-5 h-5" /></div>
              <div className="flex-1">
                <div className="text-slate-100 font-semibold">위치 공유</div>
                <div className="text-slate-400 text-sm mt-0.5 leading-relaxed">안심귀가 중 '공유하기'를 누르면 보호자에게 위치 링크가 직접 전송돼요.</div>
              </div>
            </div>
            
            <a href="https://www.sexoffender.go.kr" target="_blank" rel="noreferrer" className="flex items-center justify-between p-5 hover:bg-slate-600 transition-colors group">
              <div className="flex items-center gap-3 text-slate-100 font-semibold">
                <div className="p-2.5 bg-slate-800 rounded-full text-slate-300"><ShieldAlert className="w-5 h-5" /></div>
                <span>공식 성범죄자알림e</span>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-200" />
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
