import React from 'react';
import { Bluetooth, BatteryCharging, BatteryFull, BatteryMedium, BatteryLow, Thermometer, Info } from 'lucide-react';
import { Button } from '../ui/Button';
import { ConnectionStatus, Settings } from '../../types';
import { isBatteryCharging } from '../../utils/battery';
import { formatDeviceDisplayName } from '../../utils/deviceIdentity';
import logoUrl from '../../logo/nws_logo.png';

interface TopBarProps {
  status: ConnectionStatus;
  settings: Settings;
  onConnect: () => void;
  onDisconnect: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ status, settings, onConnect, onDisconnect }) => {
  const isConnected = status === 'connected';
  const batterySnapshot = settings.batterySnapshot;
  const hasFreshBatterySnapshot = batterySnapshot !== null && !batterySnapshot.stale;
  const batteryPercent = hasFreshBatterySnapshot ? batterySnapshot.visualPercent : null;
  const displayDeviceName = formatDeviceDisplayName('', undefined, settings.deviceInfo) || 'NHR-10';
  const canonicalDeviceId = settings.deviceCanonicalId.trim();
  const deviceIdentityHint = canonicalDeviceId
    ? `${displayDeviceName} · Canonical ID: ${canonicalDeviceId}`
    : displayDeviceName;
  const statusLabel = status === 'connected'
    ? 'ONLINE'
    : status === 'connecting'
      ? 'CONNECTING'
      : status === 'error'
        ? 'CONNECTION ERROR'
        : 'OFFLINE';

  const getBatteryIcon = (percent: number | null) => {
    if (percent !== null && percent >= 80) return BatteryFull;
    if (percent !== null && percent >= 40) return BatteryMedium;
    return BatteryLow;
  };

  const charging = hasFreshBatterySnapshot && isBatteryCharging(batterySnapshot.chargePhase);
  const BatteryIcon = charging ? BatteryCharging : getBatteryIcon(batteryPercent);
  const isBatteryCritical = batterySnapshot?.protectionState === 'critical' ||
    batterySnapshot?.protectionState === 'warning' ||
    batterySnapshot?.protectionState === 'shutdown';
  const batteryColorClass = !hasFreshBatterySnapshot
    ? 'text-[#8E8E93]'
    : isBatteryCritical
      ? 'text-[#FF3B30]'
      : batterySnapshot.voltageMv <= 7000
        ? 'text-[#FF3B30]'
        : batterySnapshot.voltageMv <= 7400
          ? 'text-[#FF9500]'
          : batterySnapshot.voltageMv <= 7700
            ? 'text-[#C9A400]'
            : batterySnapshot.voltageMv <= 8000
              ? 'text-[#83B900]'
              : 'text-[#34C759]';
  const batteryTitle = batterySnapshot
    ? [
        `Battery gauge: ${batterySnapshot.visualPercent}%`,
        `${batterySnapshot.voltageMv} mV`,
        batterySnapshot.protectionState.toUpperCase(),
        batterySnapshot.loadState,
        batterySnapshot.chargePhase ? `Charge: ${batterySnapshot.chargePhase}` : undefined,
        batterySnapshot.stale ? 'STALE' : undefined,
      ].filter(Boolean).join(' · ')
    : 'Battery snapshot unavailable';

  return (
    <div 
      className="soft-glass-strong flex min-h-[56px] shrink-0 flex-col items-center justify-between gap-2 overflow-hidden border-b border-[#52c7da]/30 px-3 py-2 text-[#1D1D1F] sm:flex-row md:h-14 lg:gap-3 lg:px-5"
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
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
        <div className="soft-surface flex items-center gap-2 rounded-md border border-[#52c7da]/30 px-2.5 py-1">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#34C759]' : status === 'connecting' ? 'bg-[#FF9500] animate-pulse' : 'bg-[#FF3B30]'}`} />
          <div className="min-w-0 leading-tight">
            <span className="block text-[10px] font-semibold text-[#6E6E73]">{statusLabel}</span>
            {isConnected && (
              <span
                className="block max-w-[126px] truncate font-mono text-[10px] font-semibold text-[#166B78] lg:hidden"
                title={deviceIdentityHint}
                aria-label={deviceIdentityHint}
              >
                {displayDeviceName}
              </span>
            )}
          </div>
        </div>

        {/* Telemetry */}
        {isConnected && (
          <>
            <div
              className="flex items-center gap-1.5 text-[#6E6E73]"
              title={batteryTitle}
              aria-label={batteryTitle}
            >
              <BatteryIcon size={14} className={batteryColorClass} />
              <span className={`font-mono text-xs font-medium ${batteryColorClass}`}>
                {batteryPercent !== null ? `${batteryPercent}%` : '--%'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[#6E6E73]" title="Device Temperature">
              <Thermometer size={14} className="text-[#FF9500]" />
              <span className="font-mono text-xs font-medium text-[#424245]">{settings.temperature}°C</span>
            </div>
            <div
              className="soft-surface hidden lg:flex items-center gap-2 text-[#6E6E73] px-2 py-0.5 rounded-lg text-[10px] font-mono border border-[#52c7da]/20"
              title={deviceIdentityHint}
              aria-label={deviceIdentityHint}
            >
              <Info size={12} />
              <span>{displayDeviceName}</span>
            </div>
          </>
        )}

        {/* Action Button */}
        <Button 
          variant={isConnected ? 'danger' : 'primary'} 
          size="sm"
          onClick={isConnected ? onDisconnect : onConnect}
          disabled={status === 'connecting'}
          className={`h-8 min-w-[112px] text-[10px] sm:h-7 sm:min-w-[110px] ${!isConnected ? 'bg-[#52c7da] border-[#52c7da] hover:bg-[#42b9cc]' : ''}`}
        >
          {isConnected ? (
            <div className="flex items-center gap-1.5"><Bluetooth size={12} /> DISCONNECT</div>
          ) : (
            <div className="flex items-center gap-1.5"><Bluetooth size={12} /> {status === 'error' ? 'RETRY BLE' : 'CONNECT BLE'}</div>
          )}
        </Button>
      </div>
    </div>
  );
};
