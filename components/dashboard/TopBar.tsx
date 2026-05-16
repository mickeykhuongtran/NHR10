import React from 'react';
import { Bluetooth, Battery, BatteryFull, BatteryMedium, BatteryLow, Thermometer, Info, Zap } from 'lucide-react';
import { Button } from '../ui/Button';
import { ConnectionStatus, Settings } from '../../types';

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

  const getBatteryIcon = (percent: number) => {
    if (percent > 80) return BatteryFull;
    if (percent > 30) return BatteryMedium;
    return BatteryLow;
  };

  const BatteryIcon = getBatteryIcon(batteryPercent);
  const isBatteryCritical = settings.batteryState === 'critical' || settings.batteryState === 'warning';

  return (
    <div 
      className="bg-white/80 backdrop-blur-xl text-[#1D1D1F] px-3 lg:px-5 py-2 flex flex-col md:flex-row items-center justify-between gap-2 lg:gap-3 border-b border-[#D2D2D7] min-h-[48px] md:h-12 shrink-0 overflow-hidden"
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
    >
      <div className="flex items-center gap-3">
        <div className="bg-[#007AFF]/10 p-1.5 rounded-lg border border-[#007AFF]/15">
          <Zap className="text-[#007AFF] w-4 h-4" />
        </div>
        <div className="flex items-baseline gap-2">
          <h1 className="text-sm font-semibold text-[#1D1D1F]">NHR-10 <span className="text-[#007AFF]">Dashboard</span></h1>
          <p className="text-[10px] text-[#86868B] font-mono hidden sm:block">UHF RFID Controller</p>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap justify-center">
        {/* Status Indicator */}
        <div className="flex items-center gap-2 bg-[#F5F5F7] px-2 py-1 rounded-lg border border-[#D2D2D7]">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#34C759]' : status === 'connecting' ? 'bg-[#FF9500] animate-pulse' : 'bg-[#FF3B30]'}`} />
          <span className="text-[10px] font-semibold text-[#6E6E73]">
            {status === 'connected' ? 'ONLINE' : status === 'connecting' ? 'CONNECTING' : 'OFFLINE'}
          </span>
        </div>

        {/* Telemetry */}
        {isConnected && (
          <>
            <div className="flex items-center gap-1.5 text-[#6E6E73]" title="Battery Level">
              <BatteryIcon size={14} className={isBatteryCritical ? 'text-[#FF3B30]' : 'text-[#34C759]'} />
              <span className={`font-mono text-xs font-medium ${isBatteryCritical ? 'text-[#FF3B30]' : 'text-[#424245]'}`}>
                {batteryPercent}%
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[#6E6E73]" title="Device Temperature">
              <Thermometer size={14} className="text-[#FF9500]" />
              <span className="font-mono text-xs font-medium text-[#424245]">{settings.temperature}°C</span>
            </div>
            <div className="hidden lg:flex items-center gap-2 text-[#6E6E73] bg-[#F5F5F7] px-2 py-0.5 rounded-lg text-[10px] font-mono border border-[#D2D2D7]">
              <Info size={12} />
              <span>{settings.deviceInfo || 'Unknown Device'}</span>
            </div>
          </>
        )}

        {/* Action Button */}
        <Button 
          variant={isConnected ? 'danger' : 'primary'} 
          size="sm"
          onClick={isConnected ? onDisconnect : onConnect}
          disabled={status === 'connecting'}
          className="min-w-[110px] h-7 text-[10px]"
        >
          {isConnected ? (
            <div className="flex items-center gap-1.5"><Bluetooth size={12} /> DISCONNECT</div>
          ) : (
            <div className="flex items-center gap-1.5"><Bluetooth size={12} /> CONNECT BLE</div>
          )}
        </Button>
      </div>
    </div>
  );
};
