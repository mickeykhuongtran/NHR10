import React, { useState } from 'react';
import { LayoutDashboard, Search, PenTool, Settings as SettingsIcon, Terminal, Database } from 'lucide-react';
import { TopBar } from './TopBar';
import { ScannerTab } from './ScannerTab';
import { LocateTab } from './LocateTab';
import { OperationsTab } from './OperationsTab';
import { SettingsTab } from './SettingsTab';
import { DebugTab } from './DebugTab';
import { HistoryTab } from './HistoryTab';
import { BatchSaveInfo, Settings, ConnectionStatus, Tag, LogEntry, ScanStats, FileTransferStatus } from '../../types';

interface DashboardLayoutProps {
  status: ConnectionStatus;
  settings: Settings;
  tags: Tag[];
  scanStats: ScanStats;
  logs: LogEntry[];
  isScanning: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  activeScanType: 'interactive' | 'batch' | null;
  onStartScan: () => void;
  onStopScan: () => void;
  onStartBatch: () => void;
  onStopBatch: () => void;
  onClearTags: () => void;
  onLocate: (epc: string) => void;
  onStopLocate: () => void;
  targetRssi: number | null;
  isLocating: boolean;
  onWriteEpc: (targetEpc: string, newEpc: string, password?: string) => void;
  onWriteData: (epc: string, mem: number, ptr: number, data: string, password?: string) => void;
  writeStatus: 'idle' | 'pending' | 'success' | 'error';
  writeMessage: string;
  onUpdateSettings: (key: keyof Settings, value: any) => void;
  onSaveSetting: (key: string, value: any) => void;
  onFetchHistory: () => void;
  onDownloadJson: () => void;
  onDownloadCsv: () => void;
  onDownloadTxt: () => void;
  onShare: () => void;
  onClearFileData: () => void;
  historyData: any[];
  isBatchSaving: boolean;
  batchSaveInfo: BatchSaveInfo;
  onClearLogs: () => void;
  isFileTransferring: boolean;
  transferProgress: number;
  transferStatus: FileTransferStatus;
  onApplyPreset: (mode: 'standard' | 'quick' | 'deep') => void;
  onSaveConfig: () => void;
  onShowPopup: (content: string, time: number, beep: boolean) => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = (props) => {
  const [activeTab, setActiveTab] = useState<number>(1);
  const [locateEpc, setLocateEpc] = useState<string>('');

  const tabs = [
    { id: 1, label: 'Scanner', icon: LayoutDashboard },
    { id: 2, label: 'Locate', icon: Search },
    { id: 3, label: 'Operations', icon: PenTool },
    { id: 6, label: 'History', icon: Database },
    { id: 4, label: 'Settings', icon: SettingsIcon },
    { id: 5, label: 'Debug', icon: Terminal },
  ];

  return (
    <div className="flex flex-col h-[100dvh] bg-[#F5F5F7] overflow-hidden text-[#1D1D1F]">
      {/* Top Bar */}
      <TopBar 
        status={props.status} 
        settings={props.settings} 
        onConnect={props.onConnect} 
        onDisconnect={props.onDisconnect} 
      />

      <div className="flex flex-1 flex-col lg:flex-row overflow-hidden relative min-h-0">
        {/* Sidebar / Bottom Navigation */}
        <nav 
          className="order-2 lg:order-1 w-full lg:w-56 bg-white/80 backdrop-blur-xl border-t lg:border-t-0 lg:border-r border-[#D2D2D7] flex lg:flex-col shrink-0 z-20"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex flex-row lg:flex-col w-full overflow-x-auto lg:overflow-y-auto scrollbar-none items-center justify-around xl:py-4 lg:space-y-1 lg:px-3">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 lg:flex-none flex flex-col lg:flex-row items-center justify-center lg:justify-start gap-1 lg:gap-3 px-2 py-2 lg:px-3 lg:py-2.5 transition-all duration-200 min-w-[64px] lg:w-full lg:rounded-lg ${
                    isActive 
                      ? 'bg-[#007AFF]/10 text-[#007AFF]' 
                      : 'text-[#6E6E73] hover:bg-[#F5F5F7] hover:text-[#1D1D1F]'
                  }`}
                >
                  <Icon size={isActive ? 20 : 18} className={isActive ? 'text-[#007AFF]' : 'text-[#86868B]'} />
                  <span className={`text-[9px] lg:text-xs font-semibold whitespace-nowrap ${isActive ? 'text-[#007AFF]' : ''}`}>
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
          
          <div className="p-4 border-t border-[#D2D2D7] hidden lg:block mt-auto">
            <p className="text-[10px] text-[#86868B] font-mono text-center">v{props.settings.version || '1.0.0'}</p>
          </div>
        </nav>

        {/* Main Content Area */}
        <main className="order-1 lg:order-2 flex-1 overflow-hidden relative min-h-0 bg-[#F5F5F7]">
          {activeTab === 1 && (
            <ScannerTab 
              isScanning={props.isScanning}
              activeScanType={props.activeScanType}
              onStartScan={props.onStartScan}
              onStopScan={props.onStopScan}
              onStartBatch={props.onStartBatch}
              onStopBatch={props.onStopBatch}
              onClear={props.onClearTags}
              tags={props.tags}
              stats={props.scanStats}
              onApplyPreset={props.onApplyPreset}
              onLocate={(epc) => {
                setLocateEpc(epc);
                setActiveTab(2); // Switch to Locate tab
              }}
              isBatchSaving={props.isBatchSaving}
              batchSaveInfo={props.batchSaveInfo}
            />
          )}
          
          {activeTab === 2 && (
            <LocateTab 
              onLocate={props.onLocate}
              onStopLocate={props.onStopLocate}
              targetRssi={props.targetRssi}
              isLocating={props.isLocating}
              targetEpc={locateEpc}
              setTargetEpc={setLocateEpc}
            />
          )}

          {activeTab === 3 && (
            <OperationsTab 
              onWriteEpc={props.onWriteEpc}
              onWriteData={props.onWriteData}
              writeStatus={props.writeStatus}
              writeMessage={props.writeMessage}
            />
          )}

          {activeTab === 6 && (
            <HistoryTab 
              onFetchHistory={props.onFetchHistory}
              onDownloadJson={props.onDownloadJson}
              onDownloadCsv={props.onDownloadCsv}
              onDownloadTxt={props.onDownloadTxt}
              onShare={props.onShare}
              onClearFileData={props.onClearFileData}
              historyData={props.historyData}
              isFileTransferring={props.isFileTransferring}
              transferProgress={props.transferProgress}
              transferStatus={props.transferStatus}
              isBatchSaving={props.isBatchSaving}
              batchSaveInfo={props.batchSaveInfo}
            />
          )}

          {activeTab === 4 && (
            <SettingsTab 
              settings={props.settings}
              onUpdateSettings={props.onUpdateSettings}
              onSaveSetting={props.onSaveSetting}
              onSaveConfig={props.onSaveConfig}
              onShowPopup={props.onShowPopup}
            />
          )}

          {activeTab === 5 && (
            <DebugTab 
              logs={props.logs}
              onDownloadHistory={props.onDownloadLogs}
              onClearLogs={props.onClearLogs}
              isFileTransferring={props.isFileTransferring}
              transferProgress={props.transferProgress}
            />
          )}
        </main>
      </div>
    </div>
  );
};
