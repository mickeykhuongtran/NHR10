import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { Play, Square, Database, FilterX, RotateCcw, Copy, Check, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { BatchSaveInfo, ScanStats, Tag } from '../../types';
import AutoSizer from 'react-virtualized-auto-sizer';
import { FixedSizeList as List } from 'react-window';

const RSSI_MIN = 60;
const RSSI_MAX = 110;
const DESKTOP_TABLE_MIN_WIDTH = 1000;
const TABLET_TABLE_MIN_WIDTH = 740;
const DESKTOP_TAG_TABLE_COLUMNS = '52px minmax(20rem, 1fr) 156px 92px 116px 116px 132px';
const TABLET_TAG_TABLE_COLUMNS = '44px minmax(13rem, 1fr) 120px 78px 108px 118px';
const MOBILE_TAG_ITEM_SIZE = 236;
const TIMER_UPDATE_INTERVAL_MS = 100;
const PRESET_OPTIONS = [
  {
    mode: 'standard',
    label: 'STANDARD',
    title: 'Inventory scanning',
    description: 'Recommended for inventory scans, dense tag populations, and high-density tag environments.',
  },
  {
    mode: 'quick',
    label: 'QUICK',
    title: 'Fast tracking',
    description: 'Recommended for quick scans with fewer tags and continuous tag-state monitoring.',
  },
  {
    mode: 'deep',
    label: 'DEEP',
    title: 'Maximum range',
    description: 'Recommended for tag search when the longest possible read distance matters.',
  },
] as const;

type ScanPresetMode = (typeof PRESET_OPTIONS)[number]['mode'];
type ViewportMode = 'phone' | 'tablet' | 'desktop';
type TableVariant = Extract<ViewportMode, 'tablet' | 'desktop'>;

const getViewportMode = (): ViewportMode => {
  if (typeof window === 'undefined') return 'desktop';
  if (window.innerWidth < 640) return 'phone';
  if (window.innerWidth < 1024) return 'tablet';
  return 'desktop';
};

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

const formatRssi = (value: number | null | undefined) => (
  value === null || value === undefined || !Number.isFinite(value) ? '--' : value.toFixed(value < 0 ? 0 : 1)
);

const formatCount = (value: number | null | undefined) => (
  value === null || value === undefined || !Number.isFinite(value) ? '0' : Math.max(0, Math.trunc(value)).toLocaleString('en-US')
);

const formatClock = (timestamp?: number) => {
  if (!timestamp) return '--';

  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

const getDurationParts = (durationMs: number) => {
  const safeDuration = Math.max(0, Math.floor(durationMs));
  const totalSeconds = Math.floor(safeDuration / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = safeDuration % 1000;

  return {
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
    milliseconds: String(milliseconds).padStart(3, '0'),
  };
};

const formatStaleRemoveUnits = (valueMs: number) => (
  String(clamp(Math.round(valueMs / 100), 1, 600))
);

const EpcCell = React.memo(({
  className = 'pr-4',
  epc,
  isCopied,
  onCopy,
}: {
  className?: string;
  epc: string;
  isCopied: boolean;
  onCopy: (epc: string) => void;
}) => (
  <div className={`group/epc flex min-w-0 items-center ${className}`} title={epc}>
    <span className="min-w-0 select-text truncate font-bold tracking-wide text-[#0C4F5B]">
      {epc}
    </span>
    <button
      type="button"
      className={`ml-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-[#52c7da]/35 ${
        isCopied
          ? 'text-[#166B78] opacity-100'
          : 'text-[#8E8E93] opacity-35 hover:bg-[#F5F5F7] hover:text-[#52666B] hover:opacity-90 group-hover/epc:opacity-55'
      }`}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onCopy(epc);
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        onCopy(epc);
      }}
      title={isCopied ? 'Copied EPC' : 'Copy EPC'}
      aria-label={isCopied ? 'Copied EPC' : `Copy EPC ${epc}`}
    >
      {isCopied ? <Check size={14} strokeWidth={1.9} /> : <Copy size={14} strokeWidth={1.7} />}
    </button>
  </div>
));

EpcCell.displayName = 'EpcCell';

interface ScannerTabProps {
  isScanning: boolean;
  activeScanType: 'interactive' | 'batch' | null;
  scanStartedAt: number | null;
  scanStoppedAt: number | null;
  removeStaleTags: boolean;
  staleRemoveMs: number;
  onChangeRemoveStaleTags: (enabled: boolean) => void;
  onChangeStaleRemoveMs: (value: number) => void;
  onStartScan: () => void;
  onStopScan: () => void;
  onStartBatch: () => void;
  onStopBatch: () => void;
  onClear: () => void;
  tags: Tag[];
  stats: ScanStats;
  onApplyPreset: (mode: ScanPresetMode) => void;
  isBatchSaving: boolean;
  batchSaveInfo: BatchSaveInfo;
}

export const ScannerTab: React.FC<ScannerTabProps> = ({
  isScanning,
  activeScanType,
  scanStartedAt,
  scanStoppedAt,
  removeStaleTags,
  staleRemoveMs,
  onChangeRemoveStaleTags,
  onChangeStaleRemoveMs,
  onStartScan,
  onStopScan,
  onStartBatch,
  onStopBatch,
  onClear,
  tags,
  stats,
  onApplyPreset,
  isBatchSaving,
  batchSaveInfo
}) => {
  const listRef = useRef<List>(null);
  const staleRemoveInputRef = useRef<HTMLInputElement>(null);
  const copyFeedbackTimerRef = useRef<number | null>(null);
  const [activePreset, setActivePreset] = useState<ScanPresetMode>('standard');
  const [scannerPanel, setScannerPanel] = useState<'live' | 'excluded'>('live');
  const [excludedEpcs, setExcludedEpcs] = useState<string[]>([]);
  const [excludedSnapshots, setExcludedSnapshots] = useState<Record<string, Tag>>({});
  const [copiedEpc, setCopiedEpc] = useState<string | null>(null);
  const [runtimeNow, setRuntimeNow] = useState(Date.now());
  const [rateHistory, setRateHistory] = useState<number[]>([]);
  const [viewportMode, setViewportMode] = useState<ViewportMode>(() => getViewportMode());
  const [staleRemoveUnitsInput, setStaleRemoveUnitsInput] = useState(() => formatStaleRemoveUnits(staleRemoveMs));
  const [isEditingStaleRemoveMs, setIsEditingStaleRemoveMs] = useState(false);
  const primaryScanActionAtRef = useRef(0);
  const batchScanActionAtRef = useRef(0);
  const scannerPanelActionAtRef = useRef(0);

  const excludedSet = useMemo(() => new Set(excludedEpcs), [excludedEpcs]);
  const tagsByEpc = useMemo(() => new Map(tags.map((tag) => [tag.epc, tag])), [tags]);
  const displayedTags = useMemo(() => (
    tags.filter((tag) => !excludedSet.has(tag.epc))
  ), [excludedSet, tags]);
  const excludedTags = useMemo(() => (
    excludedEpcs.map((epc) => tagsByEpc.get(epc) ?? excludedSnapshots[epc] ?? {
      epc,
      timestamp: 0,
      firstSeen: undefined,
      count: 0,
      freshness: 0.48,
      visibility: 'stale' as const,
    })
  ), [excludedEpcs, excludedSnapshots, tagsByEpc]);

  const displayedRssiAverage = useMemo(() => {
    const values = displayedTags
      .map((tag) => tag.lastRssi ?? tag.rssi)
      .filter((rssi): rssi is number => typeof rssi === 'number' && Number.isFinite(rssi));

    if (values.length === 0) return null;
    return values.reduce((sum, rssi) => sum + rssi, 0) / values.length;
  }, [displayedTags]);

  useEffect(() => {
    const handleResize = () => {
      const nextMode = getViewportMode();
      setViewportMode((currentMode) => currentMode === nextMode ? currentMode : nextMode);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);

    const breakpointQueries = [
      window.matchMedia('(max-width: 639px)'),
      window.matchMedia('(min-width: 1024px)'),
    ];

    breakpointQueries.forEach((query) => query.addEventListener('change', handleResize));

    const viewportPollId = window.setInterval(handleResize, 500);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
      breakpointQueries.forEach((query) => query.removeEventListener('change', handleResize));
      window.clearInterval(viewportPollId);
    };
  }, []);

  useEffect(() => {
    const nextRate = Number.isFinite(stats.readsPerSecond) ? stats.readsPerSecond : 0;
    setRateHistory((current) => [...current.slice(-17), nextRate]);
  }, [stats.readsPerSecond]);

  useEffect(() => {
    setRateHistory([]);
  }, [scanStartedAt]);

  useEffect(() => {
    setExcludedSnapshots({});
  }, [scanStartedAt]);

  useEffect(() => {
    if (!isEditingStaleRemoveMs && staleRemoveUnitsInput !== '') {
      setStaleRemoveUnitsInput(formatStaleRemoveUnits(staleRemoveMs));
    }
  }, [isEditingStaleRemoveMs, staleRemoveMs, staleRemoveUnitsInput]);

  useEffect(() => {
    setExcludedSnapshots((current) => {
      let changed = false;
      const next: Record<string, Tag> = {};

      excludedEpcs.forEach((epc) => {
        const liveTag = tagsByEpc.get(epc);
        const previousTag = current[epc];
        if (liveTag) {
          next[epc] = { ...liveTag };
          changed = changed || previousTag !== liveTag;
          return;
        }

        if (previousTag) {
          next[epc] = previousTag;
        }
      });

      if (Object.keys(current).length !== Object.keys(next).length) {
        changed = true;
      }

      return changed ? next : current;
    });
  }, [excludedEpcs, tagsByEpc]);

  const addExcludedEpc = useCallback((epc: string) => {
    setExcludedEpcs((current) => current.includes(epc) ? current : [...current, epc]);
  }, []);

  const removeExcludedEpc = useCallback((epc: string) => {
    setExcludedEpcs((current) => current.filter((item) => item !== epc));
  }, []);

  const excludeEpcFromDisplay = useCallback((epc: string) => {
    addExcludedEpc(epc);
  }, [addExcludedEpc]);

  const includeEpcInLive = useCallback((epc: string) => {
    removeExcludedEpc(epc);
  }, [removeExcludedEpc]);

  const copyEpcToClipboard = useCallback(async (epc: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(epc);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = epc;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      setCopiedEpc(epc);
      if (copyFeedbackTimerRef.current !== null) {
        window.clearTimeout(copyFeedbackTimerRef.current);
      }
      copyFeedbackTimerRef.current = window.setTimeout(() => {
        setCopiedEpc(null);
        copyFeedbackTimerRef.current = null;
      }, 900);
    } catch (error) {
      console.error('Failed to copy EPC', error);
    }
  }, []);

  const handlePresetClick = (mode: ScanPresetMode) => {
    if (isBatchSaving) return;
    setActivePreset(mode);
    onApplyPreset(mode);
  };

  const runPrimaryScanAction = useCallback((source: 'early' | 'click') => {
    const now = Date.now();
    if (source === 'click' && now - primaryScanActionAtRef.current < 650) {
      return;
    }

    if (source === 'early') {
      if (now - primaryScanActionAtRef.current < 250) {
        return;
      }
      primaryScanActionAtRef.current = now;
    }

    if (activeScanType === 'interactive') {
      onStopScan();
      return;
    }

    onStartScan();
  }, [activeScanType, onStartScan, onStopScan]);

  const runBatchScanAction = useCallback((source: 'early' | 'click') => {
    const now = Date.now();
    if (source === 'click' && now - batchScanActionAtRef.current < 650) {
      return;
    }

    if (source === 'early') {
      if (now - batchScanActionAtRef.current < 250) {
        return;
      }
      batchScanActionAtRef.current = now;
    }

    if (activeScanType === 'batch') {
      onStopBatch();
      return;
    }

    onStartBatch();
  }, [activeScanType, onStartBatch, onStopBatch]);

  const switchScannerPanel = useCallback((panel: 'live' | 'excluded', source: 'early' | 'click') => {
    const now = Date.now();
    if (source === 'click' && now - scannerPanelActionAtRef.current < 650) {
      return;
    }

    if (source === 'early') {
      if (now - scannerPanelActionAtRef.current < 250) {
        return;
      }
      scannerPanelActionAtRef.current = now;
    }

    flushSync(() => {
      setScannerPanel(panel);
    });
  }, []);

  const getScannerPanelHandlers = useCallback((panel: 'live' | 'excluded') => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === 'mouse') return;
      event.preventDefault();
      switchScannerPanel(panel, 'early');
    },
    onTouchStart: (event: React.TouchEvent<HTMLButtonElement>) => {
      event.preventDefault();
      switchScannerPanel(panel, 'early');
    },
    onClick: () => switchScannerPanel(panel, 'click'),
  }), [switchScannerPanel]);

  const renderScanActionButtons = (isMobileSticky = false) => (
    <>
      <Button
        variant={activeScanType === 'interactive' ? 'danger' : 'success'}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse') return;
          event.preventDefault();
          runPrimaryScanAction('early');
        }}
        onTouchStart={(event) => {
          event.preventDefault();
          runPrimaryScanAction('early');
        }}
        onClick={() => runPrimaryScanAction('click')}
        disabled={activeScanType === 'batch' || (isBatchSaving && activeScanType !== 'interactive')}
        className={`${isMobileSticky ? 'h-11 min-w-0 flex-1 text-xs' : 'h-10 min-w-[132px] flex-1 text-xs sm:h-9 sm:flex-none'} ${
          activeScanType !== 'interactive' ? 'bg-[#52c7da] border-[#52c7da] hover:bg-[#42b9cc]' : ''
        }`}
      >
        {isBatchSaving && activeScanType !== 'interactive' ? (
          <><Database size={14} /> SAVING...</>
        ) : activeScanType === 'interactive' ? (
          <><Square size={14} fill="currentColor" /> STOP SCAN</>
        ) : (
          <><Play size={14} fill="currentColor" /> START SCAN</>
        )}
      </Button>

      <Button
        variant={activeScanType === 'batch' ? 'danger' : 'secondary'}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse') return;
          event.preventDefault();
          runBatchScanAction('early');
        }}
        onTouchStart={(event) => {
          event.preventDefault();
          runBatchScanAction('early');
        }}
        onClick={() => runBatchScanAction('click')}
        disabled={activeScanType === 'interactive' || isBatchSaving}
        className={`${isMobileSticky ? 'h-11 min-w-0 flex-1 text-xs' : 'h-10 min-w-[132px] flex-1 text-xs sm:h-9 sm:flex-none'}`}
      >
        {isBatchSaving ? (
          <>SAVING {Math.round(batchSaveInfo.progress)}%</>
        ) : activeScanType === 'batch' ? (
          <>STOP BATCH</>
        ) : (
          <>BATCH MODE</>
        )}
      </Button>
    </>
  );

  useEffect(() => {
    if (listRef.current && scannerPanel === 'live') {
      listRef.current.scrollToItem(Math.max(0, displayedTags.length - 1));
    }
  }, [displayedTags.length, scannerPanel]);

  useEffect(() => {
    if (!isScanning) {
      setRuntimeNow(Date.now());
      return;
    }

    setRuntimeNow(Date.now());
    const intervalId = window.setInterval(() => setRuntimeNow(Date.now()), TIMER_UPDATE_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [isScanning, scanStartedAt]);

  useEffect(() => () => {
    if (copyFeedbackTimerRef.current !== null) {
      window.clearTimeout(copyFeedbackTimerRef.current);
    }
  }, []);

  const runtimeAnchor = isScanning ? runtimeNow : scanStoppedAt;
  const scanRuntimeParts = scanStartedAt && runtimeAnchor
    ? getDurationParts(runtimeAnchor - scanStartedAt)
    : getDurationParts(0);
  const activePresetIndex = Math.max(0, PRESET_OPTIONS.findIndex((preset) => preset.mode === activePreset));
  const activePresetOption = PRESET_OPTIONS[activePresetIndex] ?? PRESET_OPTIONS[0];
  const presetIndicatorStyle: React.CSSProperties = {
    width: 'calc((100% - 0.5rem) / 3)',
    transform: `translateX(${activePresetIndex * 100}%)`,
  };
  const scannerPanelIndicatorStyle: React.CSSProperties = {
    width: 'calc((100% - 0.5rem) / 2)',
    transform: scannerPanel === 'live' ? 'translateX(0)' : 'translateX(100%)',
  };
  const scannerPanelTrackStyle: React.CSSProperties = {
    width: '200%',
    transform: scannerPanel === 'live' ? 'translateX(0)' : 'translateX(-50%)',
  };
  const tableVariant: TableVariant = viewportMode === 'desktop' ? 'desktop' : 'tablet';
  const activeTableMinWidth = tableVariant === 'desktop' ? DESKTOP_TABLE_MIN_WIDTH : TABLET_TABLE_MIN_WIDTH;
  const listItemSize = viewportMode === 'phone' ? MOBILE_TAG_ITEM_SIZE : 44;
  const applyStaleRemoveUnits = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 3);
    setStaleRemoveUnitsInput(digits);

    if (digits === '') return;

    const units = Number(digits);
    if (!Number.isFinite(units) || units <= 0) return;

    onChangeStaleRemoveMs(clamp(units, 1, 600) * 100);
  };

  const handleStaleRemoveEnabledChange = (enabled: boolean) => {
    if (enabled && staleRemoveUnitsInput.trim() === '') {
      const nextUnits = formatStaleRemoveUnits(staleRemoveMs);
      setStaleRemoveUnitsInput(nextUnits);
      onChangeStaleRemoveMs(Number(nextUnits) * 100);
    }

    onChangeRemoveStaleTags(enabled);
  };

  const handleStaleRemoveBlur = () => {
    setIsEditingStaleRemoveMs(false);

    const units = Number(staleRemoveUnitsInput);
    if (!staleRemoveUnitsInput) {
      return;
    }

    if (!Number.isFinite(units) || units <= 0) {
      setStaleRemoveUnitsInput('');
      return;
    }

    const normalizedUnits = clamp(units, 1, 600);
    setStaleRemoveUnitsInput(String(normalizedUnits));
    onChangeStaleRemoveMs(normalizedUnits * 100);
  };

  const clearStaleRemoveInput = () => {
    setIsEditingStaleRemoveMs(true);
    setStaleRemoveUnitsInput('');
    window.requestAnimationFrame(() => staleRemoveInputRef.current?.focus());
  };

  const SignalCell = ({ compact = false, tag }: { compact?: boolean; tag: Tag }) => {
    const rssi = tag.lastRssi ?? tag.rssi;
    const signalLevel = getRssiLevel(rssi);

    return (
      <div className={`flex items-center gap-2 ${compact ? 'justify-start' : 'justify-end'}`}>
        <div className={`${compact ? 'w-14' : 'w-20'} h-2 overflow-hidden rounded-full bg-[#EAFBFD] ring-1 ring-[#52c7da]/30`}>
          <div
            className="h-full rounded-full bg-[#52c7da]"
            style={{ width: `${Math.max(6, signalLevel * 100)}%` }}
          />
        </div>
        <span className={`${compact ? 'w-10 text-left' : 'w-11 text-right'} font-semibold text-[#166B78]`}>{formatRssi(rssi)}</span>
      </div>
    );
  };

  const TagActionButton = ({ action, compact = false, epc }: { action: 'exclude' | 'include'; compact?: boolean; epc: string }) => {
    const isExcludeAction = action === 'exclude';
    const handleAction = () => {
      if (isExcludeAction) {
        excludeEpcFromDisplay(epc);
      } else {
        includeEpcInLive(epc);
      }
    };

    return (
      <button
        type="button"
        className={`inline-flex items-center justify-center gap-1 rounded-md border border-[#52c7da]/38 bg-white/48 text-[10px] font-semibold text-[#166B78] backdrop-blur-md hover:bg-white/78 ${
          compact ? 'h-7 shrink-0 rounded-full px-2' : 'h-7 px-2'
        }`}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          handleAction();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          handleAction();
        }}
        title={isExcludeAction ? 'Exclude EPC from live table' : 'Include EPC back to live table'}
      >
        {isExcludeAction ? <FilterX size={13} /> : <RotateCcw size={13} />}
        {isExcludeAction ? 'EXCLUDE' : 'INCLUDE'}
      </button>
    );
  };

  const TagRow = ({
    action,
    index,
    style,
    tag,
    variant,
  }: {
    action: 'exclude' | 'include';
    index: number;
    style: React.CSSProperties;
    tag: Tag;
    variant: TableVariant;
  }) => {
    const freshness = tag.timestamp ? tag.freshness ?? 1 : 0.48;
    const rowOpacity = 0.36 + (freshness * 0.64);
    const isDesktop = variant === 'desktop';
    const tableColumns = isDesktop ? DESKTOP_TAG_TABLE_COLUMNS : TABLET_TAG_TABLE_COLUMNS;
    const tableMinWidth = isDesktop ? DESKTOP_TABLE_MIN_WIDTH : TABLET_TABLE_MIN_WIDTH;

    return (
      <div
        style={{
          ...style,
          minWidth: tableMinWidth,
          opacity: rowOpacity,
          display: 'grid',
          gridTemplateColumns: tableColumns,
          alignItems: 'center',
        }}
        className="soft-table-row border-b border-[#DDECEF]/80 px-3 text-xs font-mono text-[#263B40]"
      >
        <div className="font-semibold text-[#7A8E92]">{index + 1}</div>
        <EpcCell epc={tag.epc} isCopied={copiedEpc === tag.epc} onCopy={copyEpcToClipboard} />
        <SignalCell tag={tag} />
        <div className="text-right font-bold text-[#166B78]">{formatCount(tag.count)}</div>
        {isDesktop && (
          <div className="text-right font-semibold text-[#52666B]">{formatClock(tag.firstSeen ?? tag.timestamp)}</div>
        )}
        <div className="text-right font-semibold text-[#52666B]">{formatClock(tag.lastSeen)}</div>
        <div className="flex justify-end">
          <TagActionButton action={action} epc={tag.epc} />
        </div>
      </div>
    );
  };

  const MobileMetric = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="min-h-[42px] rounded-md border border-[#DDECEF]/80 bg-white/62 px-2 py-1">
      <p className="text-[9px] font-bold uppercase tracking-wide text-[#7A8E92]">{label}</p>
      <div className="mt-0.5 font-mono text-xs font-bold text-[#166B78]">{children}</div>
    </div>
  );

  const MobileEpcCell = ({
    epc,
    isCopied,
    onCopy,
  }: {
    epc: string;
    isCopied: boolean;
    onCopy: (epc: string) => void;
  }) => (
    <div className="group/epc flex min-h-[50px] min-w-0 items-center gap-2 rounded-md bg-[#F3FCFE]/62 px-2 py-1.5 ring-1 ring-[#52c7da]/18" title={epc}>
      <span className="min-w-0 flex-1 select-text break-all font-mono text-[12px] font-bold leading-4 tracking-wide text-[#0C4F5B]">
        {epc}
      </span>
      <button
        type="button"
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-[#52c7da]/35 ${
          isCopied
            ? 'text-[#166B78] opacity-100'
            : 'text-[#8E8E93] opacity-35 hover:bg-white/78 hover:text-[#52666B] hover:opacity-90 group-hover/epc:opacity-55'
        }`}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onCopy(epc);
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          onCopy(epc);
        }}
        title={isCopied ? 'Copied EPC' : 'Copy EPC'}
        aria-label={isCopied ? 'Copied EPC' : `Copy EPC ${epc}`}
      >
        {isCopied ? <Check size={14} strokeWidth={1.9} /> : <Copy size={14} strokeWidth={1.7} />}
      </button>
    </div>
  );

  const MobileTagCard = ({
    action,
    index,
    style,
    tag,
  }: {
    action: 'exclude' | 'include';
    index: number;
    style: React.CSSProperties;
    tag: Tag;
  }) => {
    const freshness = tag.timestamp ? tag.freshness ?? 1 : 0.48;
    const rowOpacity = 0.36 + (freshness * 0.64);

    return (
      <div
        style={{
          ...style,
          boxSizing: 'border-box',
          opacity: rowOpacity,
          padding: '8px 9px',
        }}
      >
        <div className="soft-table-row box-border flex h-full min-h-0 flex-col gap-2 overflow-hidden rounded-lg border border-[#BFEFF6] bg-white/72 p-3 text-xs shadow-[0_8px_24px_rgba(18,78,90,0.08)]">
          <div className="flex min-h-[30px] min-w-0 items-center justify-between gap-2 border-b border-[#DDECEF]/80 pb-2">
            <span className="flex h-7 w-8 shrink-0 items-center justify-center rounded-md bg-[#E7F9FC] font-mono text-[11px] font-bold text-[#166B78] ring-1 ring-[#52c7da]/25">
              {index + 1}
            </span>
            <TagActionButton action={action} compact epc={tag.epc} />
          </div>

          <MobileEpcCell epc={tag.epc} isCopied={copiedEpc === tag.epc} onCopy={copyEpcToClipboard} />

          <div className="grid grid-cols-2 gap-2">
            <MobileMetric label="Signal"><SignalCell compact tag={tag} /></MobileMetric>
            <MobileMetric label="Count">{formatCount(tag.count)}</MobileMetric>
            <MobileMetric label="1st Seen">{formatClock(tag.firstSeen ?? tag.timestamp)}</MobileMetric>
            <MobileMetric label="Last Seen">{formatClock(tag.lastSeen)}</MobileMetric>
          </div>
        </div>
      </div>
    );
  };

  const LiveRow = ({ index, style }: { index: number; style: React.CSSProperties }) => (
    displayedTags[index]
      ? viewportMode === 'phone'
        ? <MobileTagCard action="exclude" index={index} style={style} tag={displayedTags[index]} />
        : <TagRow action="exclude" index={index} style={style} tag={displayedTags[index]} variant={tableVariant} />
      : null
  );

  const ExcludedRow = ({ index, style }: { index: number; style: React.CSSProperties }) => (
    excludedTags[index]
      ? viewportMode === 'phone'
        ? <MobileTagCard action="include" index={index} style={style} tag={excludedTags[index]} />
        : <TagRow action="include" index={index} style={style} tag={excludedTags[index]} variant={tableVariant} />
      : null
  );

  const StatBlock = ({ label, value, tone = 'dark' }: { label: string; value: React.ReactNode; tone?: 'dark' | 'accent' | 'muted' }) => (
    <div className="min-w-0 overflow-hidden border-r border-b border-[#DDECEF]/75 px-3 py-2 last:border-r-0 sm:px-4 sm:py-3 xl:border-b-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6E7F83]">{label}</p>
      <p className={`mt-1 text-xl font-semibold sm:text-2xl ${tone === 'accent' ? 'text-[#166B78]' : tone === 'muted' ? 'text-[#6E7F83]' : 'text-[#1D1D1F]'}`}>
        {value}
      </p>
    </div>
  );

  const RateSparkline = ({ values }: { values: number[] }) => {
    const normalizedValues = values.length > 0 ? values : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const maxValue = Math.max(1, ...normalizedValues);
    const chartValues = normalizedValues.slice(-18);
    const width = 100;
    const height = 34;
    const lastIndex = Math.max(1, chartValues.length - 1);
    const points = chartValues.map((value, index) => {
      const x = (index / lastIndex) * width;
      const y = height - Math.max(4, (value / maxValue) * (height - 6));
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
    const areaPoints = `0,${height} ${points} ${width},${height}`;

    return (
      <div className="h-9 min-w-0 flex-1 overflow-hidden" aria-hidden="true">
        <svg className="block h-full w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="rateSparklineFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#52c7da" stopOpacity="0.26" />
              <stop offset="100%" stopColor="#52c7da" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <polyline
            points={areaPoints}
            fill="url(#rateSparklineFill)"
            stroke="none"
          />
          <polyline
            points={points}
            fill="none"
            stroke="#52c7da"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    );
  };

  const RateStatBlock = () => (
    <div className="min-w-0 overflow-hidden border-r border-b border-[#DDECEF]/75 px-3 py-2 last:border-r-0 sm:px-4 sm:py-3 xl:border-b-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6E7F83]">Tag Count/s</p>
      <div className="mt-1 flex min-w-0 items-end gap-2">
        <p className="shrink-0 text-2xl font-semibold leading-none text-[#166B78] sm:text-3xl">{formatRate(stats.readsPerSecond)}</p>
        <RateSparkline values={rateHistory} />
      </div>
    </div>
  );

  const TableHeader = ({ variant }: { variant: TableVariant }) => {
    const isDesktop = variant === 'desktop';
    const tableColumns = isDesktop ? DESKTOP_TAG_TABLE_COLUMNS : TABLET_TAG_TABLE_COLUMNS;
    const tableMinWidth = isDesktop ? DESKTOP_TABLE_MIN_WIDTH : TABLET_TABLE_MIN_WIDTH;

    return (
    <div className="overflow-x-auto">
      <div
        className="soft-table-head grid items-center border-b border-[#DDECEF]/75 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[#52666B]"
        style={{ gridTemplateColumns: tableColumns, minWidth: tableMinWidth }}
      >
        <div>#</div>
        <div>EPC</div>
        <div className="text-right">Signal</div>
        <div className="text-right">Count</div>
        {isDesktop && <div className="text-right">1st Seen</div>}
        <div className="text-right">Last Seen</div>
        <div className="text-right">Action</div>
      </div>
    </div>
    );
  };

  return (
    <div className="flex h-full w-full max-w-full touch-pan-y flex-col gap-3 overflow-y-auto overflow-x-hidden overscroll-contain overscroll-x-none bg-transparent p-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:p-3 md:p-5 lg:overflow-hidden">
      <div className="sticky top-0 z-40 -mx-2 -mt-2 px-2 pt-2 sm:hidden">
        <div className="soft-glass flex gap-2 rounded-lg border border-[#52c7da]/28 bg-white/82 p-2 shadow-[0_12px_34px_rgba(18,78,90,0.16)] backdrop-blur-2xl">
          {renderScanActionButtons(true)}
        </div>
      </div>

      <section className="soft-glass min-w-0 rounded-lg">
        <div className="flex flex-col gap-3 border-b border-[#DDECEF]/75 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              {renderScanActionButtons()}
            </div>

            <div className="soft-surface relative ml-0 inline-grid min-w-[218px] flex-1 grid-cols-3 rounded-md border border-[#52c7da]/20 p-1 sm:flex-none lg:ml-2">
              <span
                aria-hidden="true"
                className="absolute bottom-1 left-1 top-1 rounded bg-[#E7F9FC]/95 shadow-[0_8px_22px_rgba(82,199,218,0.18)] ring-1 ring-[#52c7da]/45 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={presetIndicatorStyle}
              />
              {PRESET_OPTIONS.map((preset) => (
                <button
                  key={preset.mode}
                  type="button"
                  onClick={() => handlePresetClick(preset.mode)}
                  disabled={isBatchSaving}
                  aria-label={`${preset.label}: ${preset.description}`}
                  className={`group relative z-10 h-7 px-3 text-[10px] font-semibold uppercase transition-colors focus:outline-none focus-visible:text-[#166B78] ${
                    activePreset === preset.mode
                      ? 'text-[#166B78]'
                      : 'text-[#52666B] hover:bg-white/45 hover:text-[#166B78]'
                  } disabled:opacity-40`}
                >
                  {preset.label}
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute left-1/2 top-[calc(100%+10px)] z-50 hidden w-64 -translate-x-1/2 -translate-y-1 scale-95 rounded-lg border border-[#52c7da]/24 bg-white/90 p-3 text-left normal-case text-[#52666B] opacity-0 shadow-[0_18px_50px_rgba(18,78,90,0.14)] backdrop-blur-xl transition-all duration-200 group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus:translate-y-0 group-focus:scale-100 group-focus:opacity-100 sm:block"
                  >
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-[#166B78]">{preset.title}</span>
                    <span className="mt-1 block text-[11px] font-medium leading-4 text-[#52666B]">{preset.description}</span>
                    <span className="absolute bottom-full left-1/2 h-2 w-2 -translate-x-1/2 translate-y-1/2 rotate-45 border-l border-t border-[#52c7da]/24 bg-white/90" />
                  </span>
                </button>
              ))}
            </div>

            <div className="soft-surface w-full rounded-lg border border-[#52c7da]/20 px-3 py-2 text-left sm:hidden">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#166B78]">{activePresetOption.title}</p>
              <p className="mt-1 text-[11px] font-semibold leading-4 text-[#52666B]">{activePresetOption.description}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            <div className="soft-surface flex h-12 w-[15.25rem] flex-none items-center justify-center rounded-lg border border-[#52c7da]/32 px-2 sm:w-[15.75rem]">
              <div className="seven-segment scan-time-grid text-lg text-[#0C4F5B] sm:text-xl" aria-label={`${scanRuntimeParts.hours}:${scanRuntimeParts.minutes}:${scanRuntimeParts.seconds}:${scanRuntimeParts.milliseconds}`}>
                <span className="scan-time-segment">{scanRuntimeParts.hours}</span>
                <span className="scan-time-separator">:</span>
                <span className="scan-time-segment">{scanRuntimeParts.minutes}</span>
                <span className="scan-time-separator">:</span>
                <span className="scan-time-segment">{scanRuntimeParts.seconds}</span>
                <span className="scan-time-separator">:</span>
                <span className="scan-time-segment">{scanRuntimeParts.milliseconds}</span>
              </div>
            </div>
            <Button variant="outline" onClick={onClear} size="sm" className="h-10 border-[#DDECEF] sm:h-8">
              CLEAR
            </Button>
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-2 overflow-hidden sm:grid-cols-3 xl:grid-cols-5">
          <StatBlock label="Visible EPC" value={displayedTags.length} />
          <StatBlock label="Total Reads" value={stats.totalReads} tone="accent" />
          <RateStatBlock />
          <StatBlock label="RSSI Avg" value={formatRssi(displayedRssiAverage)} />
          <StatBlock label="Excluded" value={excludedEpcs.length} tone="muted" />
        </div>
      </section>

      <section className="soft-glass flex min-h-[26rem] min-w-0 flex-none flex-col overflow-hidden rounded-lg lg:min-h-0 lg:flex-1">
        <div className="flex flex-col gap-2 border-b border-[#DDECEF]/75 bg-white/36 px-2 py-2 backdrop-blur-xl sm:px-3 md:flex-row md:items-center md:justify-between">
          <div className="soft-surface relative inline-grid w-full grid-cols-2 rounded-md border border-[#52c7da]/20 p-1 sm:w-auto sm:min-w-[216px]">
            <span
              aria-hidden="true"
              className="absolute bottom-1 left-1 top-1 rounded bg-[#E7F9FC]/95 shadow-[0_8px_22px_rgba(82,199,218,0.18)] ring-1 ring-[#52c7da]/45 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={scannerPanelIndicatorStyle}
            />
            <button
              type="button"
              className={`relative z-10 h-9 px-2 text-xs font-semibold transition-colors focus:outline-none sm:h-8 sm:px-3 ${scannerPanel === 'live' ? 'text-[#166B78]' : 'text-[#52666B] hover:text-[#166B78]'}`}
              {...getScannerPanelHandlers('live')}
            >
              LIVE TAGS {displayedTags.length}
            </button>
            <button
              type="button"
              className={`relative z-10 h-9 px-2 text-xs font-semibold transition-colors focus:outline-none sm:h-8 sm:px-3 ${scannerPanel === 'excluded' ? 'text-[#166B78]' : 'text-[#52666B] hover:text-[#166B78]'}`}
              {...getScannerPanelHandlers('excluded')}
            >
              EXCLUDED {excludedTags.length}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="soft-surface inline-flex h-9 items-center gap-2 rounded-md border border-[#52c7da]/20 px-2 text-[10px] font-bold uppercase tracking-wide text-[#52666B] sm:h-8">
              <input
                type="checkbox"
                checked={removeStaleTags}
                onChange={(event) => handleStaleRemoveEnabledChange(event.target.checked)}
                className="peer sr-only"
                aria-label="Enable stale tag removal"
              />
              <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                removeStaleTags
                  ? 'border-[#52c7da] bg-[#52c7da] text-white'
                  : 'border-[#52c7da]/35 bg-white/42'
              }`}>
                {removeStaleTags && <Check size={12} strokeWidth={2.4} />}
              </span>
              REMOVE
            </label>

            <div
              className={`soft-surface flex h-9 min-w-[126px] flex-1 items-center justify-center rounded-md border border-[#52c7da]/20 px-2 sm:h-8 sm:w-32 sm:flex-none ${
                removeStaleTags ? 'opacity-100' : 'opacity-40'
              }`}
              title="Type 30 for 3000 ms. The final 00 ms is appended automatically."
            >
              <input
                ref={staleRemoveInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={3}
                value={staleRemoveUnitsInput}
                disabled={!removeStaleTags}
                onFocus={() => setIsEditingStaleRemoveMs(true)}
                onBlur={handleStaleRemoveBlur}
                onChange={(event) => applyStaleRemoveUnits(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-right font-mono text-xs font-semibold text-[#166B78] outline-none disabled:cursor-not-allowed"
                placeholder="30"
                aria-label="Stale remove timeout in hundreds of milliseconds"
              />
              <span className="font-mono text-xs font-semibold text-[#166B78]">
                {staleRemoveUnitsInput ? '00' : ''}
              </span>
              <span className="ml-1 text-[10px] font-bold uppercase tracking-wide text-[#7A8E92]">
                ms
              </span>
              {removeStaleTags && staleRemoveUnitsInput && (
                <button
                  type="button"
                  className="ml-1 flex h-5 w-5 items-center justify-center rounded text-[#8E8E93] hover:bg-white/70 hover:text-[#52666B] focus:outline-none focus:ring-2 focus:ring-[#52c7da]/25"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    clearStaleRemoveInput();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  aria-label="Clear stale remove timeout"
                  title="Clear and type a new timeout"
                >
                  <X size={12} strokeWidth={2.2} />
                </button>
              )}
            </div>

            {scannerPanel === 'excluded' && excludedEpcs.length > 0 && (
              <button
                className="inline-flex h-9 items-center rounded-md border border-[#52c7da]/22 bg-white/52 px-3 text-xs font-semibold text-[#52666B] backdrop-blur-md transition-colors hover:border-[#52c7da]/45 hover:bg-white/78 hover:text-[#166B78] sm:h-8"
                onClick={() => setExcludedEpcs([])}
              >
                CLEAR EXCLUDED
              </button>
            )}
          </div>
        </div>

        <div className="relative h-[22rem] flex-none overflow-hidden sm:h-[28rem] lg:h-auto lg:min-h-0 lg:flex-1">
          <div
            className="flex h-full transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={scannerPanelTrackStyle}
          >
            <div
              className={`flex min-h-0 w-1/2 shrink-0 flex-col overflow-hidden ${scannerPanel === 'live' ? '' : 'pointer-events-none'}`}
              aria-hidden={scannerPanel !== 'live'}
            >
              {viewportMode !== 'phone' && <TableHeader variant={tableVariant} />}
              <div className={`relative min-h-0 flex-1 ${viewportMode === 'phone' ? 'overflow-hidden' : 'overflow-x-auto'}`}>
                {displayedTags.length === 0 ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#7A8E92]">
                    <Database size={32} strokeWidth={1} />
                    <p className="font-mono text-xs">{tags.length > 0 ? 'All live tags are excluded' : 'No tags'}</p>
                  </div>
                ) : (
                  <AutoSizer>
                    {({ height, width }) => (
                      <List
                        ref={listRef}
                        height={height}
                        width={viewportMode === 'phone' ? width : Math.max(width, activeTableMinWidth)}
                        itemCount={displayedTags.length}
                        itemSize={listItemSize}
                      >
                        {LiveRow}
                      </List>
                    )}
                  </AutoSizer>
                )}
              </div>
            </div>

            <div
              className={`flex min-h-0 w-1/2 shrink-0 flex-col overflow-hidden ${scannerPanel === 'excluded' ? '' : 'pointer-events-none'}`}
              aria-hidden={scannerPanel !== 'excluded'}
            >
              {viewportMode !== 'phone' && <TableHeader variant={tableVariant} />}
              <div className={`relative min-h-0 flex-1 ${viewportMode === 'phone' ? 'overflow-hidden' : 'overflow-x-auto'}`}>
                {excludedTags.length === 0 ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#7A8E92]">
                    <FilterX size={32} strokeWidth={1} />
                    <p className="font-mono text-xs">No excluded EPCs</p>
                  </div>
                ) : (
                  <AutoSizer>
                    {({ height, width }) => (
                      <List
                        height={height}
                        width={viewportMode === 'phone' ? width : Math.max(width, activeTableMinWidth)}
                        itemCount={excludedTags.length}
                        itemSize={listItemSize}
                      >
                        {ExcludedRow}
                      </List>
                    )}
                  </AutoSizer>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
