import { ArrowLeft, Video, Lightbulb, TrendingUp, AlertTriangle, Search, MapPin } from 'lucide-react';
import { type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { MapMock } from '../components/map/MapMock';
import { Tag } from '../components/ui/Tag';
import { Button } from '../components/ui/Button';
import { useApp } from '../store/appStore';

export type RouteType = 'safe' | 'main' | 'fast';

export interface RouteTag {
  text: string;
  icon?: ReactNode;
  variant: 'default' | 'mint' | 'blue' | 'yellow' | 'outline';
}

export interface MockRoute {
  id: string;
  name: string;
  time: string;
  dist: string;
  desc: string;
  tags: RouteTag[];
  type: RouteType;
}

export const mockRoutes: MockRoute[] = [
  {
    id: '1',
    name: '추천 경로',
    time: '24분',
    dist: '1.2km',
    desc: '가장 밝고 안심 시설이 잘 갖춰진 길입니다.',
    tags: [
      { text: 'CCTV 많음', icon: <Video />, variant: 'mint' },
      { text: '밝은 길', icon: <Lightbulb />, variant: 'yellow' },
    ],
    type: 'safe'
  },
  {
    id: '2',
    name: '큰길 위주',
    time: '28분',
    dist: '1.4km',
    desc: '시간은 조금 더 걸리지만 넓고 트인 큰길로 안내합니다.',
    tags: [
      { text: '큰길 위주', icon: <TrendingUp />, variant: 'blue' },
      { text: '골목길 적음', icon: <AlertTriangle />, variant: 'default' },
    ],
    type: 'main'
  },
  {
    id: '3',
    name: '빠른 경로',
    time: '18분',
    dist: '1.0km',
    desc: '가장 빠르게 도착할 수 있는 최단 거리 경로입니다.',
    tags: [
      { text: '최단 거리', variant: 'outline' },
    ],
    type: 'fast'
  }
];

export function RouteComparison() {
  const navigate = useNavigate();
  const { destination } = useApp();

  // 목적지가 없으면(직접 진입·목적지 미선택) 가짜 경로 노출 대신 검색으로 유도
  // (ConfirmLocation 과 동일한 목적지 컨텍스트 가드).
  if (!destination) {
    return (
      <div className="flex flex-col h-full bg-slate-800 items-center justify-center text-center px-8 gap-4">
        <div className="w-14 h-14 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-400">
          <MapPin className="w-6 h-6" />
        </div>
        <p className="text-slate-300 font-medium">선택된 목적지가 없어요</p>
        <p className="text-slate-400 text-sm">목적지를 검색하면 안심 경로를 안내해 드려요.</p>
        <Button onClick={() => navigate('/place-search')} className="rounded-[20px]">
          목적지 검색하기
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-800">
      {/* Header */}
      <header className="px-4 py-3 pt-4 flex items-center gap-3 bg-slate-800 z-20 shadow-sm border-b border-slate-700">
        <button onClick={() => navigate(-1)} className="p-2 text-slate-300 hover:text-slate-50 rounded-full hover:bg-slate-700 transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        
        {/* Editable Destination Header */}
        <div 
          onClick={() => navigate('/place-search')}
          className="flex-1 flex items-center gap-2 bg-slate-700 px-4 py-3 rounded-[20px] border border-slate-600 cursor-pointer hover:bg-slate-600 transition-colors group"
        >
          <div className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-sm shrink-0" />
          <span className="text-slate-200 text-sm font-medium whitespace-nowrap">현재 위치</span>
          <span className="text-slate-400 mx-1 shrink-0">→</span>
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shrink-0" />
          <span className="text-slate-50 text-sm font-bold flex-1 truncate">{destination?.name ?? '목적지 검색'}</span>
          <Search className="w-4 h-4 text-slate-400 group-hover:text-slate-200 shrink-0 transition-colors" />
        </div>
      </header>

      {/* Map half */}
      <div className="flex-[0.8] relative bg-slate-700">
        <MapMock showRoute routeType="safe" pois={[{ type: 'start', x: 20, y: 80 }, { type: 'end', x: 80, y: 20 }]} />
      </div>

      {/* Bottom Routes List */}
      <div className="bg-slate-800 rounded-t-[32px] shadow-[0_-8px_30px_rgba(0,0,0,0.2)] z-20 flex flex-col flex-1 mt-[-20px]">
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-slate-600 rounded-full" />
        </div>
        <div className="px-6 pb-3 pt-2">
          <h2 className="text-xl font-bold text-slate-50">경로 선택</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3">
          {mockRoutes.map((route) => (
            <div
              key={route.id}
              data-testid="route-option"
              onClick={() => navigate(`/route/${route.id}`)}
              className={`p-5 rounded-[24px] border transition-all cursor-pointer active:scale-[0.98] ${
                route.id === '1' 
                  ? 'bg-slate-700 border-blue-400/50 shadow-sm' 
                  : 'bg-slate-700 border-slate-600 hover:bg-slate-600 shadow-sm'
              }`}
            >
              <div className="flex justify-between items-start mb-2.5">
                <div className="flex items-center gap-2">
                  <h3 className={`font-bold text-lg ${route.id === '1' ? 'text-blue-300' : 'text-slate-100'}`}>
                    {route.name}
                  </h3>
                  <div className="flex gap-2 text-slate-300 text-sm font-medium">
                    <span className={route.id === '1' ? 'text-blue-300' : ''}>{route.time}</span>
                    <span className="text-slate-500">·</span>
                    <span>{route.dist}</span>
                  </div>
                </div>
              </div>
              
              <p className="text-slate-300 text-sm mb-4 leading-relaxed">{route.desc}</p>
              
              <div className="flex flex-wrap gap-2">
                {route.tags.map((tag, i) => (
                  <Tag key={i} variant={tag.variant as any} icon={tag.icon}>
                    {tag.text}
                  </Tag>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
