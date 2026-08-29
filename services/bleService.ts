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

interface BluetoothCharacteristicProperties {
  read?: boolean;
  write?: boolean;
  writeWithoutResponse?: boolean;
  notify?: boolean;
  indicate?: boolean;
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  properties?: BluetoothCharacteristicProperties;
  value?: DataView;
  readValue(): Promise<DataView>;
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithResponse?(value: BufferSource): Promise<void>;
  writeValueWithoutResponse?(value: BufferSource): Promise<void>;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
}
// --------------------------------------

const SERVICE_UUID = '000000ff-0000-1000-8000-00805f9b34fb';
const CHAR_CMD_UUID = '0000ff01-0000-1000-8000-00805f9b34fb';
const CHAR_FILE_REQ_UUID = '0000ff02-0000-1000-8000-00805f9b34fb';
const CHAR_FILE_DATA_UUID = '0000ff03-0000-1000-8000-00805f9b34fb';
const DEVICE_INFO_SERVICE_UUID = '0000180a-0000-1000-8000-00805f9b34fb';
const MODEL_NUMBER_UUID = '00002a24-0000-1000-8000-00805f9b34fb';
const SERIAL_NUMBER_UUID = '00002a25-0000-1000-8000-00805f9b34fb';
const FIRMWARE_REVISION_UUID = '00002a26-0000-1000-8000-00805f9b34fb';
const HARDWARE_REVISION_UUID = '00002a27-0000-1000-8000-00805f9b34fb';
const MANUFACTURER_NAME_UUID = '00002a29-0000-1000-8000-00805f9b34fb';
const JSON_FRAME_START = 0x7B; // '{'
const LIVE_TAGS_MAGIC_0 = 0x4E; // 'N'
const LIVE_TAGS_MAGIC_1 = 0x48; // 'H'
const LIVE_TAGS_VERSION = 1;
const LIVE_TAGS_TYPE = 1;
const LIVE_TAGS_DELIVERY_INTERVAL_MS = 100;
const COMMAND_WRITE_GAP_MS = 85;
const RECONNECT_DELAYS_MS = [1000, 2000, 4000] as const;

export type BleDeviceIdentity = {
  canonicalId: string;
  displayId: string;
  advertisedName: string;
  model: string;
  firmware: string;
  hardware: string;
  manufacturer: string;
};

type LiveTagsItem = [string, number, number, number];
type LiveTagsPayload = {
  cmd: 'live_tags';
  seq: number;
  d: LiveTagsItem[];
};

// Callbacks
type DataCallback = (data: any) => void;
type LogCallback = (msg: string, type: 'info' | 'error' | 'rx' | 'tx') => void;
type FileTransferEvent = 'request' | 'start' | 'progress' | 'complete' | 'busy' | 'error';
type FileTransferCallback = (event: FileTransferEvent, data?: any) => void;
type ConnectionCallback = (status: ConnectionStatus, reason?: string) => void;
type RequestDeviceOptions = {
  acceptAllDevices?: boolean;
  filters?: Array<{ namePrefix?: string; services?: string[] }>;
  optionalServices: string[];
};

type NhrbStartMetadata = {
  cmd: 'START';
  format: 'NHRB';
  version: number;
  size: number;
  chunks: number;
};

const wait = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

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
  private onConnectionStatus: ConnectionCallback | null = null;
  private identity: BleDeviceIdentity | null = null;
  private shouldReconnect = false;
  private reconnectGeneration = 0;

  // File Transfer State
  private isFileTransferring = false;
  private fileChunks: Map<number, Uint8Array> = new Map();
  private fileTotalSize = 0;
  private fileReceivedSize = 0;
  private fileExpectedChunks = 0;
  private fileSeqEndian: 'little' | 'big' | null = null;

  // Command Queue to prevent GATT collisions
  private commandQueue: Promise<void> = Promise.resolve();
  private lastCommandWriteAt = 0;
  private acceptLiveTags = false;
  private liveTagsFlushTimer: number | null = null;
  private liveTagsLastFlushAt = 0;
  private pendingLiveTagsSeq = 0;
  private pendingLiveTags: Map<string, LiveTagsItem> = new Map();

  // Bound handler for file notifications
  private boundFileHandler = this.handleFileNotification.bind(this);
  private boundCmdHandler = this.handleCmdNotification.bind(this);
  private boundDisconnectHandler = this.handleDisconnect.bind(this);

  constructor() {}

  setCallbacks(
    onData: DataCallback,
    onLog: LogCallback,
    onFileTransfer: FileTransferCallback,
    onConnectionStatus?: ConnectionCallback,
  ) {
    this.onDataReceived = onData;
    this.onLog = onLog;
    this.onFileTransfer = onFileTransfer;
    this.onConnectionStatus = onConnectionStatus ?? null;
  }

  async connect(): Promise<void> {
    const nav = navigator as any;
    if (!nav.bluetooth) {
      throw new Error('Web Bluetooth is not supported in this browser.');
    }

    this.log('Requesting device...', 'info');

    try {
      this.disconnect();
      this.device = await this.requestDevice(nav);
      this.device.addEventListener('gattserverdisconnected', this.boundDisconnectHandler);
      await this.connectGatt(false);
    } catch (error: any) {
      this.disconnect();
      this.log(`Connection failed: ${error.message}`, 'error');
      throw error;
    }
  }

  private async requestDevice(nav: any): Promise<BluetoothDevice> {
    const filteredOptions: RequestDeviceOptions = {
      filters: [
        { services: [SERVICE_UUID] },
        { namePrefix: 'NHR10-' },
        { namePrefix: 'NHR-10' },
        { namePrefix: 'Nextwaves' },
      ],
      optionalServices: [SERVICE_UUID, DEVICE_INFO_SERVICE_UUID],
    };

    try {
      return await nav.bluetooth.requestDevice(filteredOptions);
    } catch (error: any) {
      const message = String(error?.message ?? error ?? '');
      const shouldRetryForBluefy = /payload|parse|parsed|requestdevice/i.test(message);
      if (!shouldRetryForBluefy) {
        throw error;
      }

      this.log('Retrying BLE request with iOS-compatible selector...', 'info');
      return nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_UUID, DEVICE_INFO_SERVICE_UUID],
      });
    }
  }

  disconnect() {
    const device = this.device;
    this.shouldReconnect = false;
    this.reconnectGeneration += 1;
    device?.removeEventListener('gattserverdisconnected', this.boundDisconnectHandler);
    if (device?.gatt?.connected) {
      device.gatt.disconnect();
    }
    this.clearConnectionState();
  }

  private async connectGatt(isReconnect: boolean): Promise<void> {
    const device = this.device;
    if (!device?.gatt) {
      throw new Error('Selected device does not expose a GATT server.');
    }

    this.log(`${isReconnect ? 'Reconnecting' : 'Connecting'} to ${device.name ?? 'NHR-10'}...`, 'info');
    this.server = await device.gatt.connect();

    const connectedIdentity = await this.readAndValidateIdentity(this.server, device);

    this.log('Getting Service...', 'info');
    this.service = await this.server.getPrimaryService(SERVICE_UUID);

    this.log('Getting Characteristics...', 'info');
    this.charCmd = await this.service.getCharacteristic(CHAR_CMD_UUID);
    this.charFileReq = await this.service.getCharacteristic(CHAR_FILE_REQ_UUID);
    this.charFileData = await this.service.getCharacteristic(CHAR_FILE_DATA_UUID);
    this.log(`FF01 properties: ${this.formatCharacteristicProperties(this.charCmd)}`, 'info');

    this.log('Starting Notifications...', 'info');
    await this.charCmd.startNotifications();
    this.charCmd.addEventListener('characteristicvaluechanged', this.boundCmdHandler);

    this.identity = connectedIdentity ?? this.identity;
    this.shouldReconnect = true;
    this.log(isReconnect ? 'Reconnected and ready.' : 'Connected and ready.', 'info');
  }

  private handleDisconnect(event: Event) {
    const disconnectedDevice = event.target as BluetoothDevice;
    if (disconnectedDevice !== this.device || !this.shouldReconnect) return;

    this.shouldReconnect = false;
    this.clearGattState();
    this.log('Device disconnected unexpectedly.', 'error');
    this.onConnectionStatus?.('disconnected', 'BLE link lost');

    const reconnectGeneration = ++this.reconnectGeneration;
    void this.reconnectDevice(disconnectedDevice, reconnectGeneration);
  }

  private async reconnectDevice(device: BluetoothDevice, reconnectGeneration: number): Promise<void> {
    let lastError = 'device unavailable';

    for (let attempt = 0; attempt < RECONNECT_DELAYS_MS.length; attempt += 1) {
      await wait(RECONNECT_DELAYS_MS[attempt]);
      if (this.device !== device || this.reconnectGeneration !== reconnectGeneration) return;

      this.onConnectionStatus?.('connecting', `Reconnect attempt ${attempt + 1}/${RECONNECT_DELAYS_MS.length}`);
      try {
        await this.connectGatt(true);
        if (this.device !== device || this.reconnectGeneration !== reconnectGeneration) return;
        this.onConnectionStatus?.('connected');
        return;
      } catch (error: any) {
        lastError = String(error?.message ?? error ?? lastError);
        this.clearGattState();
        this.log(`Reconnect attempt ${attempt + 1} failed: ${lastError}`, 'error');
      }
    }

    if (this.device !== device || this.reconnectGeneration !== reconnectGeneration) return;
    this.disconnect();
    this.onConnectionStatus?.('error', `BLE reconnect failed: ${lastError}`);
  }

  private async readAndValidateIdentity(
    server: BluetoothRemoteGATTServer,
    device: BluetoothDevice,
  ): Promise<BleDeviceIdentity | null> {
    const advertisedName = device.name?.trim() ?? '';
    const displayMatch = /^NHR10-([0-9A-F]{6})$/i.exec(advertisedName);
    const advertisedDisplayId = displayMatch?.[1].toUpperCase() ?? null;
    const isLegacyName = /^(NHR-10|Nextwaves)/i.test(advertisedName);

    let model: string;
    let serial: string;
    let infoService: BluetoothRemoteGATTService;
    try {
      infoService = await server.getPrimaryService(DEVICE_INFO_SERVICE_UUID);
      // Serialize reads because several Web Bluetooth stacks reject parallel GATT operations.
      model = await this.readGattText(infoService, MODEL_NUMBER_UUID);
      serial = await this.readGattText(infoService, SERIAL_NUMBER_UUID);
    } catch (error: any) {
      if (isLegacyName) {
        this.log(`Legacy device without verifiable Device Information Service: ${error.message}`, 'info');
        return null;
      }
      throw new Error(`NHR-10 identity verification failed: ${error.message}`);
    }

    const firmware = await this.readGattTextOptional(infoService, FIRMWARE_REVISION_UUID, 'Firmware Revision');
    const hardware = await this.readGattTextOptional(infoService, HARDWARE_REVISION_UUID, 'Hardware Revision');
    const manufacturer = await this.readGattTextOptional(infoService, MANUFACTURER_NAME_UUID, 'Manufacturer Name');

    const canonicalId = serial.trim().toUpperCase();
    if (model.trim() !== 'NHR-10') {
      throw new Error(`NHR-10 identity verification failed: unexpected model "${model.trim()}"`);
    }
    if (!/^NHR10-[0-9A-F]{12}$/.test(canonicalId)) {
      throw new Error(`NHR-10 identity verification failed: invalid Serial Number "${serial.trim()}"`);
    }

    const displayId = canonicalId.slice(-6);
    if (advertisedDisplayId && advertisedDisplayId !== displayId) {
      throw new Error(`NHR-10 identity verification failed: advertised ID ${advertisedDisplayId} does not match Serial Number ${canonicalId}`);
    }
    if (this.identity && this.identity.canonicalId !== canonicalId) {
      throw new Error(`NHR-10 identity verification failed: reconnected device identity changed from ${this.identity.canonicalId} to ${canonicalId}`);
    }

    this.log(`Verified device identity: ${canonicalId}`, 'info');
    return {
      canonicalId,
      displayId,
      advertisedName,
      model: model.trim(),
      firmware: firmware.trim(),
      hardware: hardware.trim(),
      manufacturer: manufacturer.trim(),
    };
  }

  private async readGattText(
    service: BluetoothRemoteGATTService,
    characteristicUuid: string,
  ): Promise<string> {
    const characteristic = await service.getCharacteristic(characteristicUuid);
    const value = await characteristic.readValue();
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return new TextDecoder('utf-8').decode(bytes).replace(/\0+$/g, '');
  }

  private async readGattTextOptional(
    service: BluetoothRemoteGATTService,
    characteristicUuid: string,
    label: string,
  ): Promise<string> {
    try {
      return await this.readGattText(service, characteristicUuid);
    } catch (error: any) {
      this.log(`${label} is unavailable: ${error.message}`, 'info');
      return '';
    }
  }

  private validateDeviceInfoResponse(data: any): boolean {
    if (typeof data?.id !== 'string' || data.id.trim() === '') return true;

    const canonicalId = data.id.trim().toUpperCase();
    if (!/^NHR10-[0-9A-F]{12}$/.test(canonicalId)) {
      this.rejectIdentity(`DI returned invalid Canonical ID "${data.id}"`);
      return false;
    }

    const displayId = canonicalId.slice(-6);
    const responseDisplayId = typeof data.display_id === 'string'
      ? data.display_id.trim().toUpperCase()
      : displayId;
    if (responseDisplayId !== displayId) {
      this.rejectIdentity(`DI Display ID ${responseDisplayId} does not match ${canonicalId}`);
      return false;
    }
    if (this.identity && this.identity.canonicalId !== canonicalId) {
      this.rejectIdentity(`DI identity ${canonicalId} does not match ${this.identity.canonicalId}`);
      return false;
    }

    const advertisedName = this.device?.name?.trim() ?? '';
    const advertisedMatch = /^NHR10-([0-9A-F]{6})$/i.exec(advertisedName);
    if (advertisedMatch && advertisedMatch[1].toUpperCase() !== displayId) {
      this.rejectIdentity(`DI identity ${canonicalId} does not match advertised name ${advertisedName}`);
      return false;
    }

    if (!this.identity) {
      this.identity = {
        canonicalId,
        displayId,
        advertisedName,
        model: typeof data.val === 'string' ? data.val.trim() : 'NHR-10',
        firmware: typeof data.fw === 'string' ? data.fw.trim() : '',
        hardware: typeof data.hw === 'string' ? data.hw.trim() : '',
        manufacturer: '',
      };
      this.log(`Verified legacy device identity from DI: ${canonicalId}`, 'info');
    } else {
      this.identity = {
        ...this.identity,
        firmware: typeof data.fw === 'string' && data.fw.trim() ? data.fw.trim() : this.identity.firmware,
        hardware: typeof data.hw === 'string' && data.hw.trim() ? data.hw.trim() : this.identity.hardware,
      };
    }

    return true;
  }

  private rejectIdentity(reason: string) {
    const message = `NHR-10 identity verification failed: ${reason}`;
    this.log(message, 'error');
    this.onConnectionStatus?.('error', message);
    this.disconnect();
  }

  getDeviceName(): string {
    return this.device?.name ?? '';
  }

  getDeviceIdentity(): BleDeviceIdentity | null {
    return this.identity ? { ...this.identity } : null;
  }

  private clearConnectionState() {
    this.device?.removeEventListener('gattserverdisconnected', this.boundDisconnectHandler);
    this.clearGattState();
    this.shouldReconnect = false;
    this.identity = null;
    this.device = null;
  }

  private clearGattState() {
    this.charCmd?.removeEventListener('characteristicvaluechanged', this.boundCmdHandler);
    this.charFileData?.removeEventListener('characteristicvaluechanged', this.boundFileHandler);
    this.resetFileState();
    this.commandQueue = Promise.resolve();
    this.lastCommandWriteAt = 0;
    this.acceptLiveTags = false;
    this.clearPendingLiveTags();
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

  suspendLiveTags() {
    this.acceptLiveTags = false;
    this.clearPendingLiveTags();
  }

  resumeLiveTags() {
    this.clearPendingLiveTags();
    this.acceptLiveTags = true;
  }

  private clearPendingLiveTags() {
    if (this.liveTagsFlushTimer !== null) {
      window.clearTimeout(this.liveTagsFlushTimer);
      this.liveTagsFlushTimer = null;
    }

    this.pendingLiveTags.clear();
    this.pendingLiveTagsSeq = 0;
  }

  private enqueueLiveTags(data: LiveTagsPayload) {
    if (!this.acceptLiveTags) return;

    data.d.forEach(([epc, rssi, countDelta, totalCount]) => {
      const existing = this.pendingLiveTags.get(epc);
      const mergedDelta = (existing?.[2] ?? 0) + countDelta;
      this.pendingLiveTags.set(epc, [epc, rssi, mergedDelta, totalCount]);
    });

    this.pendingLiveTagsSeq = data.seq;
    this.scheduleLiveTagsFlush();
  }

  private scheduleLiveTagsFlush() {
    if (this.liveTagsFlushTimer !== null) return;

    const elapsedMs = Date.now() - this.liveTagsLastFlushAt;
    const delayMs = Math.max(0, LIVE_TAGS_DELIVERY_INTERVAL_MS - elapsedMs);
    this.liveTagsFlushTimer = window.setTimeout(() => {
      this.liveTagsFlushTimer = null;
      this.flushLiveTags();
    }, delayMs);
  }

  private flushLiveTags() {
    if (!this.acceptLiveTags || this.pendingLiveTags.size === 0) {
      this.clearPendingLiveTags();
      return;
    }

    const payload: LiveTagsPayload = {
      cmd: 'live_tags',
      seq: this.pendingLiveTagsSeq,
      d: Array.from(this.pendingLiveTags.values()),
    };

    this.pendingLiveTags.clear();
    this.pendingLiveTagsSeq = 0;
    this.liveTagsLastFlushAt = Date.now();
    if (this.onDataReceived) {
      this.onDataReceived(payload);
    }
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
      if (!this.acceptLiveTags) {
        return;
      }

      const data = this.parseBinaryLiveTags(view);
      if (data) {
        this.enqueueLiveTags(data);
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

      if (data.cmd === 'DI' && !this.validateDeviceInfoResponse(data)) {
        return;
      }

      if (data.cmd === 'live_tags') {
        if (!this.acceptLiveTags) {
          return;
        }

        if (Array.isArray(data.d)) {
          this.enqueueLiveTags(data);
        }
        return;
      }

      if (data.cmd === 'live_tag' && !this.acceptLiveTags) {
        return;
      }

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

  private formatCharacteristicProperties(characteristic: BluetoothRemoteGATTCharacteristic | null): string {
    const props = characteristic?.properties;
    if (!props) return 'unknown';

    const enabled = [
      props.read ? 'read' : '',
      props.write ? 'write' : '',
      props.writeWithoutResponse ? 'writeWithoutResponse' : '',
      props.notify ? 'notify' : '',
      props.indicate ? 'indicate' : '',
    ].filter(Boolean);

    return enabled.length > 0 ? enabled.join(',') : 'none';
  }

  private async writeCharacteristicValue(
    characteristic: BluetoothRemoteGATTCharacteristic,
    data: Uint8Array,
  ): Promise<string> {
    const props = characteristic.properties;
    const canWriteWithResponse = props?.write !== false && typeof characteristic.writeValueWithResponse === 'function';
    const canWriteWithoutResponse = props?.writeWithoutResponse !== false && typeof characteristic.writeValueWithoutResponse === 'function';

    if (props?.write && typeof characteristic.writeValueWithResponse === 'function') {
      await characteristic.writeValueWithResponse(data);
      return 'writeWithResponse';
    }

    if (props?.writeWithoutResponse && !props.write && typeof characteristic.writeValueWithoutResponse === 'function') {
      await characteristic.writeValueWithoutResponse(data);
      return 'writeWithoutResponse';
    }

    if (canWriteWithResponse) {
      try {
        await characteristic.writeValueWithResponse!(data);
        return 'writeWithResponse';
      } catch (error) {
        if (!canWriteWithoutResponse) throw error;
      }
    }

    if (canWriteWithoutResponse) {
      await characteristic.writeValueWithoutResponse!(data);
      return 'writeWithoutResponse';
    }

    await characteristic.writeValue(data);
    return 'writeValue';
  }

  // --- Command Helpers ---

  async getDeviceInfo() { return this.sendCommand({ cmd: 'DI' }); }
  async getInfo() { return this.sendCommand({ cmd: 'GRI' }); }
  async getPower() { return this.sendCommand({ cmd: 'GP' }); }
  async getProfile() { return this.sendCommand({ cmd: 'GLP' }); }
  async getQSession() { return this.sendCommand({ cmd: 'GQS' }); }
  async getBattery() { return this.sendCommand({ cmd: 'GB' }); }
  async getTemperature() { return this.sendCommand({ cmd: 'GT' }); }

  async getQueryParam() { return this.sendCommand({ cmd: 'GQP' }); }
  async getTagFocus() { return this.sendCommand({ cmd: 'GTF' }); }
  async getRegion() { return this.sendCommand({ cmd: 'GF' }); }

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

  async setRegion(region: string, save = true) {
    return this.sendCommand({ cmd: 'SF', val: region, save });
  }

  async setCustomRegion(startKHz: number, count: number, space125KHz: number, save = true) {
    return this.sendCommand({
      cmd: 'SF',
      mode: 'custom',
      start_khz: startKHz,
      count,
      space_125khz: space125KHz,
      save,
    });
  }

  async setTagFocus(enable: boolean) { return this.sendCommand({ cmd: 'TF', val: enable ? 1 : 0 }); }
  async saveTagFocus(enable: boolean) { return this.sendCommand({ cmd: 'STF', val: enable ? 1 : 0 }); }
  
  async startScan() {
    this.clearPendingLiveTags();
    this.acceptLiveTags = true;
    try {
      await this.sendCommand({ cmd: 'S' });
    } catch (error) {
      this.suspendLiveTags();
      throw error;
    }
  }

  async stopScan() {
    this.suspendLiveTags();
    return this.sendCommand({ cmd: 'X' });
  }
  
  async startBatch() {
    this.suspendLiveTags();
    return this.sendCommand({ cmd: 'SB' });
  }
  async stopBatch() {
    this.suspendLiveTags();
    return this.sendCommand({ cmd: 'XB' });
  }

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

    // Append to queue. Recover from previous write failures so reconnects are not poisoned.
    this.commandQueue = this.commandQueue.catch(() => undefined).then(async () => {
      try {
        if (this.charCmd) {
          const elapsedSinceLastWrite = Date.now() - this.lastCommandWriteAt;
          if (elapsedSinceLastWrite < COMMAND_WRITE_GAP_MS) {
            await wait(COMMAND_WRITE_GAP_MS - elapsedSinceLastWrite);
          }

          const mode = await this.writeCharacteristicValue(this.charCmd, data);
          this.lastCommandWriteAt = Date.now();
          this.log(`TX (${mode}, ${data.byteLength}B): ${str}`, 'tx');
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
    await this.sendCommand({ cmd: 'GB' });
    await this.sendCommand({ cmd: 'GT' });
    await this.sendCommand({ cmd: 'GP' });
    await this.sendCommand({ cmd: 'GLP' });
    await this.sendCommand({ cmd: 'GQS' });
    await this.sendCommand({ cmd: 'GQP' });
    await this.sendCommand({ cmd: 'GTF' });
    await this.sendCommand({ cmd: 'GF' });
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
