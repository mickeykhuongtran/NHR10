import React, { useState } from 'react';
import { Download, FileText, Database, RefreshCw, Trash2, FileSpreadsheet, Share2, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { BatchHistoryRecord, BatchSaveInfo, FileTransferStatus } from '../../types';

interface HistoryTabProps {
  onFetchHistory: () => void;
  onDownloadJson: () => void;
  onDownloadCsv: () => void;
  onDownloadTxt: () => void;
  onShare: () => void;
  onClearFileData: () => void;
  isFileTransferring: boolean;
  transferProgress: number;
  transferStatus: FileTransferStatus;
  isBatchSaving: boolean;
  batchSaveInfo: BatchSaveInfo;
  historyData: BatchHistoryRecord[];
}

export const HistoryTab: React.FC<HistoryTabProps> = ({ 
  onFetchHistory, 
  onDownloadJson,
  onDownloadCsv,
  onDownloadTxt,
  onShare,
  onClearFileData,
  isFileTransferring, 
  transferProgress,
  transferStatus,
  isBatchSaving,
  batchSaveInfo,
  historyData
}) => {
  const [selectedEpcs, setSelectedEpcs] = useState<string[] | null>(null);
  const [shareNotice, setShareNotice] = useState<string | null>(null);

  const hasData = historyData && historyData.length > 0;
  const isWaitingForDevice = isBatchSaving || transferStatus === 'saving';
  const saveProgress = Math.max(0, Math.min(100, Math.round(batchSaveInfo.progress)));
  const saveDetail = batchSaveInfo.total > 0
    ? `${batchSaveInfo.written}/${batchSaveInfo.total} bytes`
    : 'Waiting for SAVE progress from device';

  const transferCopy = {
    requesting: ['Requesting Data...', 'Sending send_file to FF02.'],
    saving: ['Saving on Device...', 'Firmware is finalizing the NHRB batch file.'],
    transferring: ['Transferring Data...', 'Receiving raw NHRB chunks from FF03.'],
    parsing: ['Parsing NHRB...', 'Validating header, file size, and payload CRC32.'],
    complete: ['Transfer Complete', 'Batch EPC list is ready.'],
    error: ['Transfer Error', 'Check debug logs for details.'],
    idle: ['Ready', 'Fetch batch EPC list from device memory.'],
  }[transferStatus];

  const handleShare = async () => {
    if (!historyData || historyData.length === 0) return;

    const formattedString = historyData
      .map((record) => `${record.INDEX}. ${record.EPC}`)
      .join('\n');

    const shareData = {
      title: 'RFID Batch History',
      text: formattedString,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // Ignore user cancellation
        if ((err as Error).name !== 'AbortError') {
          console.error('Error sharing:', err);
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(formattedString);
        setShareNotice('Sharing is not available in this browser. Data copied to clipboard.');
      } catch (err) {
        console.error('Failed to copy to clipboard:', err);
        setShareNotice('Could not share or copy the data.');
      }
    }
  };

  const renderCellContent = (key: string, val: any) => {
    // Check if it's the EPCS column or an array
    if (key === 'EPCS' || Array.isArray(val)) {
      const items = Array.isArray(val) ? val : [];
      
      if (items.length === 0) {
        return <span className="text-slate-600 italic">Empty</span>;
      }
      
      const displayItems = items.slice(0, 5);
      const remaining = items.length - 5;

      return (
        <div className="flex flex-wrap gap-2">
          {displayItems.map((item: any, idx: number) => (
            <span 
              key={idx} 
              className="bg-slate-800 border border-slate-700 text-cyan-400 px-2 py-1 rounded-md text-[10px] font-mono break-all shadow-sm"
            >
              {String(item)}
            </span>
          ))}
          {remaining > 0 && (
            <button 
              onClick={() => setSelectedEpcs(items)}
              className="bg-slate-900 border border-slate-800 text-slate-500 px-2 py-1 rounded-md text-[10px] font-mono whitespace-nowrap shadow-sm hover:bg-slate-800 hover:text-cyan-300 transition-colors cursor-pointer"
            >
              +{remaining} more
            </button>
          )}
        </div>
      );
    }

    if (key === 'EPC') {
      return <span className="text-[#0057D9] font-bold tracking-wide">{String(val)}</span>;
    }
    
    // Default rendering for other types
    return typeof val === 'object' ? JSON.stringify(val) : String(val);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950">
      
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/50">
        <div className="flex items-center gap-3">
          <div className="bg-slate-900 p-2 rounded-full border border-slate-800 text-cyan-500">
            <Database size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-200 tracking-tight">BATCH HISTORY</h2>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">
              {isWaitingForDevice ? `SAVING ON DEVICE ${saveProgress}%` : hasData ? `${historyData.length} UNIQUE EPCs` : 'NO DATA LOADED'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
           {hasData && (
            <>
              <Button 
                variant="outline" 
                onClick={onClearFileData}
                className="border-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-900/10 h-9 px-3"
                title="Clear Data"
              >
                <Trash2 size={16} />
              </Button>
              
              <div className="h-6 w-px bg-slate-800 mx-1" />

              <Button 
                variant="outline" 
                onClick={onDownloadTxt}
                className="border-slate-800 text-slate-300 hover:text-blue-400 hover:bg-blue-900/10 h-9 px-3"
                title="Download TXT"
              >
                <FileText size={16} className="mr-2" /> TXT
              </Button>

              <Button 
                variant="outline" 
                onClick={onDownloadCsv}
                className="border-slate-800 text-slate-300 hover:text-emerald-400 hover:bg-emerald-900/10 h-9 px-3"
                title="Download CSV"
              >
                <FileSpreadsheet size={16} className="mr-2" /> CSV
              </Button>

              <Button 
                variant="outline" 
                onClick={onDownloadJson}
                className="border-slate-800 text-slate-300 hover:text-amber-400 hover:bg-amber-900/10 h-9 px-3"
                title="Download JSON"
              >
                <Download size={16} className="mr-2" /> JSON
              </Button>

              <Button 
                variant="outline" 
                onClick={handleShare}
                className="border-slate-800 text-slate-300 hover:text-purple-400 hover:bg-purple-900/10 h-9 px-3"
                title="Share"
              >
                <Share2 size={16} className="mr-2" /> SHARE
              </Button>
            </>
          )}
        </div>
        {shareNotice && (
          <div className="w-full rounded-lg border border-[#D2D2D7] bg-white px-3 py-2 text-xs text-[#424245] shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <span>{shareNotice}</span>
              <button
                onClick={() => setShareNotice(null)}
                className="text-[#007AFF] font-medium"
              >
                OK
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden p-4 flex flex-col items-center justify-center">
        
        {!hasData && !isFileTransferring && (
          <div className="text-center space-y-6 max-w-sm">
            <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mx-auto border border-slate-800">
              {isWaitingForDevice ? (
                <RefreshCw className="w-10 h-10 text-cyan-500 animate-spin" />
              ) : (
                <FileText className="w-10 h-10 text-slate-700" />
              )}
            </div>
            <div className="space-y-2">
              <h3 className="text-slate-300 font-bold">{isWaitingForDevice ? 'Saving on Device' : 'No Data Loaded'}</h3>
              <p className="text-slate-500 text-xs">
                {isWaitingForDevice
                  ? `${saveDetail}. Fetch will be enabled after saved.`
                  : 'Fetch data from the device internal memory to preview and download unique EPC results.'}
              </p>
            </div>
            <Button 
              fullWidth 
              size="lg" 
              onClick={onFetchHistory}
              disabled={isWaitingForDevice}
              className="h-12 text-sm font-bold tracking-wider"
            >
              <RefreshCw size={18} className={`mr-2 ${isWaitingForDevice ? 'animate-spin' : ''}`} />
              {isWaitingForDevice ? `SAVING... ${saveProgress}%` : 'FETCH DATA FROM DEVICE'}
            </Button>
          </div>
        )}

        {isFileTransferring && (
          <div className="w-full max-w-sm bg-slate-900 p-6 rounded-lg border border-slate-800 shadow-xl space-y-4 text-center">
            <RefreshCw className="w-8 h-8 text-cyan-500 animate-spin mx-auto" />
            <div className="space-y-1">
              <h3 className="text-slate-200 font-bold">{transferCopy[0]}</h3>
              <p className="text-slate-500 text-xs font-mono">{transferCopy[1]}</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
                <span>Progress</span>
                <span>{transferProgress}%</span>
              </div>
              <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div 
                  className="h-full bg-cyan-600 transition-all duration-300 ease-out"
                  style={{ width: `${transferProgress}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {hasData && !isFileTransferring && (
          <div className="w-full h-full flex flex-col bg-slate-900 rounded-lg border border-slate-800 overflow-hidden shadow-inner">
            <div className="flex-1 overflow-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-950 sticky top-0 z-10 shadow-sm">
                  <tr>
                    {Object.keys(historyData[0] || {}).map((key) => (
                      <th key={key} className={`p-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800 bg-slate-950 ${key === 'EPCS' ? 'w-full min-w-[200px]' : 'whitespace-nowrap'}`}>
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {historyData.map((row: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                      {Object.entries(row).map(([key, val]: [string, any], j: number) => (
                        <td key={j} className={`p-3 text-xs text-slate-300 font-mono border-r border-slate-800/30 last:border-r-0 align-top ${key !== 'EPCS' ? 'whitespace-nowrap' : ''}`}>
                          {renderCellContent(key, val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-2 bg-slate-950 border-t border-slate-800 text-[10px] text-slate-600 font-mono text-center">
              Previewing {historyData.length} unique EPCs
            </div>
          </div>
        )}

      </div>

      {/* Modal */}
      {selectedEpcs && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-lg w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="bg-slate-900 border-b border-slate-800 p-4 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-200">EPC Details</h3>
              <button 
                onClick={() => setSelectedEpcs(null)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex flex-wrap gap-2 p-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {selectedEpcs.map((item, idx) => (
                <span 
                  key={idx} 
                  className="bg-slate-800 border border-slate-700 text-cyan-400 px-2 py-1 rounded-md text-[10px] font-mono whitespace-nowrap shadow-sm"
                >
                  {String(item)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
