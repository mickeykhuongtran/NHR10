import { useState, useEffect, useCallback, useRef } from 'react';
import { bleService } from '../services/bleService';
import { ConnectionStatus, Settings, LogEntry } from '../types';

const IDLE_BATTERY_POLL_INTERVAL_MS = 2000;
const IDLE_BATTERY_TIMEOUT_MS = 6000;
const SCAN_NO_TAGS_BATTERY_POLL_INTERVAL_MS = 3000;
const SCAN_LIVE_TAGS_BATTERY_POLL_INTERVAL_MS = 5000;
const BATCH_BATTERY_POLL_INTERVAL_MS = 10000;
const BATCH_BATTERY_TIMEOUT_MS = 30000;
const SCAN_ACTIVITY_TIMEOUT_MS = 9000;
const HEARTBEAT_CHECK_INTERVAL_MS = 500;
const TEMPERATURE_POLL_INTERVAL_MS = 5000;

const parseFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseLinkProfile = (data: any): number | null => (
  parseFiniteNumber(data.val ?? data.profile ?? data.linkProfile ?? data.link_profile)
);

type InventoryMode = 'idle' | 'interactive' | 'batch' | 'batchSaving' | 'locate';

export const useRFIDConnection = () => {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [inventoryActive, setInventoryActiveState] = useState(false);
  const [inventoryMode, setInventoryModeState] = useState<InventoryMode>('idle');
  const lastBatteryHeartbeatRef = useRef<number | null>(null);
  const lastDeviceActivityRef = useRef<number | null>(null);
  const lastLiveTagsAtRef = useRef<number | null>(null);
  const lastBatteryPollAtRef = useRef(0);
  const inventoryActiveRef = useRef(false);
  const inventoryModeRef = useRef<InventoryMode>('idle');
  const heartbeatTimeoutReportedRef = useRef(false);
  const [settings, setSettings] = useState<Settings>({
    power: 30,
    buzzer: true,
    tagFocus: false,
    fastTid: false,
    linkProfile: 53,
    qValue: 4,
    session: 1,
    scanParams: { interval: 0, dwell: 0, count: 0 },
    version: '1.0.0',
    temperature: 0,
    battery: 0,
    batteryState: 'normal',
    deviceInfo: ''
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { timestamp: Date.now(), message, type }].slice(-1000));
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const clearDeviceTelemetry = useCallback(() => {
    setSettings(s => ({
      ...s,
      battery: 0,
      batteryState: 'normal',
      temperature: 0,
      deviceInfo: '',
    }));
  }, []);

  const markDeviceActivity = useCallback((cmd?: string) => {
    const now = Date.now();
    lastDeviceActivityRef.current = now;
    if (cmd === 'live_tags') {
      lastLiveTagsAtRef.current = now;
    }
    heartbeatTimeoutReportedRef.current = false;
  }, []);

  const markBatteryHeartbeat = useCallback(() => {
    lastBatteryHeartbeatRef.current = Date.now();
    markDeviceActivity('GB');
  }, [markDeviceActivity]);

  const setInventoryActive = useCallback((active: boolean, mode: InventoryMode = active ? 'interactive' : 'idle') => {
    const nextMode = active ? mode : 'idle';
    inventoryActiveRef.current = active;
    inventoryModeRef.current = nextMode;
    setInventoryActiveState(active);
    setInventoryModeState(nextMode);
    if (active && nextMode !== 'batch' && nextMode !== 'batchSaving') {
      markDeviceActivity(nextMode);
    } else {
      lastLiveTagsAtRef.current = null;
    }
  }, [markDeviceActivity]);

  const markDeviceOffline = useCallback((reason = 'Device battery heartbeat timeout') => {
    if (heartbeatTimeoutReportedRef.current) return;

    heartbeatTimeoutReportedRef.current = true;
    lastBatteryHeartbeatRef.current = null;
    lastDeviceActivityRef.current = null;
    lastLiveTagsAtRef.current = null;
    lastBatteryPollAtRef.current = 0;
    inventoryActiveRef.current = false;
    inventoryModeRef.current = 'idle';
    setInventoryActiveState(false);
    setInventoryModeState('idle');
    bleService.disconnect();
    setStatus('disconnected');
    clearDeviceTelemetry();
    addLog(reason, 'error');
  }, [addLog, clearDeviceTelemetry]);

  const handleDataReceived = useCallback((data: any) => {
    markDeviceActivity(data.cmd);

    // 3. Settings Responses
    if (data.cmd === 'DI') {
        const deviceName = typeof data.val === 'string' ? data.val.trim() : '';
        if (deviceName) {
            setSettings(s => ({ ...s, deviceInfo: deviceName }));
        }
    }
    if (data.cmd === 'GRI') setSettings(s => ({ ...s, version: data.ver, power: data.pwr }));
    if (data.cmd === 'GT') setSettings(s => ({ ...s, temperature: data.val }));
    if (data.cmd === 'GB') {
        markBatteryHeartbeat();
        setStatus(current => current === 'connecting' ? 'connected' : current);
        if (data.voltage !== undefined) {
            setSettings(s => ({ ...s, battery: data.voltage, batteryState: data.state }));
        } else {
            setSettings(s => ({ ...s, battery: data.val }));
        }
    }
    if (data.cmd === 'GP') setSettings(s => ({ ...s, power: data.val }));
    if (data.cmd === 'GLP' || data.cmd === 'SLP') {
        const profile = parseLinkProfile(data);
        if (profile !== null) {
            setSettings(s => ({ ...s, linkProfile: profile }));
        }
    }
    if (data.cmd === 'GQS') {
        let q = data.q;
        let s = data.session;
        if (q === undefined && typeof data.val === 'string') {
            const parts = data.val.split(',');
            if (parts.length >= 2) {
                q = parseInt(parts[0]);
                s = parseInt(parts[1]);
            }
        }
        if (q !== undefined && s !== undefined) {
            setSettings(prev => ({ ...prev, qValue: q, session: s }));
        }
    }
    if (data.cmd === 'GQP') {
        let interval = data.interval;
        let dwell = data.dwell;
        let append = data.times; // Firmware sends 'times' for append value
        
        if (interval === undefined && typeof data.val === 'string') {
            const parts = data.val.split(',');
            if (parts.length >= 3) {
                interval = parseInt(parts[0]);
                dwell = parseInt(parts[1]);
                append = parseInt(parts[2]);
            }
        }
        
        if (interval !== undefined || dwell !== undefined || append !== undefined) {
            // V12.6: Firmware sends interval in ms and dwell as raw count
            const uiInterval = interval ?? 0;
            const uiDwell = dwell ?? 0;
            const uiAppend = append ?? 0;

            setSettings(prev => ({ 
                ...prev, 
                scanParams: { 
                    interval: uiInterval, 
                    dwell: uiDwell, 
                    count: uiAppend, // Legacy
                    append: uiAppend 
                } 
            }));
        }
    }
    if (data.cmd === 'GTF') {
        const val = parseInt(String(data.val));
        setSettings(prev => ({ ...prev, tagFocus: val === 1 }));
    }
  }, [markBatteryHeartbeat, markDeviceActivity]);

  const connect = async () => {
    setStatus('connecting');
    heartbeatTimeoutReportedRef.current = false;
    const now = Date.now();
    lastBatteryHeartbeatRef.current = now;
    lastDeviceActivityRef.current = now;
    lastLiveTagsAtRef.current = null;
    lastBatteryPollAtRef.current = 0;
    inventoryActiveRef.current = false;
    inventoryModeRef.current = 'idle';
    setInventoryActiveState(false);
    setInventoryModeState('idle');
    clearDeviceTelemetry();
    try {
      await bleService.connect();
      const connectedAt = Date.now();
      lastBatteryHeartbeatRef.current = connectedAt;
      lastDeviceActivityRef.current = connectedAt;
      const advertisedName = bleService.getDeviceName().trim();
      if (advertisedName) {
        setSettings(s => ({ ...s, deviceInfo: advertisedName }));
      }
      setStatus('connected');
      addLog('Connected to NHR-10', 'info');
      
      // Init Settings
      await bleService.getDeviceInfo();
      await bleService.getInfo();
      await bleService.getBattery();
      await bleService.getPower();
      await bleService.getProfile();
      await bleService.getQSession();
      await bleService.getQueryParam();
      await bleService.getTagFocus();
      await bleService.getTemperature();

    } catch (e: any) {
      lastBatteryHeartbeatRef.current = null;
      lastDeviceActivityRef.current = null;
      lastLiveTagsAtRef.current = null;
      lastBatteryPollAtRef.current = 0;
      inventoryActiveRef.current = false;
      inventoryModeRef.current = 'idle';
      setInventoryActiveState(false);
      setInventoryModeState('idle');
      heartbeatTimeoutReportedRef.current = true;
      setStatus('error');
      clearDeviceTelemetry();
      addLog(e.message, 'error');
    }
  };

  const disconnect = () => {
    heartbeatTimeoutReportedRef.current = true;
    lastBatteryHeartbeatRef.current = null;
    lastDeviceActivityRef.current = null;
    lastLiveTagsAtRef.current = null;
    lastBatteryPollAtRef.current = 0;
    inventoryActiveRef.current = false;
    inventoryModeRef.current = 'idle';
    setInventoryActiveState(false);
    setInventoryModeState('idle');
    bleService.disconnect();
    setStatus('disconnected');
    clearDeviceTelemetry();
  };

  const getBatteryPollInterval = useCallback((): number | null => {
    const mode = inventoryModeRef.current;
    if (mode === 'batch') return BATCH_BATTERY_POLL_INTERVAL_MS;
    if (mode === 'batchSaving') return null;
    if (!inventoryActiveRef.current) return IDLE_BATTERY_POLL_INTERVAL_MS;

    const lastLiveTagsAt = lastLiveTagsAtRef.current;
    const hasRecentLiveTags = lastLiveTagsAt !== null && Date.now() - lastLiveTagsAt <= SCAN_ACTIVITY_TIMEOUT_MS;
    return hasRecentLiveTags ? SCAN_LIVE_TAGS_BATTERY_POLL_INTERVAL_MS : SCAN_NO_TAGS_BATTERY_POLL_INTERVAL_MS;
  }, []);

  // Adaptive heartbeat. During inventory, live_tags/FF01 traffic counts as device activity
  // and GB is throttled to avoid stressing BLE while tag traffic is dense.
  useEffect(() => {
    let heartbeatPollId: number | null = null;
    let temperaturePollId: number | null = null;

    if (status === 'connected') {
      const pollBattery = () => {
        if (inventoryModeRef.current === 'batchSaving') return;
        lastBatteryPollAtRef.current = Date.now();
        void bleService.getBattery().catch(e => console.error("Battery poll failed", e));
      };

      if (getBatteryPollInterval() !== null) {
        pollBattery();
      }
      heartbeatPollId = window.setInterval(() => {
        const batteryPollInterval = getBatteryPollInterval();
        if (batteryPollInterval !== null && Date.now() - lastBatteryPollAtRef.current >= batteryPollInterval) {
          pollBattery();
        }
      }, HEARTBEAT_CHECK_INTERVAL_MS);

      if (inventoryMode === 'idle') {
        temperaturePollId = window.setInterval(() => {
          void bleService.getTemperature().catch(e => console.error("Temp poll failed", e));
        }, TEMPERATURE_POLL_INTERVAL_MS);
      }
    }

    return () => {
      if (heartbeatPollId !== null) window.clearInterval(heartbeatPollId);
      if (temperaturePollId !== null) window.clearInterval(temperaturePollId);
    };
  }, [getBatteryPollInterval, inventoryMode, status]);

  useEffect(() => {
    if (status !== 'connected') return;

    const heartbeatCheckId = window.setInterval(() => {
      const now = Date.now();
      const mode = inventoryModeRef.current;
      if (mode === 'batchSaving') {
        return;
      }

      if (mode === 'batch') {
        const lastHeartbeat = lastBatteryHeartbeatRef.current;
        if (!lastHeartbeat || now - lastHeartbeat > BATCH_BATTERY_TIMEOUT_MS) {
          markDeviceOffline('Device offline: no batch battery update for 30s');
        }
        return;
      }

      if (inventoryActiveRef.current) {
        const lastActivity = lastDeviceActivityRef.current;
        if (!lastActivity || now - lastActivity > SCAN_ACTIVITY_TIMEOUT_MS) {
          markDeviceOffline('Device offline: no FF01 activity for 9s');
        }
        return;
      }

      const lastHeartbeat = lastBatteryHeartbeatRef.current;
      if (!lastHeartbeat || now - lastHeartbeat > IDLE_BATTERY_TIMEOUT_MS) {
        markDeviceOffline('Device offline: no battery update for 6s');
      }
    }, HEARTBEAT_CHECK_INTERVAL_MS);

    return () => window.clearInterval(heartbeatCheckId);
  }, [markDeviceOffline, status]);

  return {
    status,
    settings,
    setSettings,
    logs,
    addLog,
    clearLogs,
    connect,
    disconnect,
    setInventoryActive,
    handleDataReceived // Exported to be combined with other handlers
  };
};
