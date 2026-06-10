import { ArrowLeft, ShieldAlert, Navigation2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { MapMock } from '../components/map/MapMock';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Button } from '../components/ui/Button';
import { Tag } from '../components/ui/Tag';
import { mockRoutes } from './RouteComparison';
import { resolveRoute } from '../utils/routeSelection';
import { useState } from 'react';

export function RouteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const route = resolveRoute(mockRoutes, id) ?? mockRoutes[0];
  const [sheetOpen, setSheetOpen] = useState(true);

  // Example POIs specific to route detail
  const detailPois: any[] = [
    { type: 'start', x: 20, y: 80 },
    { type: 'end', x: 80, y: 20 },
    { type: 'cctv', x: 35, y: 70 },
    { type: 'cctv', x: 50, y: 60 },
    { type: 'bell', x: 45, y: 65 },
    { type: 'store', x: 65, y: 40 },
    { type: 'police', x: 75, y: 30 },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-800 relative">
      <header className="absolute top-0 inset-x-0 z-30 px-4 pt-8 mt-4">
        <button onClick={() => navigate(-1)} className="p-3 text-slate-200 bg-slate-700/90 backdrop-blur-md rounded-full shadow-lg border border-slate-600 active:scale-95 transition-transform">
          <ArrowLeft className="w-6 h-6" />
        </button>
      </header>

      <div className="flex-1 w-full h-full">
        <MapMock showRoute routeType={route.type as any} pois={detailPois} zoom={1.5} />
      </div>

      <BottomSheet isOpen={sheetOpen} onClose={() => {}} hideClose>
        <div className="pb-2">
          <div className="flex justify-between items-end mb-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-50 mb-2">{route.name}</h2>
              <div className="flex gap-3 text-slate-300 text-lg font-medium">
                <span className="text-blue-400">{route.time}</span>
                <span className="text-slate-500">|</span>
                <span>{route.dist}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-8">
            {route.tags.map((tag, i) => (
              <Tag key={i} variant={tag.variant as any} icon={tag.icon}>
                {tag.text}
              </Tag>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <Button size="lg" className="h-16 text-xl shadow-[0_8px_20px_rgba(37,99,235,0.2)] rounded-[24px]" onClick={() => navigate('/navigate', { state: { routeId: route.id } })}>
              <Navigation2 className="w-6 h-6 mr-2" />
              안심귀가 시작
            </Button>
            
            <div className="flex gap-3 mt-2">
              <Button variant="secondary" className="flex-1 rounded-[20px] bg-slate-600 text-slate-200 hover:bg-slate-500" onClick={() => navigate('/share')}>
                보호자에게 공유
              </Button>
              <Button variant="outline" className="flex-1 flex gap-2 rounded-[20px]" onClick={() => window.open('https://www.sexoffender.go.kr', '_blank')}>
                <ShieldAlert className="w-4 h-4 text-slate-300" />
                알림e 확인
              </Button>
            </div>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
