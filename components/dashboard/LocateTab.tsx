import React, { useState, useEffect } from 'react';
import { Search, Target, Signal, ArrowRight } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface LocateTabProps {
  onLocate: (epc: string) => void;
  onStopLocate: () => void;
  targetRssi: number | null; // Null if not found recently
  isLocating: boolean;
  targetEpc: string;
  setTargetEpc: (epc: string) => void;
}

export const LocateTab: React.FC<LocateTabProps> = ({ onLocate, onStopLocate, targetRssi, isLocating, targetEpc, setTargetEpc }) => {
  const [signalStrength, setSignalStrength] = useState(0);

  useEffect(() => {
    if (targetRssi !== null) {
      // Map RSSI (60 to 110) to 0-100%
      // 60 is weakest, 110 is strongest
      const strength = Math.max(0, Math.min(100, ((targetRssi - 60) / (110 - 60)) * 100));
      setSignalStrength(strength);
    } else {
      setSignalStrength(0);
    }
  }, [targetRssi]);

  return (
    <div className="flex flex-col items-center justify-center h-full p-4 gap-4 bg-slate-950">
      
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center space-y-1">
          <Target className="w-8 h-8 text-cyan-600 mx-auto animate-pulse" />
          <h2 className="text-lg font-bold text-slate-200 tracking-tight">LOCATE ASSET</h2>
          <p className="text-slate-600 text-[10px] font-mono uppercase tracking-widest">Enter EPC to track signal strength</p>
        </div>

        <div className="bg-slate-900 p-4 rounded-sm border border-slate-800 space-y-3">
          <Input 
            placeholder="E.g. E2000019..." 
            value={targetEpc}
            onChange={(e) => setTargetEpc(e.target.value.toUpperCase())}
            className="text-center font-mono text-sm tracking-widest uppercase h-9"
          />
          <Button 
            fullWidth 
            size="md" 
            onClick={() => isLocating ? onStopLocate() : onLocate(targetEpc)}
            disabled={!targetEpc && !isLocating}
            variant={isLocating ? 'danger' : 'primary'}
            className="h-9"
          >
            {isLocating ? 'STOP TRACKING' : 'START LOCATING'}
          </Button>
        </div>
      </div>

      {/* Signal Visualizer */}
      <div className="flex-1 w-full max-w-xl flex flex-col items-center justify-center relative">
        
        {/* Radar Rings */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
          <div className={`absolute w-24 h-24 border border-cyan-500 rounded-full ${isLocating ? 'animate-ping' : ''}`} />
          <div className="absolute w-48 h-48 border border-slate-800 rounded-full" />
          <div className="absolute w-72 h-72 border border-slate-800 rounded-full" />
        </div>

        {/* Signal Bar */}
        <div className="relative z-10 w-full max-w-sm space-y-2">
          <div className="flex justify-between text-[10px] font-bold text-slate-600 uppercase tracking-widest">
            <span>Weak Signal</span>
            <span>Strong Signal</span>
          </div>
          <div className="h-6 bg-slate-900 rounded-sm overflow-hidden border border-slate-800 shadow-inner relative">
            <div 
              className="h-full bg-gradient-to-r from-red-900 via-amber-700 to-emerald-600 transition-all duration-200 ease-out"
              style={{ width: `${signalStrength}%` }}
            />
            {/* Marker */}
            <div 
              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg transition-all duration-200 ease-out"
              style={{ left: `${signalStrength}%` }}
            />
          </div>
          <div className="text-center font-mono text-2xl font-bold text-slate-200 mt-2">
            {targetRssi !== null ? `${targetRssi} dBm` : '--'}
          </div>
        </div>

      </div>
    </div>
  );
};
