import { useState, useRef, useCallback, useEffect } from 'react';
import { bleService } from '../services/bleService';
import { ScanStats, Tag, ScanType, TagVisibility } from '../types';

const TAG_ACTIVE_MS = 1200;
const DEFAULT_TAG_REMOVE_MS = 3000;
const TAG_RENDER_INTERVAL_MS = 500;
const STOP_COMMAND_RETRY_DELAY_MS = 150;

const DEFAULT_SCAN_STATS: ScanStats = {
  visibleTags: 0,
  totalReads: 0,
  readsPerSecond: 0,
  uniquePerSecond: 0,
  averageRssi: null,
  peakRssi: null,
};

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getTagVisibility = (lastSeen: number, now: number): TagVisibility => (
  now - lastSeen <= TAG_ACTIVE_MS ? 'active' : 'stale'
);

const normalizeRemoveMs = (value: number): number => (
  Math.max(100, Math.min(60000, Math.trunc(value)))
);

const getTagFreshness = (lastSeen: number, now: number, fadeWindowMs: number): number => {
  const ageMs = now - lastSeen;
  return Math.max(0, Math.min(1, 1 - (ageMs / fadeWindowMs)));
};

const wait = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

export const useScanLogic = (addLog: (msg: string, type: 'info' | 'error' | 'rx' | 'tx') => void) => {
  const [isScanning, setIsScanning] = useState(false);
  const [activeScanType, setActiveScanType] = useState<ScanType>(null);
  const [scanStartedAt, setScanStartedAt] = useState<number | null>(null);
  const [scanStoppedAt, setScanStoppedAt] = useState<number | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [stats, setStats] = useState<ScanStats>(DEFAULT_SCAN_STATS);
  const [removeStaleTags, setRemoveStaleTags] = useState(true);
  const [staleRemoveMs, setStaleRemoveMsState] = useState(DEFAULT_TAG_REMOVE_MS);
  const tagsMap = useRef<Map<string, Tag>>(new Map());
  const rafRef = useRef<number | null>(null);
  const publishTimerRef = useRef<number | null>(null);
  const pendingTagChangesRef = useRef(false);
  const lastPublishAtRef = useRef(0);
  const totalReadsRef = useRef(0);
  const windowReadsRef = useRef(0);
  const windowUniqueRef = useRef(0);
  const statsLastAtRef = useRef(Date.now());
  const isScanningRef = useRef(false);
  const activeScanTypeRef = useRef<ScanType>(null);
  const stopRequestedRef = useRef(true);

  const resetScanData = useCallback(() => {
    const now = Date.now();
    tagsMap.current.clear();
    totalReadsRef.current = 0;
    windowReadsRef.current = 0;
    windowUniqueRef.current = 0;
    pendingTagChangesRef.current = false;
    lastPublishAtRef.current = 0;
    statsLastAtRef.current = now;
    setTags([]);
    setStats(DEFAULT_SCAN_STATS);
  }, []);

  const resetScanSession = useCallback(() => {
    stopRequestedRef.current = true;
    isScanningRef.current = false;
    activeScanTypeRef.current = null;
    resetScanData();
    setIsScanning(false);
    setActiveScanType(null);
    setScanStartedAt(null);
    setScanStoppedAt(null);
  }, [resetScanData]);

  const setStaleRemoveMs = useCallback((value: number) => {
    setStaleRemoveMsState(normalizeRemoveMs(value));
  }, []);

  const publishVisibleTags = useCallback((force = false) => {
    const now = Date.now();
    let hasAgingChanges = false;
    const fadeWindowMs = normalizeRemoveMs(staleRemoveMs);

    for (const [epc, tag] of tagsMap.current) {
      const lastSeen = tag.lastSeen ?? tag.timestamp;
      if (removeStaleTags && now - lastSeen > fadeWindowMs) {
        tagsMap.current.delete(epc);
        hasAgingChanges = true;
        continue;
      }

      const nextVisibility = getTagVisibility(lastSeen, now);
      const nextFreshness = getTagFreshness(lastSeen, now, fadeWindowMs);
      if (tag.visibility !== nextVisibility) {
        tag.visibility = nextVisibility;
        hasAgingChanges = true;
      }
      if (Math.abs((tag.freshness ?? 1) - nextFreshness) >= 0.08) {
        tag.freshness = nextFreshness;
        hasAgingChanges = true;
      }
    }

    if (force || pendingTagChangesRef.current || hasAgingChanges) {
      const visibleTags: Tag[] = Array.from(tagsMap.current.values());
      const rssiValues = visibleTags
        .map((tag) => tag.lastRssi ?? tag.rssi)
        .filter((rssi): rssi is number => typeof rssi === 'number' && Number.isFinite(rssi));
      const elapsedSeconds = Math.max(0.001, (now - statsLastAtRef.current) / 1000);
      const averageRssi = rssiValues.length > 0
        ? rssiValues.reduce((sum, rssi) => sum + rssi, 0) / rssiValues.length
        : null;
      const peakRssi = rssiValues.length > 0
        ? rssiValues.reduce((best, rssi) => (rssi > best ? rssi : best), rssiValues[0])
        : null;

      setTags(visibleTags);
      setStats({
        visibleTags: visibleTags.length,
        totalReads: totalReadsRef.current,
        readsPerSecond: windowReadsRef.current / elapsedSeconds,
        uniquePerSecond: windowUniqueRef.current / elapsedSeconds,
        averageRssi,
        peakRssi,
      });

      windowReadsRef.current = 0;
      windowUniqueRef.current = 0;
      statsLastAtRef.current = now;
      pendingTagChangesRef.current = false;
      lastPublishAtRef.current = now;
    }
  }, [removeStaleTags, staleRemoveMs]);

  const requestPublish = useCallback((force = false) => {
    if (force) {
      pendingTagChangesRef.current = true;
    }

    if (rafRef.current !== null) return;

    const elapsed = Date.now() - lastPublishAtRef.current;
    const delay = Math.max(0, TAG_RENDER_INTERVAL_MS - elapsed);

    const runPublish = () => {
      publishTimerRef.current = null;
      rafRef.current = requestAnimationFrame(() => {
        publishVisibleTags(force);
        rafRef.current = null;
      });
    };

    if (delay === 0) {
      runPublish();
      return;
    }

    if (publishTimerRef.current === null) {
      publishTimerRef.current = window.setTimeout(runPublish, delay);
    }
  }, [publishVisibleTags]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (tagsMap.current.size > 0) {
        requestPublish();
      }
    }, TAG_RENDER_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      if (publishTimerRef.current !== null) {
        window.clearTimeout(publishTimerRef.current);
        publishTimerRef.current = null;
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [requestPublish]);

  const handleDataReceived = useCallback((data: any) => {
    if (stopRequestedRef.current || !isScanningRef.current) {
      return;
    }

    if (data.cmd !== 'live_tags' || !Array.isArray(data.d)) {
      return;
    }

    const now = Date.now();
    let hasChanges = false;

    data.d.forEach((item: unknown) => {
      if (!Array.isArray(item) || item.length < 4) return;

      const [rawEpc, rawRssi, rawDelta, rawTotal] = item;
      const epc = typeof rawEpc === 'string' ? rawEpc.trim() : '';
      const rssi = toFiniteNumber(rawRssi);
      const countDelta = toFiniteNumber(rawDelta);
      const totalCount = toFiniteNumber(rawTotal);

      if (!epc || rssi === null || countDelta === null || totalCount === null) {
        return;
      }

      const existingTag = tagsMap.current.get(epc);
      const tag = existingTag ?? {
        epc,
        timestamp: now,
        firstSeen: now,
        count: 0,
      };
      const safeCountDelta = Math.max(0, Math.trunc(countDelta));

      tag.count = Math.max(0, Math.trunc(totalCount));
      tag.delta = safeCountDelta;
      tag.lastRssi = rssi;
      tag.rssi = rssi;
      tag.lastSeen = now;
      tag.timestamp = now;
      tag.firstSeen = tag.firstSeen ?? now;
      tag.freshness = 1;
      tag.visibility = 'active';

      tagsMap.current.set(epc, tag);
      windowReadsRef.current += safeCountDelta;
      totalReadsRef.current += safeCountDelta;
      if (!existingTag) {
        windowUniqueRef.current++;
      }
      hasChanges = true;
    });

    if (hasChanges) {
      requestPublish(true);
    }
  }, [requestPublish]);

  const startScan = async () => {
    try {
      stopRequestedRef.current = true;
      isScanningRef.current = false;
      activeScanTypeRef.current = null;
      resetScanData();
      setScanStartedAt(null);
      setScanStoppedAt(null);
      await bleService.startScan();
      const startedAt = Date.now();
      stopRequestedRef.current = false;
      isScanningRef.current = true;
      activeScanTypeRef.current = 'interactive';
      setIsScanning(true);
      setActiveScanType('interactive');
      setScanStartedAt(startedAt);
      setScanStoppedAt(null);
      addLog('Scanning Started', 'info');
    } catch (e: any) {
      stopRequestedRef.current = true;
      isScanningRef.current = false;
      activeScanTypeRef.current = null;
      addLog(e.message, 'error');
    }
  };

  const stopScan = async () => {
    const stopType = activeScanTypeRef.current ?? activeScanType;
    const wasScanning = isScanningRef.current || isScanning || stopType !== null;
    if (!wasScanning) {
      stopRequestedRef.current = true;
      isScanningRef.current = false;
      activeScanTypeRef.current = null;
      return;
    }

    const stoppedAt = Date.now();
    stopRequestedRef.current = true;
    isScanningRef.current = false;
    activeScanTypeRef.current = null;
    setIsScanning(false);
    setActiveScanType(null);
    setScanStoppedAt(stoppedAt);

    const sendStopCommand = async () => {
      if (stopType === 'batch') {
        await bleService.stopBatch();
        return;
      }

      await bleService.stopScan();
    };

    try {
      await sendStopCommand();
      addLog(stopType === 'batch' ? 'Batch Mode Stopped' : 'Scanning Stopped', 'info');
    } catch (firstError: any) {
      try {
        await wait(STOP_COMMAND_RETRY_DELAY_MS);
        await sendStopCommand();
        addLog(stopType === 'batch' ? 'Batch Mode Stopped after retry' : 'Scanning Stopped after retry', 'info');
      } catch (secondError: any) {
        addLog(`Stop command failed: ${secondError?.message ?? firstError?.message ?? 'Unknown error'}`, 'error');
      }
    }
  };

  const startBatch = async () => {
    try {
      stopRequestedRef.current = true;
      isScanningRef.current = false;
      activeScanTypeRef.current = null;
      resetScanData();
      setScanStartedAt(null);
      setScanStoppedAt(null);
      await bleService.startBatch();
      const startedAt = Date.now();
      stopRequestedRef.current = false;
      isScanningRef.current = true;
      activeScanTypeRef.current = 'batch';
      setIsScanning(true);
      setActiveScanType('batch');
      setScanStartedAt(startedAt);
      setScanStoppedAt(null);
      addLog('Batch Mode Started', 'info');
    } catch (e: any) {
      stopRequestedRef.current = true;
      isScanningRef.current = false;
      activeScanTypeRef.current = null;
      addLog(e.message, 'error');
    }
  };

  const clearTags = () => {
    resetScanData();
  };

  return {
    isScanning,
    activeScanType,
    scanStartedAt,
    scanStoppedAt,
    removeStaleTags,
    staleRemoveMs,
    tags,
    stats,
    setRemoveStaleTags,
    setStaleRemoveMs,
    startScan,
    stopScan,
    startBatch,
    clearTags,
    resetScanSession,
    handleDataReceived
  };
};
