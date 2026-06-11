import { ArrowLeft, MapPin, Clock, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { useApp, type Destination, type SavedPlaceKey } from '../store/appStore';
import { filterPlaces } from '../utils/placeSearch';

const SAVED_PLACE_LABELS: Record<SavedPlaceKey, string> = {
  home: '집',
  school: '학교',
  work: '회사',
};

// 데모용 장소 카탈로그 (백엔드 장소검색 연동 전 임시 데이터)
const PLACE_CATALOG: Destination[] = [
  { name: '강남역 2번 출구', address: '서울 강남구 강남대로 396' },
  { name: '강남대학교', address: '경기 용인시 기흥구 강남로 40' },
  { name: '강남경찰서', address: '서울 강남구 테헤란로 114길 11' },
  { name: '역삼역 3번 출구', address: '서울 강남구 테헤란로' },
  { name: '스타벅스 신사점', address: '서울 강남구 도산대로' },
  { name: '신논현역 5번 출구', address: '서울 강남구 봉은사로' },
];

export function PlaceSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  // 자주 가는 장소(집/학교/회사) 등록 모드: state.saveAs 로 진입
  const saveAs = (location.state?.saveAs ?? null) as SavedPlaceKey | null;
  const saveLabel = saveAs ? SAVED_PLACE_LABELS[saveAs] : null;
  const { recentDestinations, selectDestination, setSavedPlace } = useApp();
  const [keyword, setKeyword] = useState('');

  const trimmed = keyword.trim();
  // 실시간(type-to-filter) 검색: 별도 '검색' 제출 없이 입력 즉시 결과 반영
  const results = filterPlaces(PLACE_CATALOG, keyword);

  const handleSelect = (place: Destination) => {
    if (saveAs) {
      // 등록 모드: 선택한 장소를 자주 가는 장소로 저장하고 이전 화면으로 복귀
      const persisted = setSavedPlace(saveAs, place.address);
      if (!persisted) {
        // in-memory 적용은 유지하되 저장 실패를 정직 고지(거짓 "등록했어요" 금지)
        toast.error('저장 공간이 부족해 장소를 저장하지 못했어요. 새로고침하면 사라질 수 있어요. 브라우저 설정을 확인해 주세요.');
        navigate(-1);
        return;
      }
      toast(`${saveLabel}을(를) '${place.name}'(으)로 등록했어요.`, {
        icon: <MapPin className="w-5 h-5 text-emerald-400" />,
      });
      navigate(-1);
      return;
    }
    // 목적지 선택 → 출발지(현재 위치) 확인 화면으로 이동
    selectDestination(place);
    navigate('/confirm-location');
  };

  // form 제출(Enter)은 페이지 새로고침만 막는다 — 검색은 이미 실시간 반영됨.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  return (
    <div className="flex flex-col h-full bg-slate-800">
      <header className="px-4 py-3 pt-6 flex items-center gap-3 bg-slate-800 z-20 shadow-sm border-b border-slate-700">
        <button onClick={() => navigate(-1)} aria-label="뒤로 가기" className="p-2 text-slate-300 hover:text-slate-50 rounded-full hover:bg-slate-700 transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <form
          onSubmit={handleSubmit}
          className="flex-1 flex items-center gap-2 bg-slate-700 px-4 py-2.5 rounded-[20px] border border-slate-600 focus-within:border-blue-400 transition-colors"
        >
          <input
            data-testid="place-search-input"
            autoFocus
            type="text"
            placeholder={saveAs ? `${saveLabel}(으)로 등록할 장소 검색` : '장소, 버스, 지하철역 검색'}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="flex-1 bg-transparent text-slate-50 text-base font-medium placeholder:text-slate-400 outline-none h-6"
          />
          {keyword.length > 0 && (
            <button
              type="button"
              onClick={() => setKeyword('')}
              aria-label="검색어 지우기"
              className="text-slate-400 hover:text-slate-200 transition-colors shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </form>
      </header>

      <div className="flex-1 overflow-y-auto">
        {saveAs && (
          <div className="mx-4 mt-4 bg-blue-500/10 border border-blue-500/20 px-4 py-3 rounded-[16px] flex items-center gap-2.5">
            <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
            <p className="text-slate-300 text-sm">
              <span className="text-blue-300 font-bold">{saveLabel}</span> 주소로 등록할 장소를 검색해 선택하세요.
            </p>
          </div>
        )}
        {trimmed ? (
          results.length > 0 ? (
            <div className="flex flex-col divide-y divide-slate-700/50">
              {results.map((place, i) => (
                <button
                  key={i}
                  data-testid="place-result"
                  onClick={() => handleSelect(place)}
                  className="flex items-center gap-4 p-5 hover:bg-slate-700 transition-colors text-left group"
                >
                  <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 group-hover:text-emerald-400 transition-colors border border-slate-600">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-slate-100 font-bold text-base">{place.name}</div>
                    <div className="text-slate-400 text-sm mt-1">{place.address}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center px-8 pt-24 gap-3">
              <div className="w-14 h-14 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-400">
                <MapPin className="w-6 h-6" />
              </div>
              <p className="text-slate-300 font-medium">'{trimmed}' 검색 결과가 없어요</p>
              <p className="text-slate-400 text-sm">다른 장소명이나 주소로 검색해 보세요.</p>
            </div>
          )
        ) : (
          <div className="p-6">
            <h3 className="text-slate-300 text-sm font-bold mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              최근 검색
            </h3>
            <div className="flex flex-col gap-2">
              {recentDestinations.map((place, i) => (
                <button
                  key={i}
                  onClick={() => handleSelect(place)}
                  className="flex items-center gap-4 p-4 rounded-2xl hover:bg-slate-700 transition-colors text-left group border border-transparent hover:border-slate-600"
                >
                  <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 group-hover:text-blue-400 transition-colors">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-slate-200 font-medium">{place.name}</div>
                    <div className="text-slate-400 text-sm mt-0.5">{place.address}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
