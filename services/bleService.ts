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

// Callbacks
type DataCallback = (data: any) => void;
type LogCallback = (msg: string, type: 'info' | 'error' | 'rx' | 'tx') => void;
type FileTransferEvent = 'start' | 'progress' | 'complete' | 'error';
type FileTransferCallback = (event: FileTransferEvent, data?: any) => void;

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
  private fileBuffer: Uint8Array[] = [];
  private fileTotalSize = 0;
  private fileReceivedSize = 0;

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
    this.fileBuffer = [];
    this.fileTotalSize = 0;
    this.fileReceivedSize = 0;
  }

  private handleCmdNotification(event: Event) {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    if (!target.value) return;

    const decoder = new TextDecoder('utf-8');
    const value = decoder.decode(target.value);
    
    // Attempt to parse JSON
    try {
        const data = JSON.parse(value);
        
        // Pass all parsed JSON to the App to handle
        if (this.onDataReceived) {
            this.onDataReceived(data);
        }

        // Log non-tag commands as RX
        if (data.cmd !== 'live_tag' && data.cmd !== 'live_tags') {
             this.log(`RX: ${value}`, 'rx');
        }

    } catch (e) {
        this.log(`RX (Raw): ${value}`, 'rx');
    }
  }

  private handleFileNotification(event: Event) {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    if (!target.value || target.value.byteLength < 2) return;
    
    const view = new DataView(target.value.buffer);
    // Protocol Header is Big-Endian
    const header = view.getUint16(0, false); 

    if (header === 0xFFFF) {
        // --- START PACKET ---
        this.resetFileState();
        this.isFileTransferring = true;

        // Payload is JSON Metadata
        const payload = new Uint8Array(target.value.buffer.slice(2));
        const decoder = new TextDecoder('utf-8');
        try {
            const jsonStr = decoder.decode(payload);
            const metadata = JSON.parse(jsonStr);
            this.fileTotalSize = metadata.size || 0;
            
            if (this.onFileTransfer) {
                this.onFileTransfer('start', { total: this.fileTotalSize });
            }
        } catch (e) {
            this.log('Failed to parse START packet', 'error');
            this.isFileTransferring = false;
            if (this.onFileTransfer) this.onFileTransfer('error', 'Invalid START packet');
        }

    } else if (header === 0xFFFE) {
        // --- EOF PACKET ---
        if (!this.isFileTransferring) return;
        this.isFileTransferring = false;

        // Assemble all chunks
        const totalLen = this.fileBuffer.reduce((acc, chunk) => acc + chunk.length, 0);
        const fullFile = new Uint8Array(totalLen);
        let offset = 0;
        for (const chunk of this.fileBuffer) {
            fullFile.set(chunk, offset);
            offset += chunk.length;
        }

        // Decode
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(fullFile);
        
        if (this.onFileTransfer) {
            this.onFileTransfer('complete', text);
        }

    } else {
        // --- DATA PACKET ---
        if (!this.isFileTransferring) return;

        // Header 0x0000 -> 0xFFFD is sequence number, just take payload
        const chunk = new Uint8Array(target.value.buffer.slice(2));
        this.fileBuffer.push(chunk);
        this.fileReceivedSize += chunk.length;

        // Progress
        if (this.onFileTransfer && this.fileTotalSize > 0) {
            const percent = Math.min(100, Math.round((this.fileReceivedSize / this.fileTotalSize) * 100));
            this.onFileTransfer('progress', percent);
        }
    }
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
        this.log('Starting file transfer...', 'info');
        this.resetFileState();
        this.isFileTransferring = true;
        
        // Step 1: Get characteristic and start notifications
        if (!this.charFileData) throw new Error('File Data Characteristic not found');
        
        await this.charFileData.startNotifications();
        this.charFileData.addEventListener('characteristicvaluechanged', this.boundFileHandler);
        
        if (this.onFileTransfer) this.onFileTransfer('start');

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
