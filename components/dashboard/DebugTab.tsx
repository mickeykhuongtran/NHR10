import React, { useRef, useEffect } from 'react';
import { Download, Terminal, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { LogEntry } from '../../types';
import { PageHeader } from './PageHeader';

interface DebugTabProps {
  logs: LogEntry[];
  onDownloadHistory: () => void;
  onClearLogs: () => void;
  isFileTransferring: boolean;
  transferProgress: number;
}

export const DebugTab: React.FC<DebugTabProps> = ({ logs, onDownloadHistory, onClearLogs, isFileTransferring, transferProgress }) => {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="flex h-full flex-col gap-3 bg-transparent p-2 text-slate-300 sm:p-3 md:p-5">
      <PageHeader
        icon={Terminal}
        title="DEBUG"
        subtitle="Real-time BLE communication log and diagnostic export."
        meta={
          <span className="rounded-full border border-[#DDECEF] bg-white/58 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#6E7F83]">
            {logs.length} events
          </span>
        }
        actions={
          <>
          <Button 
            variant="secondary" 
            onClick={onDownloadHistory} 
            disabled={isFileTransferring}
            className="bg-slate-900 hover:bg-slate-800 text-cyan-500 border-slate-800 h-8 text-xs"
          >
            {isFileTransferring ? `SYNCING ${transferProgress}%` : <><Download size={14} /> DOWNLOAD LOGS</>}
          </Button>
          <Button 
            variant="outline" 
            onClick={onClearLogs} 
            className="border-slate-800 text-slate-600 hover:text-red-400 hover:border-red-900/50 hover:bg-red-900/10 h-8 text-xs"
          >
            <Trash2 size={14} /> CLEAR
          </Button>
          </>
        }
      />

      {/* Console Output */}
      <div className="flex-1 bg-black rounded-sm border border-slate-800 overflow-hidden flex flex-col shadow-inner">
        <div className="flex items-center justify-between bg-slate-900/50 px-3 py-1.5 text-[10px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-800">
          <span>Console Output</span>
          <span>{logs.length} Events</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5 font-mono text-[10px] custom-scrollbar">
          {logs.length === 0 && (
            <div className="h-full flex items-center justify-center text-slate-800 italic text-xs">
              No system events recorded.
            </div>
          )}
          {logs.map((log, i) => (
            <div key={i} className="flex gap-2 hover:bg-white/5 px-1 py-0.5 rounded-sm">
              <span className="text-slate-600 shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
              <span className={`font-bold uppercase shrink-0 w-10 text-right ${
                log.type === 'tx' ? 'text-cyan-600' : 
                log.type === 'rx' ? 'text-emerald-600' : 
                log.type === 'error' ? 'text-red-500' : 'text-slate-500'
              }`}>
                {log.type}
              </span>
              <span className={`break-all ${log.type === 'error' ? 'text-red-400' : 'text-slate-400'}`}>
                {log.message}
              </span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
};
