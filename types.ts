
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type ScanMode = 'interactive' | 'batch';

export type TagVisibility = 'active' | 'stale';

export interface ScanStats {
  visibleTags: number;
  totalReads: number;
  readsPerSecond: number;
  uniquePerSecond: number;
  averageRssi: number | null;
  peakRssi: number | null;
}

export interface Tag {
  epc: string;
  timestamp: number;
  firstSeen?: number;
  rssi?: number;
  count: number;
  antenna?: number;
  delta?: number;
  lastRssi?: number;
  lastSeen?: number;
  freshness?: number;
  visibility?: TagVisibility;
}

export interface Settings {
  power: number;
  buzzer: boolean;
  tagFocus: boolean;
  fastTid: boolean;
  linkProfile: number;
  qValue: number;
  session: number;
  scanParams: {
    interval: number;
    dwell: number;
    count: number;
    append?: number;
  };
  version: string;
  temperature: number;
  battery: number;
  batteryState?: string;
  deviceInfo: string;
}

export interface LogEntry {
  type: 'info' | 'error' | 'rx' | 'tx';
  message: string;
  timestamp: number;
}

export type WriteStatus = 'idle' | 'pending' | 'success' | 'error';

export type ScanType = 'interactive' | 'batch' | null;

export type FileTransferStatus = 'idle' | 'requesting' | 'saving' | 'transferring' | 'parsing' | 'complete' | 'error';

export interface BatchHistoryRecord {
  INDEX: number;
  EPC: string;
}

export type BatchSaveState = 'idle' | 'saving' | 'saved' | 'save_failed';

export interface BatchSaveInfo {
  state: BatchSaveState;
  progress: number;
  written: number;
  total: number;
}
