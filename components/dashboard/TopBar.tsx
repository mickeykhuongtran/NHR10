import React from 'react';
import { Bluetooth, BatteryFull, BatteryMedium, BatteryLow, Thermometer, Info } from 'lucide-react';
import { Button } from '../ui/Button';
import { ConnectionStatus, Settings } from '../../types';
import logoUrl from '../../logo/nws_logo.png';

interface TopBarProps {
  status: ConnectionStatus;
  settings: Settings;
  onConnect: () => void;
  onDisconnect: () => void;
}

const calculateBatteryPercent = (mv: number) => {
  // If value is likely already a percentage (e.g. < 100), return it directly
  if (mv <= 100) return mv;
  return Math.round(Math.max(0, Math.min(100, ((mv - 6000) / (8600 - 6000)) * 100)));
};

export const TopBar: React.FC<TopBarProps> = ({ status, settings, onConnect, onDisconnect }) => {
  const isConnected = status === 'connected';
  const batteryPercent = calculateBatteryPercent(settings.battery);
  const displayDeviceName = settings.deviceInfo.trim() || 'NHR-10';

  const getBatteryIcon = (percent: number) => {
    if (percent > 80) return BatteryFull;
    if (percent > 30) return BatteryMedium;
    return BatteryLow;
  };

  const BatteryIcon = React.useMemo(() => getBatteryIcon(batteryPercent), [batteryPercent]);
  const isBatteryCritical = settings.batteryState === 'critical' || settings.batteryState === 'warning';

  return (
    <header 
      className="soft-glass-strong flex min-h-[56px] shrink-0 flex-col items-center justify-between gap-2 overflow-hidden border-b border-[#52c7da]/30 px-3 py-2 text-[#1D1D1F] sm:flex-row md:h-14 lg:gap-3 lg:px-5"
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
      role="banner"
    >
      <div className="flex min-w-0 items-center gap-1">
        <div className="flex h-9 shrink-0 items-center justify-start overflow-hidden sm:h-10">
          <img src={logoUrl} alt="Nextwaves" className="h-9 w-auto object-contain sm:h-10" />
        </div>
        <div className="hidden min-w-0 flex-col border-l border-[#D2D2D7] pl-2 leading-tight sm:flex">
          <h1 className="truncate text-sm font-semibold text-[#1D1D1F]">NHR-10 RFID Console</h1>
          <p className="text-[10px] text-[#6E6E73] font-mono">UHF RFID Controller</p>
        </div>
      </div>

      <div className="flex w-full flex-wrap items-center justify-center gap-2 sm:w-auto sm:gap-3 lg:gap-4">
        {/* Status Indicator */}
        <div className="soft-surface flex items-center gap-2 rounded-md border border-[#52c7da]/30 px-2.5 py-1" role="status" aria-live="polite">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#34C759]' : status === 'connecting' ? 'bg-[#FF9500] animate-pulse' : 'bg-[#FF3B30]'}`} aria-hidden="true" />
          <span className="text-[10px] font-semibold text-[#6E6E73]">
            {status === 'connected' ? 'ONLINE' : status === 'connecting' ? 'CONNECTING' : 'OFFLINE'}
          </span>
        </div>

        {/* Telemetry */}
        {isConnected && (
          <>
            <div className="flex items-center gap-1.5 text-[#6E6E73]" title="Battery Level" role="group" aria-label="Battery level">
              <BatteryIcon size={14} className={isBatteryCritical ? 'text-[#FF3B30]' : 'text-[#34C759]'} aria-hidden="true" />
              <span className={`font-mono text-xs font-medium ${isBatteryCritical ? 'text-[#FF3B30]' : 'text-[#424245]'}`}>
                {batteryPercent}%
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[#6E6E73]" title="Device Temperature" role="group" aria-label="Device temperature">
              <Thermometer size={14} className="text-[#FF9500]" aria-hidden="true" />
              <span className="font-mono text-xs font-medium text-[#424245]">{settings.temperature}°C</span>
            </div>
            <div className="soft-surface hidden lg:flex items-center gap-2 text-[#6E6E73] px-2 py-0.5 rounded-lg text-[10px] font-mono border border-[#52c7da]/20" title="Device name">
              <Info size={12} aria-hidden="true" />
              <span>{displayDeviceName}</span>
            </div>
          </>
        )}

        {/* Action Button */}
        <button 
          type="button"
          onClick={isConnected ? onDisconnect : onConnect}
          disabled={status === 'connecting'}
          className={`inline-flex h-8 min-w-[112px] items-center justify-center gap-1.5 rounded-md border border-transparent bg-[#007AFF] px-3 text-[10px] font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#0062cc] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40 disabled:cursor-not-allowed disabled:opacity-60 sm:h-7 sm:min-w-[110px] ${!isConnected ? 'bg-[#52c7da] border-[#52c7da] hover:bg-[#42b9cc] focus:ring-[#52c7da]/40' : ''} ${isConnected ? 'bg-[#FF3B30] hover:bg-[#d6332a] focus:ring-[#FF3B30]/40' : ''}`}
          aria-pressed={isConnected}
          aria-label={isConnected ? 'Disconnect from device' : 'Connect to device via Bluetooth'}
        >
          <Bluetooth size={12} aria-hidden="true" />
          {isConnected ? 'DISCONNECT' : 'CONNECT BLE'}
        </button>
      </div>
    </header>
  );
};
