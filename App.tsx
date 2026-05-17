import React, { useState, useEffect, useCallback, useRef } from 'react';
import { bleService } from './services/bleService';
import { DashboardLayout } from './components/dashboard/DashboardLayout';
import { BatchSaveInfo, Settings, WriteStatus } from './types';
import { useRFIDConnection } from './hooks/useRFIDConnection';
import { useScanLogic } from './hooks/useScanLogic';
import { useLocateLogic } from './hooks/useLocateLogic';
import { useFileTransfer } from './hooks/useFileTransfer';

const DEFAULT_BATCH_SAVE_INFO: BatchSaveInfo = {
  state: 'idle',
  progress: 0,
  written: 0,
  total: 0,
};

const toSafeNumber = (value: unknown, fallback = 0): number => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const clampProgress = (value: unknown): number => Math.max(0, Math.min(100, toSafeNumber(value)));

const App: React.FC = () => {
  // --- Hooks ---
  const connection = useRFIDConnection();
  const scan = useScanLogic(connection.addLog);
  const locate = useLocateLogic(connection.addLog);
  const fileTransfer = useFileTransfer(connection.addLog);

  // --- Operation State (Write) ---
  const [writeStatus, setWriteStatus] = useState<WriteStatus>('idle');
  const [writeMessage, setWriteMessage] = useState('');
  const [batchSaveInfo, setBatchSaveInfo] = useState<BatchSaveInfo>(DEFAULT_BATCH_SAVE_INFO);
  const batchSavingTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const isBatchSaving = batchSaveInfo.state === 'saving';

  const clearBatchSavingTimer = useCallback(() => {
    if (batchSavingTimerRef.current !== null) {
      window.clearTimeout(batchSavingTimerRef.current);
      batchSavingTimerRef.current = null;
    }
  }, []);

  const markBatchSaving = useCallback((next?: Partial<BatchSaveInfo>, useFallbackTimer = true) => {
    clearBatchSavingTimer();
    setBatchSaveInfo((current) => ({
      state: 'saving',
      progress: clampProgress(next?.progress ?? current.progress ?? 0),
      written: Math.max(0, toSafeNumber(next?.written ?? current.written ?? 0)),
      total: Math.max(0, toSafeNumber(next?.total ?? current.total ?? 0)),
    }));

    if (useFallbackTimer) {
      batchSavingTimerRef.current = window.setTimeout(() => {
        setBatchSaveInfo((current) => current.state === 'saving' ? DEFAULT_BATCH_SAVE_INFO : current);
        batchSavingTimerRef.current = null;
      }, 3000);
    }
  }, [clearBatchSavingTimer]);

  const clearBatchSaving = useCallback((next?: Partial<BatchSaveInfo>) => {
    clearBatchSavingTimer();
    setBatchSaveInfo({
      state: next?.state ?? 'idle',
      progress: clampProgress(next?.progress ?? 0),
      written: Math.max(0, toSafeNumber(next?.written ?? 0)),
      total: Math.max(0, toSafeNumber(next?.total ?? 0)),
    });
  }, [clearBatchSavingTimer]);

  // --- Unified Data Handler ---
const handleDataReceived = useCallback((data: any) => {
    // 1. Dữ liệu hệ thống (Pin, Info, Settings) luôn được cho phép xử lý
    connection.handleDataReceived(data);

    // 2. GUARD BẢO VỆ INTERACTIVE/BATCH MODE: 
    // Chỉ truyền gói live_tags xuống khi isScanning đang là true
    if (data.cmd === 'live_tags') {
      if (scan.isScanning) {
        scan.handleDataReceived(data);
      }
    } else {
      // Các gói khác (nếu có) mà scan hook cần xử lý
      scan.handleDataReceived(data);
    }

    // 3. GUARD BẢO VỆ FIND MODE:
    // Chỉ truyền gói F (tín hiệu định vị) xuống khi isLocating đang là true
    if (data.cmd === 'F') {
      if (locate.isLocating) {
        locate.handleDataReceived(data);
      }
    } else {
      locate.handleDataReceived(data);
    }

    // 4. Write Responses
    if (data.cmd === 'WE' || data.cmd === 'WD') {
        if (data.status === 'ok') {
            setWriteStatus('success');
            setWriteMessage('Operation Successful');
            connection.addLog('Write Success', 'info');
        } else {
            setWriteStatus('error');
            setWriteMessage(`Failed: ${data.code || 'Unknown Error'}`);
            connection.addLog(`Write Failed: ${data.code}`, 'error');
        }
    }

    if (data.cmd === 'SAVE' && data.mode === 'batch') {
      const saveState = String(data.state ?? '').toLowerCase();
      const nextSaveInfo = {
        progress: clampProgress(data.progress ?? 0),
        written: Math.max(0, toSafeNumber(data.written ?? 0)),
        total: Math.max(0, toSafeNumber(data.total ?? 0)),
      };

      if (saveState === 'saving') {
        markBatchSaving(nextSaveInfo, false);
      } else if (saveState === 'saved') {
        clearBatchSaving({ state: 'saved', progress: 100, written: nextSaveInfo.written, total: nextSaveInfo.total });
        connection.addLog('Batch file saved on device', 'info');
      } else if (saveState === 'save_failed') {
        clearBatchSaving({ state: 'save_failed', ...nextSaveInfo });
        connection.addLog(`Batch file save failed at ${nextSaveInfo.progress}%`, 'error');
      }
    } else if (data.cmd === 'XB') {
      const state = String(data.state ?? data.status ?? data.val ?? '').toLowerCase();
      if (state.includes('saving') || state.includes('busy')) {
        markBatchSaving();
      } else if (
        data.status === 'ok' ||
        state.includes('saved') ||
        state.includes('done') ||
        state.includes('stopped') ||
        state.includes('idle')
      ) {
        clearBatchSaving();
      }
    }
  }, [connection, scan, locate, markBatchSaving, clearBatchSaving]);

  useEffect(() => {
    if (fileTransfer.transferStatus === 'saving') {
      markBatchSaving(undefined, false);
    } else if (fileTransfer.transferStatus === 'transferring' || fileTransfer.transferStatus === 'complete') {
      clearBatchSaving();
    }
  }, [clearBatchSaving, fileTransfer.transferStatus, markBatchSaving]);

  useEffect(() => () => clearBatchSavingTimer(), [clearBatchSavingTimer]);

  // --- Setup Service ---
  useEffect(() => {
    bleService.setCallbacks(
      handleDataReceived, 
      (msg, type) => connection.addLog(msg, type), 
      fileTransfer.handleFileCallback
    );
  }, [handleDataReceived, connection.addLog, fileTransfer.handleFileCallback]);

  // --- Handlers ---

  const handleUpdateSettings = async (key: keyof Settings, value: any) => {
    try {
      if (key === 'power') {
        await bleService.setPower(value);
        connection.setSettings(s => ({ ...s, power: value }));
      } else if (key === 'buzzer') {
        await bleService.sendCommand({ cmd: 'BZ', val: value ? 'on' : 'off' });
        connection.setSettings(s => ({ ...s, buzzer: value }));
      } else if (key === 'tagFocus') {
        await bleService.setTagFocus(value);
        connection.setSettings(s => ({ ...s, tagFocus: value }));
      } else if (key === 'fastTid') {
        await bleService.sendCommand({ cmd: 'TID', val: value ? 1 : 0 });
        connection.setSettings(s => ({ ...s, fastTid: value }));
      } else if (key === 'linkProfile') {
        await bleService.setBaseband(value, connection.settings.qValue, connection.settings.session);
        connection.setSettings(s => ({ ...s, linkProfile: value }));
      } else if (key === 'qValue') {
        const { q, s } = value;
        await bleService.setBaseband(connection.settings.linkProfile, q, s);
        connection.setSettings(prev => ({ ...prev, qValue: q, session: s }));
      } else if (key === 'scanParams') {
        const { interval, dwell, count, append } = value;
        // V12.6: Send values directly, firmware handles conversion
        // interval: ms value (firmware divides by 10)
        // dwell: raw count value (firmware passes through)
        // append: direct value
        await bleService.setQueryParam(interval, dwell, append || 0);
        connection.setSettings(s => ({ ...s, scanParams: value }));
      }
      connection.addLog(`Updated ${key}`, 'info');
    } catch (e: any) {
      connection.addLog(`Settings Update Failed: ${e.message}`, 'error');
    }
  };

  const handleSaveSetting = async (key: string, value: any) => {
    try {
      if (key === 'tagFocus') {
        await bleService.sendCommand({ cmd: 'STF', val: value ? 1 : 0 });
        connection.addLog(`Saved Tag Focus: ${value}`, 'info');
      } else if (key === 'fastTid') {
        await bleService.sendCommand({ cmd: 'STID', val: value ? 1 : 0 });
        connection.addLog(`Saved Fast TID: ${value}`, 'info');
      }
    } catch (e: any) {
      connection.addLog(`Save Setting Failed: ${e.message}`, 'error');
    }
  };

  const handleSaveConfig = async () => {
      try {
          await bleService.saveConfig();
          connection.addLog('Configuration Saved to Flash', 'info');
      } catch (e: any) {
          connection.addLog(`Save Config Failed: ${e.message}`, 'error');
      }
  };

  const handleApplyPreset = async (mode: 'standard' | 'quick' | 'deep') => {
    try {
      if (mode === 'standard') {
        // Profile 53, Q=4, Session=1, TagFocus=Enable
        await bleService.setBaseband(53, 4, 1);
        await bleService.setTagFocus(true);
        connection.addLog('Applied Standard Mode', 'info');
      } else if (mode === 'quick') {
        // Profile 11, Q=2, Session=0, TagFocus=Disable
        await bleService.setBaseband(11, 2, 0);
        await bleService.setTagFocus(false);
        connection.addLog('Applied Quick Scan Mode', 'info');
      } else if (mode === 'deep') {
        // Profile 13, Q=4, Session=1
        await bleService.setBaseband(13, 4, 1);
        await bleService.setTagFocus(true);
        connection.addLog('Applied Deep Scan Mode', 'info');
      }
      
      // Sync settings back after a short delay
      setTimeout(async () => {
          try {
            await bleService.getProfile();
            await bleService.getQSession();
            await bleService.getTagFocus();
            await bleService.getInfo(); // Just to be sure
          } catch (e) { console.error(e); }
      }, 500);
    } catch (e: any) {
      connection.addLog(`Failed to apply preset: ${e.message}`, 'error');
    }
  };

  const handleWriteEpc = async (targetEpc: string, newEpc: string, password?: string) => {
    setWriteStatus('pending');
    setWriteMessage('');
    try {
      await bleService.writeEpc(targetEpc, newEpc, password);
    } catch (e: any) {
      setWriteStatus('error');
      setWriteMessage(e.message);
    }
  };

  const handleWriteData = async (epc: string, mem: number, ptr: number, data: string, password?: string) => {
    setWriteStatus('pending');
    setWriteMessage('');
    try {
      await bleService.writeData(epc, mem, ptr, data, password);
    } catch (e: any) {
      setWriteStatus('error');
      setWriteMessage(e.message);
    }
  };

  const handleDownloadLogs = () => {
    try {
      const blob = new Blob([JSON.stringify(connection.logs, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `system_logs_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to download logs', e);
    }
  };

  const handleShowPopup = async (content: string, time: number, beep: boolean) => {
    try {
      await bleService.showPopup(content, time, beep);
      connection.addLog(`Popup sent: ${content}`, 'info');
    } catch (e: any) {
      connection.addLog(`Popup failed: ${e.message}`, 'error');
    }
  };

  return (
    <DashboardLayout
      status={connection.status}
      settings={connection.settings}
      tags={scan.tags}
      scanStats={scan.stats}
      logs={connection.logs}
      
      onConnect={connection.connect}
      onDisconnect={() => {
        connection.disconnect();
        scan.stopScan(); // Ensure scan state is reset
        locate.stopLocate();
      }}
      
      isScanning={scan.isScanning}
      activeScanType={scan.activeScanType}
      scanStartedAt={scan.scanStartedAt}
      scanStoppedAt={scan.scanStoppedAt}
      removeStaleTags={scan.removeStaleTags}
      staleRemoveMs={scan.staleRemoveMs}
      onChangeRemoveStaleTags={scan.setRemoveStaleTags}
      onChangeStaleRemoveMs={scan.setStaleRemoveMs}
      onStartScan={scan.startScan}
      onStopScan={() => {
        scan.stopScan();
        locate.stopLocate(); // Dọn dẹp triệt để state để không bị auto-restart
      }}
      onStartBatch={scan.startBatch}
      onStopBatch={() => {
        markBatchSaving();
        scan.stopScan();
        locate.stopLocate(); // Unified stop
      }}
      onClearTags={scan.clearTags}
      
      onLocate={locate.startLocate}
      onStopLocate={() => {
        scan.stopScan();
        locate.stopLocate();
      }}
      targetRssi={locate.targetRssi}
      isLocating={locate.isLocating}
      
      onWriteEpc={handleWriteEpc}
      onWriteData={handleWriteData}
      writeStatus={writeStatus}
      writeMessage={writeMessage}
      
      onUpdateSettings={handleUpdateSettings}
      onSaveSetting={handleSaveSetting}
      onSaveConfig={handleSaveConfig}
      onApplyPreset={handleApplyPreset}
      onShowPopup={handleShowPopup}
      
      onDownloadLogs={handleDownloadLogs}
      onFetchHistory={() => {
        if (isBatchSaving) {
          connection.addLog('Batch data is still saving on device. Fetch is temporarily disabled.', 'info');
          return;
        }
        fileTransfer.fetchHistory();
      }}
      onDownloadJson={fileTransfer.downloadJson}
      onDownloadCsv={fileTransfer.downloadCsv}
      onDownloadTxt={fileTransfer.downloadTxt}
      onShare={fileTransfer.shareFile}
      onClearFileData={fileTransfer.clearFileData}
      historyData={fileTransfer.historyData}
      isBatchSaving={isBatchSaving}
      batchSaveInfo={batchSaveInfo}
      
      onClearLogs={connection.clearLogs}
      isFileTransferring={fileTransfer.isFileTransferring}
      transferProgress={fileTransfer.transferProgress}
      transferStatus={fileTransfer.transferStatus}
    />
  );
};

export default App;
