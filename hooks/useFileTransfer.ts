import { useState, useCallback } from 'react';
import { bleService } from '../services/bleService';

export const useFileTransfer = (addLog: (msg: string, type: 'info' | 'error' | 'rx' | 'tx') => void) => {
  const [isFileTransferring, setIsFileTransferring] = useState(false);
  const [transferProgress, setTransferProgress] = useState(0);
  const [historyData, setHistoryData] = useState<any[]>([]);

  const handleFileCallback = useCallback((event: string, data?: any) => {
      if (event === 'start') {
          setIsFileTransferring(true);
          setTransferProgress(0);
          setHistoryData([]);
          addLog('File Transfer Started', 'info');
      } else if (event === 'progress') {
          // data is the percentage (0-100)
          setTransferProgress(typeof data === 'number' ? data : 0);
      } else if (event === 'complete') {
          setIsFileTransferring(false);
          setTransferProgress(100);
          try {
            // data is the raw JSON string
            const parsed = JSON.parse(data);
            const arrayData = Array.isArray(parsed) ? parsed : [parsed];
            setHistoryData(arrayData);
            addLog(`File Transfer Complete. Loaded ${arrayData.length} records.`, 'info');
          } catch (e) {
            addLog('Failed to parse file data JSON', 'error');
            setHistoryData([]);
          }
      } else if (event === 'error') {
          setIsFileTransferring(false);
          addLog(`File Transfer Error: ${data}`, 'error');
      }
  }, [addLog]);

  const fetchHistory = async () => {
    try {
      setHistoryData([]);
      await bleService.requestFileTransfer();
    } catch (e: any) {
      addLog(e.message, 'error');
    }
  };

  const downloadJson = () => {
    if (historyData.length === 0) return;
    try {
      const jsonString = JSON.stringify(historyData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scan_history_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addLog('JSON Downloaded', 'info');
    } catch (e) {
      addLog('Failed to download JSON', 'error');
    }
  };

  const downloadCsv = () => {
    if (historyData.length === 0) return;
    try {
      // Get headers from first object
      const headers = Object.keys(historyData[0]);
      const csvRows = [];
      
      // Add header row
      csvRows.push(headers.join(','));
      
      // Add data rows
      for (const row of historyData) {
        const values = headers.map(header => {
          const val = row[header];
          // Handle arrays (like EPCS) by joining with semicolon
          const cellValue = Array.isArray(val) ? val.join('; ') : val;
          const escaped = ('' + cellValue).replace(/"/g, '\\"');
          return `"${escaped}"`;
        });
        csvRows.push(values.join(','));
      }
      
      const csvString = csvRows.join('\n');
      const blob = new Blob([csvString], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scan_history_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addLog('CSV Downloaded', 'info');
    } catch (e) {
      addLog('Failed to download CSV', 'error');
    }
  };

  const downloadTxt = () => {
    if (historyData.length === 0) return;
    try {
      let txtContent = `SCAN HISTORY EXPORT - ${new Date().toLocaleString()}\n`;
      txtContent += `Total Records: ${historyData.length}\n`;
      txtContent += `----------------------------------------\n\n`;

      historyData.forEach((record, index) => {
        txtContent += `RECORD #${index + 1}\n`;
        Object.entries(record).forEach(([key, value]) => {
          if (Array.isArray(value)) {
             txtContent += `${key}:\n`;
             value.forEach((v: any) => txtContent += `  - ${v}\n`);
          } else {
             txtContent += `${key}: ${value}\n`;
          }
        });
        txtContent += `\n`;
      });

      const blob = new Blob([txtContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scan_history_${Date.now()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addLog('TXT Downloaded', 'info');
    } catch (e) {
      addLog('Failed to download TXT', 'error');
    }
  };

  const shareFile = async () => {
    if (historyData.length === 0) return;
    try {
      const jsonString = JSON.stringify(historyData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const file = new File([blob], `scan_history_${Date.now()}.json`, { type: 'application/json' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'RFID Scan History',
          text: `Here is the scan history export with ${historyData.length} records.`,
          files: [file],
        });
        addLog('File Shared successfully', 'info');
      } else {
        addLog('Sharing not supported on this device/browser', 'error');
      }
    } catch (e: any) {
      addLog(`Share failed: ${e.message}`, 'error');
    }
  };

  const clearFileData = () => {
    setHistoryData([]);
    setTransferProgress(0);
  };

  return {
    isFileTransferring,
    transferProgress,
    historyData,
    handleFileCallback,
    fetchHistory,
    downloadJson,
    downloadCsv,
    downloadTxt,
    shareFile,
    clearFileData
  };
};

