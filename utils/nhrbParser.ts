const NHRB_MAGIC = 'NHRB';
const NHRB_HEADER_SIZE = 32;
const NHRB_VERSION = 1;
const NHRB_FORMAT_ID = 1;
const NHRB_RECORD_SIZE = 17;
const NHRB_MAX_EPC_BYTES = 16;

export interface NhrbHeader {
  recordCount: number;
  payloadBytes: number;
  payloadCrc32: number;
  timestampUnix: number;
  maxEpcLenBytes: number;
}

export interface NhrbParseResult {
  header: NhrbHeader;
  epcs: string[];
}

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

const bytesToHex = (bytes: Uint8Array): string => (
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
);

const readAscii = (bytes: Uint8Array, offset: number, length: number): string => (
  String.fromCharCode(...bytes.subarray(offset, offset + length))
);

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) {
    crc = crc32Table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
};

const assertNhrb = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

export const parseNhrbFile = (file: Uint8Array): NhrbParseResult => {
  assertNhrb(file.byteLength >= NHRB_HEADER_SIZE, 'NHRB file is shorter than 32-byte header');

  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const magic = readAscii(file, 0, 4);
  const version = view.getUint8(4);
  const headerLen = view.getUint8(5);
  const formatId = view.getUint8(6);
  const recordSize = view.getUint8(7);
  const recordCount = view.getUint32(8, true);
  const payloadBytes = view.getUint32(12, true);
  const payloadCrc32 = view.getUint32(16, true);
  const timestampUnix = view.getUint32(20, true);
  const maxEpcLenBytes = view.getUint8(24);

  assertNhrb(magic === NHRB_MAGIC, `Invalid NHRB magic: ${magic}`);
  assertNhrb(version === NHRB_VERSION, `Unsupported NHRB version: ${version}`);
  assertNhrb(headerLen === NHRB_HEADER_SIZE, `Invalid NHRB header length: ${headerLen}`);
  assertNhrb(formatId === NHRB_FORMAT_ID, `Unsupported NHRB format ID: ${formatId}`);
  assertNhrb(recordSize === NHRB_RECORD_SIZE, `Invalid NHRB record size: ${recordSize}`);
  assertNhrb(maxEpcLenBytes === NHRB_MAX_EPC_BYTES, `Invalid NHRB max EPC length: ${maxEpcLenBytes}`);

  const expectedPayloadBytes = recordCount * NHRB_RECORD_SIZE;
  assertNhrb(payloadBytes === expectedPayloadBytes, `NHRB payload size mismatch: ${payloadBytes} != ${expectedPayloadBytes}`);
  assertNhrb(file.byteLength === NHRB_HEADER_SIZE + payloadBytes, `NHRB file size mismatch: ${file.byteLength} != ${NHRB_HEADER_SIZE + payloadBytes}`);

  const payload = file.subarray(NHRB_HEADER_SIZE, NHRB_HEADER_SIZE + payloadBytes);
  const actualCrc32 = crc32(payload);
  assertNhrb(actualCrc32 === payloadCrc32, `NHRB payload CRC mismatch: ${actualCrc32} != ${payloadCrc32}`);

  const epcs: string[] = [];
  for (let recordIndex = 0; recordIndex < recordCount; recordIndex++) {
    const recordOffset = NHRB_HEADER_SIZE + (recordIndex * NHRB_RECORD_SIZE);
    const epcLen = file[recordOffset];

    assertNhrb(epcLen > 0 && epcLen <= NHRB_MAX_EPC_BYTES, `Invalid EPC length at record ${recordIndex + 1}: ${epcLen}`);

    const epcBytes = file.subarray(recordOffset + 1, recordOffset + 1 + epcLen);
    epcs.push(bytesToHex(epcBytes));
  }

  return {
    header: {
      recordCount,
      payloadBytes,
      payloadCrc32,
      timestampUnix,
      maxEpcLenBytes,
    },
    epcs,
  };
};
