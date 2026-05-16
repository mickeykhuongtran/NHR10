import { ConnectionStatus } from '../types';

// --- Web Bluetooth Type Definitions ---
interface BluetoothDevice extends EventTarget {
  id: string;
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
}

interface BluetoothRemoteGATTServer {
  device: BluetoothDevice;
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: string | number): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: string | number): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  value?: DataView;
  writeValue(value: BufferSource): Promise<void>;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
}
// --------------------------------------

const SERVICE_UUID = 0x00ff;
const CHAR_CMD_UUID = 0xff01;
const CHAR_FILE_REQ_UUID = 0xff02;
const CHAR_FILE_DATA_UUID = 0xff03;
const JSON_FRAME_START = 0x7B; // '{'
const LIVE_TAGS_MAGIC_0 = 0x4E; // 'N'
const LIVE_TAGS_MAGIC_1 = 0x48; // 'H'
const LIVE_TAGS_VERSION = 1;
const LIVE_TAGS_TYPE = 1;

type LiveTagsPayload = {
  cmd: 'live_tags';
  seq: number;
  d: Array<[string, number, number, number]>;
};

// Callbacks
type DataCallback = (data: any) => void;
type LogCallback = (msg: string, type: 'info' | 'error' | 'rx' | 'tx') => void;
type FileTransferEvent = 'request' | 'start' | 'progress' | 'complete' | 'busy' | 'error';
type FileTransferCallback = (event: FileTransferEvent, data?: any) => void;

type NhrbStartMetadata = {
  cmd: 'START';
  format: 'NHRB';
  version: number;
  size: number;
  chunks: number;
};

class BLEService {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private service: BluetoothRemoteGATTService | null = null;
  private charCmd: BluetoothRemoteGATTCharacteristic | null = null;
  private charFileReq: BluetoothRemoteGATTCharacteristic | null = null;
  private charFileData: BluetoothRemoteGATTCharacteristic | null = null;

  private onDataReceived: DataCallback | null = null;
  private onLog: LogCallback | null = null;
  private onFileTransfer: FileTransferCallback | null = null;

  // File Transfer State
  private isFileTransferring = false;
  private fileChunks: Map<number, Uint8Array> = new Map();
  private fileTotalSize = 0;
  private fileReceivedSize = 0;
  private fileExpectedChunks = 0;
  private fileSeqEndian: 'little' | 'big' | null = null;

  // Command Queue to prevent GATT collisions
  private commandQueue: Promise<void> = Promise.resolve();

  // Bound handler for file notifications
  private boundFileHandler = this.handleFileNotification.bind(this);

  constructor() {}

  setCallbacks(
    onData: DataCallback,
    onLog: LogCallback,
    onFileTransfer: FileTransferCallback
  ) {
    this.onDataReceived = onData;
    this.onLog = onLog;
    this.onFileTransfer = onFileTransfer;
  }

  async connect(): Promise<void> {
    const nav = navigator as any;
    if (!nav.bluetooth) {
      throw new Error('Web Bluetooth is not supported in this browser.');
    }

    this.log('Requesting device...', 'info');

    try {
      this.device = await nav.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'NHR-10' },
          { namePrefix: 'Nextwaves' }
        ],
        optionalServices: [SERVICE_UUID],
      });

      this.device!.addEventListener('gattserverdisconnected', this.handleDisconnect.bind(this));

      this.log(`Connecting to ${this.device!.name}...`, 'info');
      this.server = await this.device!.gatt!.connect();

      this.log('Getting Service...', 'info');
      this.service = await this.server.getPrimaryService(SERVICE_UUID);

      this.log('Getting Characteristics...', 'info');
      this.charCmd = await this.service.getCharacteristic(CHAR_CMD_UUID);
      this.charFileReq = await this.service.getCharacteristic(CHAR_FILE_REQ_UUID);
      this.charFileData = await this.service.getCharacteristic(CHAR_FILE_DATA_UUID);

      // Setup Notifications for Commands/Tags
      this.log('Starting Notifications...', 'info');
      await this.charCmd.startNotifications();
      this.charCmd.addEventListener('characteristicvaluechanged', this.handleCmdNotification.bind(this));

      // Note: File Data notifications are now started in requestFileTransfer()

      this.log('Connected and ready.', 'info');
    } catch (error: any) {
      this.log(`Connection failed: ${error.message}`, 'error');
      throw error;
    }
  }

  disconnect() {
    if (this.device && this.device.gatt?.connected) {
      this.device.gatt.disconnect();
    }
  }

  handleDisconnect() {
    this.log('Device disconnected.', 'error');
    this.resetFileState();
    this.device = null;
    this.server = null;
    this.service = null;
    this.charCmd = null;
    this.charFileReq = null;
    this.charFileData = null;
  }

  private resetFileState() {
    this.isFileTransferring = false;
    this.fileChunks.clear();
    this.fileTotalSize = 0;
    this.fileReceivedSize = 0;
    this.fileExpectedChunks = 0;
    this.fileSeqEndian = null;
  }

  private handleCmdNotification(event: Event) {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const view = target.value;
    if (!view || view.byteLength === 0) return;

    const firstByte = view.getUint8(0);

    if (firstByte === JSON_FRAME_START) {
      this.handleJsonCmdNotification(view);
      return;
    }

    if (
      view.byteLength >= 2 &&
      firstByte === LIVE_TAGS_MAGIC_0 &&
      view.getUint8(1) === LIVE_TAGS_MAGIC_1
    ) {
      const data = this.parseBinaryLiveTags(view);
      if (data && this.onDataReceived) {
        this.onDataReceived(data);
      }
      return;
    }

    this.log(`RX (Unknown ${view.byteLength} bytes): ${this.formatHexPreview(view)}`, 'rx');
  }

  private handleJsonCmdNotification(view: DataView) {
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    const decoder = new TextDecoder('utf-8');
    const value = decoder.decode(bytes);
    
    try {
      const data = JSON.parse(value);

      if (this.onDataReceived) {
        this.onDataReceived(data);
      }

      if (data.cmd !== 'live_tag' && data.cmd !== 'live_tags') {
        this.log(`RX: ${value}`, 'rx');
      }
    } catch (e) {
      this.log(`RX (Invalid JSON): ${value}`, 'rx');
    }
  }

  private parseBinaryLiveTags(view: DataView): LiveTagsPayload | null {
    if (view.byteLength < 9) {
      this.log(`RX (Invalid live_tags frame: ${view.byteLength} bytes)`, 'error');
      return null;
    }

    const version = view.getUint8(2);
    const type = view.getUint8(3);
    if (version !== LIVE_TAGS_VERSION || type !== LIVE_TAGS_TYPE) {
      this.log(`RX (Unsupported live_tags frame v${version}, type ${type})`, 'error');
      return null;
    }

    const seq = view.getUint32(4, true);
    const itemCount = view.getUint8(8);
    const d: LiveTagsPayload['d'] = [];
    let offset = 9;

    for (let i = 0; i < itemCount; i++) {
      if (offset >= view.byteLength) {
        this.log(`RX (Invalid live_tags frame: missing item ${i + 1}/${itemCount})`, 'error');
        return null;
      }

      const epcLen = view.getUint8(offset);
      offset += 1;

      const itemBytes = epcLen + 1 + 2 + 4;
      if (epcLen <= 0 || offset + itemBytes > view.byteLength) {
        this.log(`RX (Invalid live_tags item ${i + 1}: epc_len=${epcLen})`, 'error');
        return null;
      }

      const epcBytes = new Uint8Array(view.buffer, view.byteOffset + offset, epcLen);
      const epc = this.bytesToHex(epcBytes);
      offset += epcLen;

      const rssi = view.getInt8(offset);
      offset += 1;

      const countDelta = view.getUint16(offset, true);
      offset += 2;

      const totalCount = view.getUint32(offset, true);
      offset += 4;

      d.push([epc, rssi, countDelta, totalCount]);
    }

    return { cmd: 'live_tags', seq, d };
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  private formatHexPreview(view: DataView, maxBytes = 24): string {
    const byteLength = Math.min(view.byteLength, maxBytes);
    const bytes = new Uint8Array(view.buffer, view.byteOffset, byteLength);
    const suffix = view.byteLength > maxBytes ? '...' : '';
    return `${this.bytesToHex(bytes)}${suffix}`;
  }

  private handleFileNotification(event: Event) {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const view = target.value;
    if (!view || view.byteLength === 0) return;

    if (view.getUint8(0) === JSON_FRAME_START) {
      this.handleUnframedFileJson(view);
      return;
    }

    if (view.byteLength < 2) {
      this.failFileTransfer(`Invalid FF03 frame: ${view.byteLength} bytes`);
      return;
    }

    const headerBig = view.getUint16(0, false);
    const headerLittle = view.getUint16(0, true);
    const payload = this.copyPayload(view, 2);

    if (headerBig === 0xFFFF) {
      this.handleFileStartFrame(payload);
      return;
    }

    if (headerBig === 0xFFFE || headerLittle === 0xFFFE) {
      this.handleFileEofFrame(payload);
      return;
    }

    this.handleFileDataFrame(headerBig, headerLittle, payload);
  }

  private handleUnframedFileJson(view: DataView) {
    const payload = this.copyPayload(view, 0);
    const data = this.parseJsonPayload(payload);

    if (data?.err === 2 && data?.state === 'busy') {
      this.log('FF03 busy: device is still saving batch data', 'info');
      this.resetFileState();
      this.charFileData?.removeEventListener('characteristicvaluechanged', this.boundFileHandler);
      if (this.onFileTransfer) this.onFileTransfer('busy', data);
      return;
    }

    this.log(`RX (FF03 JSON): ${new TextDecoder('utf-8').decode(payload)}`, 'rx');
  }

  private handleFileStartFrame(payload: Uint8Array) {
    this.resetFileState();

    const metadata = this.parseJsonPayload(payload) as Partial<NhrbStartMetadata> | null;
    if (!metadata || metadata.cmd !== 'START') {
      this.failFileTransfer('Invalid START packet metadata');
      return;
    }

    if (metadata.format !== 'NHRB' || metadata.version !== 1) {
      this.failFileTransfer(`Unsupported batch file format: ${metadata.format ?? 'unknown'} v${metadata.version ?? 'unknown'}`);
      return;
    }

    const size = Number(metadata.size);
    const chunks = Number(metadata.chunks);
    if (!Number.isFinite(size) || size < 32 || !Number.isFinite(chunks) || chunks < 0) {
      this.failFileTransfer('Invalid NHRB START packet size/chunks');
      return;
    }

    this.isFileTransferring = true;
    this.fileTotalSize = Math.trunc(size);
    this.fileExpectedChunks = Math.trunc(chunks);

    if (this.onFileTransfer) {
      this.onFileTransfer('start', {
        format: metadata.format,
        version: metadata.version,
        total: this.fileTotalSize,
        chunks: this.fileExpectedChunks,
      });
    }
  }

  private handleFileDataFrame(seqBig: number, seqLittle: number, payload: Uint8Array) {
    if (!this.isFileTransferring) return;

    const seq = this.resolveFileSeq(seqBig, seqLittle);
    const existing = this.fileChunks.get(seq);
    if (existing) {
      this.fileReceivedSize -= existing.byteLength;
    }

    const chunk = payload.slice();
    this.fileChunks.set(seq, chunk);
    this.fileReceivedSize += chunk.byteLength;

    if (this.onFileTransfer && this.fileTotalSize > 0) {
      const percent = Math.min(99, Math.round((this.fileReceivedSize / this.fileTotalSize) * 100));
      this.onFileTransfer('progress', percent);
    }
  }

  private resolveFileSeq(seqBig: number, seqLittle: number): number {
    const expectedNextSeq = this.fileChunks.size;

    if (this.fileSeqEndian === null) {
      if (seqLittle === expectedNextSeq && seqBig !== expectedNextSeq) {
        this.fileSeqEndian = 'little';
      } else if (seqBig === expectedNextSeq && seqLittle !== expectedNextSeq) {
        this.fileSeqEndian = 'big';
      } else if (this.fileExpectedChunks > 0) {
        if (seqLittle < this.fileExpectedChunks && seqBig >= this.fileExpectedChunks) {
          this.fileSeqEndian = 'little';
        } else if (seqBig < this.fileExpectedChunks && seqLittle >= this.fileExpectedChunks) {
          this.fileSeqEndian = 'big';
        }
      }
    }

    return this.fileSeqEndian === 'big' ? seqBig : seqLittle;
  }

  private handleFileEofFrame(payload: Uint8Array) {
    if (!this.isFileTransferring) return;

    const eof = this.parseJsonPayload(payload);
    if (payload.byteLength > 0 && eof?.cmd !== 'EOF') {
      this.failFileTransfer('Invalid EOF packet metadata');
      return;
    }

    if (this.fileExpectedChunks > 0 && this.fileChunks.size !== this.fileExpectedChunks) {
      this.failFileTransfer(`Missing file chunks: received ${this.fileChunks.size}/${this.fileExpectedChunks}`);
      return;
    }

    const orderedChunks = Array.from(this.fileChunks.entries())
      .sort(([seqA], [seqB]) => seqA - seqB)
      .map(([, chunk]) => chunk);
    const totalLen = orderedChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);

    if (totalLen !== this.fileTotalSize) {
      this.failFileTransfer(`NHRB file size mismatch: received ${totalLen}/${this.fileTotalSize}`);
      return;
    }

    const fullFile = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of orderedChunks) {
      fullFile.set(chunk, offset);
      offset += chunk.byteLength;
    }

    this.resetFileState();
    this.charFileData?.removeEventListener('characteristicvaluechanged', this.boundFileHandler);
    if (this.onFileTransfer) {
      this.onFileTransfer('complete', fullFile);
    }
  }

  private copyPayload(view: DataView, offset: number): Uint8Array {
    return new Uint8Array(view.buffer, view.byteOffset + offset, view.byteLength - offset).slice();
  }

  private parseJsonPayload(payload: Uint8Array): any | null {
    try {
      const jsonStr = new TextDecoder('utf-8').decode(payload);
      return JSON.parse(jsonStr);
    } catch (e) {
      return null;
    }
  }

  private failFileTransfer(message: string) {
    this.log(message, 'error');
    this.resetFileState();
    this.charFileData?.removeEventListener('characteristicvaluechanged', this.boundFileHandler);
    if (this.onFileTransfer) this.onFileTransfer('error', message);
  }

  // --- Command Helpers ---

  async getInfo() { return this.sendCommand({ cmd: 'GRI' }); }
  async getPower() { return this.sendCommand({ cmd: 'GP' }); }
  async getProfile() { return this.sendCommand({ cmd: 'GLP' }); }
  async getQSession() { return this.sendCommand({ cmd: 'GQS' }); }
  async getBattery() { return this.sendCommand({ cmd: 'GB' }); }
  async getTemperature() { return this.sendCommand({ cmd: 'GT' }); }

  async getQueryParam() { return this.sendCommand({ cmd: 'GQP' }); }
  async getTagFocus() { return this.sendCommand({ cmd: 'GTF' }); }

  async setPower(dbm: number) { return this.sendCommand({ cmd: 'SP', val: dbm }); }
  
  // Baseband: Profile, Q, Session, Target
  async setBaseband(profile: number, q: number, session: number, target = 0) {
    return this.sendCommand({ cmd: 'SRP', val: `${profile},${q},${session},${target}` });
  }

  // New specific setters based on firmware V12.0
  async setLinkProfile(profile: number) {
    return this.sendCommand({ cmd: 'SLP', val: profile });
  }

  async setQSession(q: number, session: number) {
    return this.sendCommand({ cmd: 'SQS', val: `${q},${session}` });
  }

  async setQueryParam(intervalMs: number, dwellRaw: number, append: number) {
    // V12.6: Send user-friendly values directly.
    // Firmware handles conversion to module raw format:
    //   interval: ms value (e.g. 50 = 50ms, firmware divides by 10 -> raw 5)
    //   dwell:    raw count (e.g. 150, module interprets as 150*100ms = 15s)
    //   append:   direct value (0-255)
    return this.sendCommand({ cmd: 'SQP', val: `${intervalMs},${dwellRaw},${append}` });
  }

  async setTagFocus(enable: boolean) { return this.sendCommand({ cmd: 'TF', val: enable ? 1 : 0 }); }
  async saveTagFocus(enable: boolean) { return this.sendCommand({ cmd: 'STF', val: enable ? 1 : 0 }); }
  
  async startScan() { return this.sendCommand({ cmd: 'S' }); }
  async stopScan() { return this.sendCommand({ cmd: 'X' }); }
  
  async startBatch() { return this.sendCommand({ cmd: 'SB' }); }
  async stopBatch() { return this.sendCommand({ cmd: 'XB' }); }

  // Deprecated: SMASK is removed in V12.1+
  // async setMask(epc: string) { return this.sendCommand({ cmd: 'SMASK', epc }); }
  // async clearMask() { return this.sendCommand({ cmd: 'SMASK', epc: '' }); }
  
  async locateTag(epc: string) { return this.sendCommand({ cmd: 'F', val: epc }); }

  async showPopup(content: string, time: number, beep: boolean) {
    const safeContent = content.substring(0, 15);
    return this.sendCommand({ cmd: 'POPUP', content: safeContent, time, beep });
  }

  async writeEpc(targetEpc: string, newEpc: string, password = "00000000") { 
    return this.sendCommand({ cmd: 'WE', epc: targetEpc, new: newEpc, pwd: password }); 
  }
  
  async writeData(epc: string, mem: number, ptr: number, data: string, password = "00000000") {
    return this.sendCommand({ cmd: 'WD', epc, mem, ptr, data, pwd: password });
  }

  async saveConfig() { return this.sendCommand({ cmd: 'SAVE' }); }

  // Queue commands to ensure they are serialized
  async sendCommand(command: object): Promise<void> {
    if (!this.charCmd) throw new Error('Not connected');
    
    const str = JSON.stringify(command);
    const encoder = new TextEncoder();
    const data = encoder.encode(str);

    // Append to queue
    this.commandQueue = this.commandQueue.then(async () => {
      try {
        this.log(`TX: ${str}`, 'tx');
        if (this.charCmd) {
          await this.charCmd.writeValue(data);
        }
      } catch (error: any) {
        this.log(`TX Failed: ${error.message}`, 'error');
        throw error;
      }
    });

    return this.commandQueue;
  }

  // Get Settings: Sends a sequence of commands to fetch device state
  async getSettings(): Promise<void> {
    // These will be queued automatically by sendCommand
    await this.sendCommand({ cmd: 'DI' });
    await this.sendCommand({ cmd: 'GRI' });
    await this.sendCommand({ cmd: 'GT' });
    await this.sendCommand({ cmd: 'GP' });
    await this.sendCommand({ cmd: 'GLP' });
    await this.sendCommand({ cmd: 'GQS' });
  }
  
  async requestFileTransfer(): Promise<void> {
    if (!this.device || !this.device.gatt?.connected) {
        throw new Error('Device not connected');
    }
    
    if (this.isFileTransferring) {
        this.log('File transfer already in progress', 'error');
        return;
    }

    try {
        this.log('Requesting batch file...', 'info');
        this.resetFileState();
        this.isFileTransferring = true;
        
        // Step 1: Get characteristic and start notifications
        if (!this.charFileData) throw new Error('File Data Characteristic not found');
        
        await this.charFileData.startNotifications();
        this.charFileData.addEventListener('characteristicvaluechanged', this.boundFileHandler);
        
        if (this.onFileTransfer) this.onFileTransfer('request');

        // Step 3: Write "send_file" to Control Characteristic
        if (!this.charFileReq) throw new Error('File Control Characteristic not found');
        
        const encoder = new TextEncoder();
        const command = encoder.encode('send_file');
        this.log('TX (FileReq): send_file', 'tx');
        await this.charFileReq.writeValue(command);
        
    } catch (error: any) {
        this.log(`Fetch History Failed: ${error.message}`, 'error');
        this.isFileTransferring = false;
        
        // Cleanup listener if failed
        if (this.charFileData) {
            this.charFileData.removeEventListener('characteristicvaluechanged', this.boundFileHandler);
        }
        
        if (this.onFileTransfer) this.onFileTransfer('error', error.message);
        throw error;
    }
  }
  
  private log(msg: string, type: 'info' | 'error' | 'rx' | 'tx') {
    if (this.onLog) this.onLog(msg, type);
    else console.log(`[${type.toUpperCase()}] ${msg}`);
  }
}

export const bleService = new BLEService();
