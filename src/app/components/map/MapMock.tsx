import { cn } from '../ui/utils';
import { Video, Bell, Store, Shield } from 'lucide-react';
import { motion } from 'motion/react';

interface POI {
  type: 'cctv' | 'bell' | 'store' | 'police' | 'start' | 'end';
  x: number; // percentage 0-100
  y: number; // percentage 0-100
}

interface MapMockProps {
  pois?: POI[];
  showRoute?: boolean;
  routeType?: 'safe' | 'fast' | 'main';
  active?: boolean;
  className?: string;
  zoom?: number;
  center?: {x: number, y: number};
}

export function MapMock({ pois = [], showRoute = false, routeType = 'safe', active = false, className, zoom = 1, center = {x: 50, y: 50} }: MapMockProps) {
  const getPOIIcon = (type: string) => {
    switch (type) {
      case 'cctv': return <div className="bg-slate-600 p-1.5 rounded-full border-2 border-emerald-400 shadow-md"><Video className="w-4 h-4 text-emerald-400" /></div>;
      case 'bell': return <div className="bg-slate-600 p-1.5 rounded-full border-2 border-red-400 shadow-md"><Bell className="w-4 h-4 text-red-400" /></div>;
      case 'store': return <div className="bg-slate-600 p-1.5 rounded-full border-2 border-blue-400 shadow-md"><Store className="w-4 h-4 text-blue-400" /></div>;
      case 'police': return <div className="bg-slate-600 p-1.5 rounded-full border-2 border-blue-500 shadow-md"><Shield className="w-4 h-4 text-blue-400" /></div>;
      case 'start': return <div className="bg-slate-200 p-2 rounded-full border-4 border-slate-600 shadow-md"><div className="w-3 h-3 bg-slate-800 rounded-full" /></div>;
      case 'end': return <div className="bg-blue-500 p-2 rounded-full border-4 border-slate-600 shadow-md"><div className="w-3 h-3 bg-slate-100 rounded-full" /></div>;
      default: return null;
    }
  };

  return (
    <div data-testid="map-mock" className={cn("relative w-full h-full bg-slate-700 overflow-hidden", className)}>
      {/* Map Grid Pattern */}
      <div className="absolute inset-0 opacity-30" 
           style={{ backgroundImage: 'linear-gradient(#64748b 2px, transparent 2px), linear-gradient(90deg, #64748b 2px, transparent 2px)', backgroundSize: '40px 40px' }} />
      
      {/* Decorative Map Elements (Parks, Blocks) */}
      <div className="absolute top-10 left-10 w-32 h-40 bg-emerald-800/20 rounded-2xl border border-emerald-700/30" />
      <div className="absolute bottom-20 right-10 w-48 h-32 bg-slate-600/40 rounded-2xl border border-slate-500/30" />
      <div className="absolute top-40 right-20 w-24 h-24 bg-blue-800/30 rounded-full blur-2xl" />

      {/* Routes SVG */}
      {showRoute && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Background Route line */}
          <path d="M 20 80 C 20 50, 50 60, 80 20" fill="none" stroke="#64748b" strokeWidth="8" strokeLinecap="round" />
          
          {/* Active Route line */}
          <motion.path 
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            d="M 20 80 C 20 50, 50 60, 80 20" 
            fill="none" 
            stroke={routeType === 'safe' ? '#34d399' : routeType === 'fast' ? '#60a5fa' : '#fbbf24'} 
            strokeWidth="6" 
            strokeLinecap="round" 
            className="drop-shadow-sm"
          />
        </svg>
      )}

      {/* Active Dot */}
      {active && (
        <motion.div 
          className="absolute top-[65%] left-[32%] -translate-x-1/2 -translate-y-1/2 z-20"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-40" />
            <div className="relative bg-emerald-400 w-6 h-6 rounded-full border-4 border-slate-700 shadow-md flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-slate-800 rounded-full" />
            </div>
          </div>
        </motion.div>
      )}

      {/* POIs */}
      {pois.map((poi, idx) => (
        <motion.div
          key={idx}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: idx * 0.1, type: "spring" }}
          className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
          style={{ left: `${poi.x}%`, top: `${poi.y}%` }}
        >
          {getPOIIcon(poi.type)}
        </motion.div>
      ))}
      
      {/* Light gradient overlay for bottom */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-800 to-transparent pointer-events-none" />
    </div>
  );
}
