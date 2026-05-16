import React, { useRef, useEffect, useMemo, useState } from 'react';
import { Play, Square, Database, Trash2, Activity, FilterX, Search } from 'lucide-react';
import { Button } from '../ui/Button';
import { ScanStats, Tag } from '../../types';
import AutoSizer from 'react-virtualized-auto-sizer';
import { FixedSizeList as List } from 'react-window';

const RSSI_MIN = 60;
const RSSI_MAX = 110;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const getRssiLevel = (rssi?: number) => {
  if (rssi === undefined || !Number.isFinite(rssi)) return 0;

  if (rssi < 0) {
    const magnitude = clamp(Math.abs(rssi), RSSI_MIN, RSSI_MAX);
    return (RSSI_MAX - magnitude) / (RSSI_MAX - RSSI_MIN);
  }

  return (clamp(rssi, RSSI_MIN, RSSI_MAX) - RSSI_MIN) / (RSSI_MAX - RSSI_MIN);
};

const formatRate = (value: number) => (
  Number.isFinite(value) ? value.toFixed(value >= 10 ? 0 : 1) : '0'
);

const formatRssi = (value: number | null) => (
  value === null || !Number.isFinite(value) ? '--' : value.toFixed(value < 0 ? 0 : 1)
);

const formatLastSeen = (lastSeen?: number) => {
  if (!lastSeen) return '--';

  const ageMs = Math.max(0, Date.now() - lastSeen);
  if (ageMs < 1000) return `${Math.round(ageMs)}ms`;
  return `${(ageMs / 1000).toFixed(1)}s`;
};

const parseExcludeTokens = (value: string) => (
  value
    .toUpperCase()
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter(Boolean)
);

interface ScannerTabProps {
  isScanning: boolean;
  activeScanType: 'interactive' | 'batch' | null;
  onStartScan: () => void;
  onStopScan: () => void;
  onStartBatch: () => void;
  onStopBatch: () => void;
  onClear: () => void;
  tags: Tag[];
  stats: ScanStats;
  onApplyPreset: (mode: 'standard' | 'quick' | 'deep') => void;
  onLocate: (epc: string) => void;
}

export const ScannerTab: React.FC<ScannerTabProps> = ({
  isScanning,
  activeScanType,
  onStartScan,
  onStopScan,
  onStartBatch,
  onStopBatch,
  onClear,
  tags,
  stats,
  onApplyPreset,
  onLocate
}) => {
  const listRef = useRef<List>(null);
  const [activePreset, setActivePreset] = useState<'standard' | 'quick' | 'deep' | null>(null);
  const [excludeFilter, setExcludeFilter] = useState('');

  const excludeTokens = useMemo(() => parseExcludeTokens(excludeFilter), [excludeFilter]);
  const displayedTags = useMemo(() => {
    if (excludeTokens.length === 0) return tags;
    return tags.filter((tag) => !excludeTokens.some((token) => tag.epc.toUpperCase().includes(token)));
  }, [excludeTokens, tags]);

  const displayedRssiAverage = useMemo(() => {
    const values = displayedTags
      .map((tag) => tag.lastRssi ?? tag.rssi)
      .filter((rssi): rssi is number => typeof rssi === 'number' && Number.isFinite(rssi));

    if (values.length === 0) return null;
    return values.reduce((sum, rssi) => sum + rssi, 0) / values.length;
  }, [displayedTags]);

  const handlePresetClick = (mode: 'standard' | 'quick' | 'deep') => {
    setActivePreset(mode);
    onApplyPreset(mode);
  };

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollToItem(displayedTags.length);
    }
  }, [displayedTags.length]);

  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const tag = displayedTags[index];
    const isStale = tag.visibility === 'stale';
    const freshness = tag.freshness ?? (isStale ? 0.5 : 1);
    const rowOpacity = 0.28 + (freshness * 0.72);
    const signalLevel = getRssiLevel(tag.lastRssi ?? tag.rssi);
    const epcAlpha = 0.58 + (signalLevel * 0.42);
    const rssiAlpha = 0.55 + (signalLevel * 0.45);
    const signalWash = signalLevel * freshness * 0.12;
    const rowBackground = `linear-gradient(90deg, rgba(0,122,255,${signalWash}) 0%, ${isStale ? '#F5F5F7' : '#FFFFFF'} 26%)`;

    return (
      <div
        style={{
          ...style,
          opacity: rowOpacity,
          background: rowBackground,
          display: 'grid',
          gridTemplateColumns: '44px minmax(18rem, 1fr) 72px 56px 86px 84px',
          alignItems: 'center',
          transition: 'opacity 500ms ease, background 500ms ease',
        }}
        className="border-b border-[#E5E5EA] px-3 text-xs font-mono text-[#424245]"
      >
        <div className="text-[#A1A1A6] font-semibold">{index + 1}</div>
        <div
          className="min-w-0 font-bold truncate pr-2"
          title={tag.epc}
          style={{ color: `rgba(0,64,170,${epcAlpha})` }}
        >
          {tag.epc}
        </div>
        <div
          className="text-right font-bold"
          style={{ color: `rgba(36,138,61,${rssiAlpha})` }}
        >
          {tag.lastRssi ?? tag.rssi}
        </div>
        <div className="text-right font-bold text-[#424245]">
          {tag.count}
        </div>
        <div className="flex justify-end pl-2">
            <Button 
                size="sm" 
                variant="secondary" 
                className="h-6 text-[10px] px-2 py-0 min-w-0"
                disabled={isScanning}
                onClick={(e) => {
                    e.stopPropagation();
                    onLocate(tag.epc);
                }}
            >
                LOCATE
            </Button>
        </div>
        <div className="text-right font-semibold text-[#6E6E73] pl-2">
          {formatLastSeen(tag.lastSeen)}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full gap-3 p-3 md:p-5 bg-[#F5F5F7]">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
        <div className="rounded-lg border border-[#D2D2D7] bg-white p-3 shadow-sm">
          <p className="text-[10px] font-semibold text-[#6E6E73]">VISIBLE EPC</p>
          <p className="mt-1 text-2xl font-semibold text-[#1D1D1F]">
            {displayedTags.length}
            {excludeTokens.length > 0 && <span className="text-sm text-[#86868B]"> / {stats.visibleTags}</span>}
          </p>
        </div>
        <div className="rounded-lg border border-[#D2D2D7] bg-white p-3 shadow-sm">
          <p className="text-[10px] font-semibold text-[#6E6E73]">TAG COUNT/S</p>
          <p className="mt-1 text-2xl font-semibold text-[#007AFF]">{formatRate(stats.readsPerSecond)}</p>
        </div>
        <div className="rounded-lg border border-[#D2D2D7] bg-white p-3 shadow-sm">
          <p className="text-[10px] font-semibold text-[#6E6E73]">RSSI AVG</p>
          <p className="mt-1 text-2xl font-semibold text-[#248A3D]">{formatRssi(displayedRssiAverage)}</p>
        </div>
        <div className="rounded-lg border border-[#D2D2D7] bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold text-[#6E6E73]">EXCLUDE EPC</p>
            <FilterX size={14} className={excludeTokens.length > 0 ? 'text-[#FF3B30]' : 'text-[#A1A1A6]'} />
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-[#D2D2D7] bg-[#FBFBFD] px-2">
            <Search size={14} className="text-[#86868B] shrink-0" />
            <input
              value={excludeFilter}
              onChange={(event) => setExcludeFilter(event.target.value.toUpperCase())}
              placeholder="EPC prefix, comma separated"
              className="h-8 min-w-0 flex-1 bg-transparent font-mono text-xs text-[#1D1D1F] placeholder-[#A1A1A6] outline-none"
            />
            {excludeFilter && (
              <button
                onClick={() => setExcludeFilter('')}
                className="text-[10px] font-semibold text-[#007AFF]"
              >
                RESET
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Presets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
        <Button 
          variant="secondary" 
          size="sm" 
          onClick={() => handlePresetClick('standard')} 
          className={`text-[10px] h-8 transition-colors ${activePreset === 'standard' ? 'bg-[#007AFF]/10 border-[#007AFF]/30 text-[#007AFF]' : 'bg-white border-[#D2D2D7] text-[#424245]'}`}
        >
          STANDARD (INVENTORY)
        </Button>
        <Button 
          variant="secondary" 
          size="sm" 
          onClick={() => handlePresetClick('quick')} 
          className={`text-[10px] h-8 transition-colors ${activePreset === 'quick' ? 'bg-[#34C759]/10 border-[#34C759]/30 text-[#248A3D]' : 'bg-white border-[#D2D2D7] text-[#424245]'}`}
        >
          QUICK (RETAIL)
        </Button>
        <Button 
          variant="secondary" 
          size="sm" 
          onClick={() => handlePresetClick('deep')} 
          className={`text-[10px] h-8 transition-colors ${activePreset === 'deep' ? 'bg-[#AF52DE]/10 border-[#AF52DE]/30 text-[#8E44AD]' : 'bg-white border-[#D2D2D7] text-[#424245]'}`}
        >
          DEEP (INDUSTRIAL)
        </Button>
      </div>

      {/* Controls */}
      <div className="flex flex-col md:flex-row flex-wrap md:items-center gap-2 bg-white p-2 rounded-lg border border-[#D2D2D7] shadow-sm">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Button 
            variant={activeScanType === 'interactive' ? 'danger' : 'success'} 
            onClick={activeScanType === 'interactive' ? onStopScan : onStartScan}
            disabled={activeScanType === 'batch'}
            className="flex-1 md:min-w-[120px] h-8 text-xs"
          >
            {activeScanType === 'interactive' ? <><Square size={14} fill="currentColor" /> STOP SCAN</> : <><Play size={14} fill="currentColor" /> START SCAN</>}
          </Button>
          
          <Button 
            variant={activeScanType === 'batch' ? 'danger' : 'secondary'} 
            onClick={activeScanType === 'batch' ? onStopScan : onStartBatch}
            disabled={activeScanType === 'interactive'}
            className="flex-1 md:min-w-[120px] h-8 text-xs"
          >
            {activeScanType === 'batch' ? <><Square size={14} fill="currentColor" /> STOP BATCH</> : <><Database size={14} /> BATCH MODE</>}
          </Button>
        </div>

        <div className="flex-1 hidden md:block" />

        <div className="flex items-center justify-between w-full md:w-auto gap-2 text-[#6E6E73] text-xs font-semibold px-2">
          <div className="flex items-center gap-2">
            <Activity size={14} className={isScanning ? 'text-[#34C759] animate-pulse' : 'text-[#A1A1A6]'} />
            <span>{displayedTags.length} TAGS</span>
          </div>
          <Button variant="outline" onClick={onClear} size="sm" className="h-8">
            <Trash2 size={14} /> CLEAR
          </Button>
        </div>

      </div>

      {/* Data Table */}
      <div className="flex-1 bg-white rounded-lg border border-[#D2D2D7] overflow-hidden flex flex-col shadow-sm">
        <div
          className="grid items-center bg-[#FBFBFD] border-b border-[#E5E5EA] px-3 py-2 text-[10px] font-semibold text-[#6E6E73]"
          style={{ gridTemplateColumns: '44px minmax(18rem, 1fr) 72px 56px 86px 84px' }}
        >
          <div>#</div>
          <div className="min-w-0 pr-2">EPC</div>
          <div className="text-right">RSSI</div>
          <div className="text-right">#</div>
          <div className="text-right pl-2">ACT</div>
          <div className="text-right pl-2">LAST SEEN</div>
        </div>
        
        <div className="flex-1 relative">
          {displayedTags.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-[#A1A1A6] gap-2">
              <Database size={32} strokeWidth={1} />
              <p className="font-mono text-xs">{tags.length > 0 ? 'All tags hidden by filter' : 'No Data'}</p>
            </div>
          ) : (
            <AutoSizer>
              {({ height, width }) => (
                <List
                  ref={listRef}
                  height={height}
                  width={width}
                  itemCount={displayedTags.length}
                  itemSize={36}
                >
                  {Row}
                </List>
              )}
            </AutoSizer>
          )}
        </div>
      </div>
    </div>
  );
};
