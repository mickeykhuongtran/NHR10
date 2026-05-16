import { useState, useCallback } from 'react';
import { bleService } from '../services/bleService';

export const useLocateLogic = (addLog: (msg: string, type: 'info' | 'error' | 'rx' | 'tx') => void) => {
  const [isLocating, setIsLocating] = useState(false);
  const [targetRssi, setTargetRssi] = useState<number | null>(null);

  const handleDataReceived = useCallback((data: any) => {
    // 2. Single Tag (Locate Mode)
    if (data.cmd === 'F') {
        // Locate response: {"cmd":"F", "epc":"...", "rssi": <number>}
        if (data.rssi !== undefined) {
            setTargetRssi(data.rssi);
        }
    }
  }, []);

  const startLocate = async (epc: any) => {
    // SAFEGUARD: Ensure EPC is a string
    // This prevents the "Value can't exceed 512 bytes" error when an object/event is passed
    let targetEpc = epc;
    
    if (typeof targetEpc !== 'string') {
        console.warn('startLocate received non-string EPC:', targetEpc);
        
        if (typeof targetEpc === 'object' && targetEpc !== null) {
            // Check if it's a Tag object
            if (targetEpc.epc) {
                targetEpc = targetEpc.epc;
            } 
            // Check if it's a DOM Event
            else if (targetEpc.target && targetEpc.target.value) {
                targetEpc = targetEpc.target.value;
            }
        }
    }

    if (typeof targetEpc !== 'string' || !targetEpc) {
         addLog('Invalid EPC format for Locate. Must be a string.', 'error');
         return;
    }

    try {
      // Firmware V12.1+: Just send 'F' command. 
      // It automatically handles stopping previous scan modes.
      // No need to send 'X' (stopScan) or 'SMASK' (setMask).
      
      await bleService.locateTag(targetEpc);
      
      setIsLocating(true);
      addLog(`Locating Started: ${targetEpc}`, 'info');
    } catch (e: any) {
      addLog(`Locate Error: ${e.message}`, 'error');
      setIsLocating(false);
    }
  };

  const stopLocate = async () => {
    try {
      // Just stop the scan. No need to clear mask as it's not used.
      await bleService.stopScan();
      
      setIsLocating(false);
      setTargetRssi(null);
      addLog('Locating Stopped', 'info');
      
      // Sync state after 1s
      setTimeout(async () => {
         try {
             await bleService.getQSession();
             await bleService.getProfile();
             addLog('Synced Settings after Locate', 'info');
         } catch (e) { console.error(e); }
      }, 1000);

    } catch (e: any) {
      addLog(`Stop Locate Error: ${e.message}`, 'error');
    }
  };

  return {
    isLocating,
    targetRssi,
    startLocate,
    stopLocate,
    handleDataReceived
  };
};
