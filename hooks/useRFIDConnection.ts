import { useState, useEffect, useCallback } from 'react';
import { bleService } from '../services/bleService';
import { ConnectionStatus, Settings, LogEntry } from '../types';

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

export const useRFIDConnection = () => {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
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
    deviceInfo: 'NHR-10'
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { timestamp: Date.now(), message, type }].slice(-1000));
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const handleDataReceived = useCallback((data: any) => {
    // 3. Settings Responses
    if (data.cmd === 'DI') setSettings(s => ({ ...s, deviceInfo: data.val }));
    if (data.cmd === 'GRI') setSettings(s => ({ ...s, version: data.ver, power: data.pwr }));
    if (data.cmd === 'GT') setSettings(s => ({ ...s, temperature: data.val }));
    if (data.cmd === 'GB') {
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
  }, []);

  const connect = async () => {
    setStatus('connecting');
    try {
      await bleService.connect();
      setStatus('connected');
      addLog('Connected to NHR-10', 'info');
      
      // Init Settings
      await bleService.getInfo();
      await bleService.getPower();
      await bleService.getProfile();
      await bleService.getQSession();
      await bleService.getQueryParam();
      await bleService.getTagFocus();
      await bleService.getBattery();
      await bleService.getTemperature();

    } catch (e: any) {
      setStatus('error');
      addLog(e.message, 'error');
    }
  };

  const disconnect = () => {
    bleService.disconnect();
    setStatus('disconnected');
  };

  // Battery Polling
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (status === 'connected') {
      interval = setInterval(() => {
        bleService.getBattery().catch(e => console.error("Battery poll failed", e));
        bleService.getTemperature().catch(e => console.error("Temp poll failed", e));
      }, 30000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status]);

  return {
    status,
    settings,
    setSettings,
    logs,
    addLog,
    clearLogs,
    connect,
    disconnect,
    handleDataReceived // Exported to be combined with other handlers
  };
};
