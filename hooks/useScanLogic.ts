import { useState, useRef, useCallback, useEffect } from 'react';
import { bleService } from '../services/bleService';
import { ScanStats, Tag, ScanType, TagVisibility } from '../types';

const TAG_ACTIVE_MS = 1200;
const TAG_HIDE_MS = 3000;
const TAG_RENDER_INTERVAL_MS = 500;

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

const getTagFreshness = (lastSeen: number, now: number): number => {
  const ageMs = now - lastSeen;
  return Math.max(0, Math.min(1, 1 - (ageMs / TAG_HIDE_MS)));
};

export const useScanLogic = (addLog: (msg: string, type: 'info' | 'error' | 'rx' | 'tx') => void) => {
  const [isScanning, setIsScanning] = useState(false);
  const [activeScanType, setActiveScanType] = useState<ScanType>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [stats, setStats] = useState<ScanStats>(DEFAULT_SCAN_STATS);
  const tagsMap = useRef<Map<string, Tag>>(new Map());
  const rafRef = useRef<number | null>(null);
  const publishTimerRef = useRef<number | null>(null);
  const pendingTagChangesRef = useRef(false);
  const lastPublishAtRef = useRef(0);
  const totalReadsRef = useRef(0);
  const windowReadsRef = useRef(0);
  const windowUniqueRef = useRef(0);
  const statsLastAtRef = useRef(Date.now());

  const publishVisibleTags = useCallback((force = false) => {
    const now = Date.now();
    let hasAgingChanges = false;

    for (const [epc, tag] of tagsMap.current) {
      const lastSeen = tag.lastSeen ?? tag.timestamp;
      if (now - lastSeen > TAG_HIDE_MS) {
        tagsMap.current.delete(epc);
        hasAgingChanges = true;
        continue;
      }

      const nextVisibility = getTagVisibility(lastSeen, now);
      const nextFreshness = getTagFreshness(lastSeen, now);
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
  }, []);

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
        count: 0,
      };
      const safeCountDelta = Math.max(0, Math.trunc(countDelta));

      tag.count = Math.max(0, Math.trunc(totalCount));
      tag.delta = safeCountDelta;
      tag.lastRssi = rssi;
      tag.rssi = rssi;
      tag.lastSeen = now;
      tag.timestamp = now;
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
      await bleService.startScan();
      setIsScanning(true);
      setActiveScanType('interactive');
      addLog('Scanning Started', 'info');
    } catch (e: any) { addLog(e.message, 'error'); }
  };

  const stopScan = async () => {
    try {
      if (activeScanType === 'batch') {
        await bleService.stopBatch();
        addLog('Batch Mode Stopped', 'info');
      } else {
        await bleService.stopScan();
        addLog('Scanning Stopped', 'info');
      }
      setIsScanning(false);
      setActiveScanType(null);
    } catch (e: any) { addLog(e.message, 'error'); }
  };

  const startBatch = async () => {
    try {
      await bleService.startBatch();
      setIsScanning(true);
      setActiveScanType('batch');
      addLog('Batch Mode Started', 'info');
    } catch (e: any) { addLog(e.message, 'error'); }
  };

  const clearTags = () => {
    tagsMap.current.clear();
    totalReadsRef.current = 0;
    windowReadsRef.current = 0;
    windowUniqueRef.current = 0;
    statsLastAtRef.current = Date.now();
    setTags([]);
    setStats(DEFAULT_SCAN_STATS);
  };

  return {
    isScanning,
    activeScanType,
    tags,
    stats,
    startScan,
    stopScan,
    startBatch,
    clearTags,
    handleDataReceived
  };
};
