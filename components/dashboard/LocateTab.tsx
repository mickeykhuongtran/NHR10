import React, { useState, useEffect } from 'react';
import { Target } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { PageHeader } from './PageHeader';

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
    <div className="flex h-full flex-col gap-3 overflow-y-auto bg-transparent p-2 sm:p-3 md:p-5">
      <PageHeader
        icon={Target}
        title="LOCATE"
        subtitle="Track one EPC by live signal strength for quick asset finding."
        meta={
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            isLocating
              ? 'border-[#52c7da]/35 bg-[#E7F9FC] text-[#166B78]'
              : 'border-[#DDECEF] bg-white/58 text-[#6E7F83]'
          }`}>
            {isLocating ? 'Tracking' : 'Ready'}
          </span>
        }
      />

      <div className="grid min-h-[34rem] flex-1 grid-cols-1 gap-3 lg:min-h-0 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="soft-glass rounded-lg p-4">
          <div className="border-b border-[#DDECEF]/75 pb-3 text-left">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#166B78]">Target EPC</h2>
            <p className="mt-1 text-[11px] font-medium leading-4 text-[#6E6E73]">Paste or type the tag EPC before starting locate mode.</p>
          </div>

          <div className="mt-4 space-y-3">
            <Input
              placeholder="E.g. E2000019..."
              value={targetEpc}
              onChange={(e) => setTargetEpc(e.target.value.toUpperCase())}
              className="h-10 text-left font-mono text-sm uppercase tracking-wide"
            />
            <Button
              fullWidth
              size="md"
              onClick={() => isLocating ? onStopLocate() : onLocate(targetEpc)}
              disabled={!targetEpc && !isLocating}
              variant={isLocating ? 'danger' : 'primary'}
              className="h-10 font-semibold tracking-wide"
            >
              {isLocating ? 'STOP TRACKING' : 'START LOCATING'}
            </Button>
          </div>
        </section>

        <section className="soft-glass relative flex min-h-[24rem] flex-col justify-center overflow-hidden rounded-lg p-4">
          <div className="absolute inset-0 flex items-center justify-center opacity-45 pointer-events-none">
            <div className={`absolute h-28 w-28 rounded-full border border-[#52c7da]/50 ${isLocating ? 'animate-ping' : ''}`} />
            <div className="absolute h-52 w-52 rounded-full border border-[#BFEFF6]" />
            <div className="absolute h-80 w-80 rounded-full border border-[#DDECEF]" />
          </div>

          <div className="relative z-10 mx-auto w-full max-w-md space-y-3">
            <div className="flex justify-between text-[10px] font-semibold uppercase tracking-wide text-[#6E7F83]">
              <span>Weak Signal</span>
              <span>Strong Signal</span>
            </div>
            <div className="relative h-7 overflow-hidden rounded-md border border-[#DDECEF] bg-white/72 shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-[#FF3B30] via-[#FFB020] to-[#34C759] transition-all duration-200 ease-out"
                style={{ width: `${signalStrength}%` }}
              />
              <div
                className="absolute bottom-0 top-0 w-0.5 bg-[#1D1D1F] shadow-sm transition-all duration-200 ease-out"
                style={{ left: `${signalStrength}%` }}
              />
            </div>
            <div className="text-center">
              <p className="font-mono text-3xl font-bold text-[#1D1D1F]">
                {targetRssi !== null ? `${targetRssi} dBm` : '--'}
              </p>
              <p className="mt-1 text-[11px] font-medium text-[#6E6E73]">
                {targetRssi !== null ? 'Signal detected' : 'Waiting for target response'}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
