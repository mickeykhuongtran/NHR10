# Nextwaves NHR-10 RFID Bluetooth Integration Manual

I’m sharing this guide to help developers understand how to operate the current web app and integrate its RFID Bluetooth control logic into other apps or platforms.

The goal is to make the repository easy to reuse: keep the stable device-control flow, separate it from the current UI, and rebuild it safely for web, mobile, desktop, or native BLE applications.

## 1. System Scope

The current web app handles 6 main functional areas:

| Area | Purpose | Main modules |
|---|---|---|
| Device connection | Scan BLE, connect GATT, discover services/characteristics, handle disconnect | `services/bleService.ts`, `hooks/useRFIDConnection.ts` |
| Realtime tag reading | Start/stop inventory, receive `live_tags`, calculate count/RSSI/statistics | `hooks/useScanLogic.ts` |
| Batch inventory | Start/stop batch mode, wait for device-side saving, fetch EPC history | `hooks/useScanLogic.ts`, `hooks/useFileTransfer.ts` |
| Tag locating | Locate one target EPC using RSSI feedback | `hooks/useLocateLogic.ts` |
| Tag writing | Write EPC or another memory bank | `App.tsx`, `services/bleService.ts` |
| Reader configuration | Power, RF link profile, Q/session, query timing, Tag Focus, save config | `App.tsx`, `components/dashboard/SettingsTab.tsx` |

The current UI is in `components/`. Device-control logic is mainly in `services/`, `hooks/`, `utils/`, and `types.ts`.

## 2. Running The Current Web App

Requirements:

- Node.js LTS.
- A browser that supports Web Bluetooth.
- `localhost` during development, or HTTPS in production.
- The user must press the Connect button directly. Web Bluetooth requires a user gesture before opening the device picker.

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
npm run preview
```

TypeScript check:

```bash
npm run lint
```

## 3. Current App Operation Manual

### 3.1 Connecting The Reader

1. Open the web app.
2. Press `Connect`.
3. The browser opens the Bluetooth device picker.
4. Select a device whose advertised name starts with `NHR-10` or `Nextwaves`.
5. The app connects to the GATT server, gets service `FF`, and discovers characteristics `FF01`, `FF02`, and `FF03`.
6. The app starts notifications on `FF01`.
7. The app reads the initial reader state: device info, firmware, battery, power, link profile, Q/session, query params, Tag Focus, and temperature.

After connection, the app starts a heartbeat loop to verify that the device is still online. If the app is idle and battery updates stop, or if scanning is active but `FF01` traffic stops, the app marks the device as disconnected so the UI does not show stale state.

### 3.2 Scanner Tab

The Scanner tab is used for realtime inventory and batch mode.

Interactive scan:

1. Press `START SCAN`.
2. The app clears the previous tag list.
3. The app sends `{ "cmd": "S" }` through `FF01`.
4. The reader starts inventory.
5. The reader sends `live_tags` notifications through `FF01`.
6. The app merges tags by EPC and updates count, RSSI, first seen, and last seen.
7. The UI renders the tag list with throttling to stay smooth at high tag rates.
8. Press `STOP SCAN`; the app sends `{ "cmd": "X" }` in a short repeated burst to improve reliability in noisy BLE environments.

Batch mode:

1. Press `BATCH MODE`.
2. The app sends `{ "cmd": "SB" }`.
3. The reader performs inventory and stores data internally.
4. Press `STOP BATCH`; the app sends `{ "cmd": "XB" }`.
5. If the reader returns `saving` or `busy`, the app waits until device-side saving is complete.
6. Batch data is downloaded from the Storage tab using the `FF02`/`FF03` file-transfer flow.

Scanner presets:

| Preset | Meaning |
|---|---|
| `STANDARD` | Balanced inventory scanning for normal or dense tag populations |
| `QUICK` | Faster scanning for fewer tags or quick tracking |
| `DEEP` | Prioritizes read range for longer-distance tag search |

Presets currently send baseband configuration and Tag Focus commands over BLE.

### 3.3 Locate Tab

Locate mode is used to find one specific EPC:

1. Enter the target EPC.
2. Start locate mode.
3. The app sends `{ "cmd": "F", "val": "<EPC>" }`.
4. The reader returns `{ "cmd": "F", "epc": "...", "rssi": -xx }`.
5. The app displays RSSI as locate signal strength.
6. When stopped, the app sends `{ "cmd": "X" }`.

Locate should not run at the same time as Interactive Scan or Batch Mode. The current app uses a single operation mode to avoid mixing data between workflows.

### 3.4 Encode Tab

The Encode tab writes tag data:

- Quick EPC write sends command `WE`.
- Advanced memory write sends command `WD`.

General flow:

1. Enter the target EPC and/or the new data.
2. Enter an access password if required by the tag. Default password is `00000000`.
3. The app sends the write command through `FF01`.
4. The reader returns a `WE` or `WD` response.
5. If `status = ok`, the app reports success. If a `code` or error state is returned, the app reports failure.

When integrating into another platform, validate hex strings before sending. For EPC memory bank writes, data length should be a multiple of 4 hex characters to match word boundaries.

### 3.5 Storage Tab

The Storage tab downloads batch data stored in the reader:

1. Press fetch history.
2. The app starts notifications on `FF03`.
3. The app writes the string `send_file` to `FF02`.
4. The reader sends START, DATA, and EOF frames through `FF03`.
5. The app reassembles chunks by sequence number.
6. The app verifies chunk count and file size.
7. The app parses the NHRB file with `utils/nhrbParser.ts`.
8. The app displays the EPC list and supports JSON/CSV/TXT export and file sharing.

If the reader is still saving batch data, the app receives a busy response and retries up to 8 times, with a 1200 ms delay between attempts.

### 3.6 Settings Tab

The Settings tab reads and writes reader configuration:

| Setting | Read command | Set command | Notes |
|---|---|---|---|
| RF output power | `GP` | `SP` | dBm value |
| RF link profile | `GLP` | `SLP` | Example profiles: 11/13/53 |
| Q/session | `GQS` | `SQS` | EPC Gen2 singulation parameters |
| Query timing | `GQP` | `SQP` | interval, dwell, append |
| Tag Focus | `GTF` | `TF`, `STF` | `TF` sets runtime value, `STF` saves it |
| Device popup | - | `POPUP` | Tests display on the reader |
| Save config | - | `SAVE` | Saves configuration to flash |

## 4. Code Architecture

```text
.
├── App.tsx
├── services/
│   └── bleService.ts
├── hooks/
│   ├── useRFIDConnection.ts
│   ├── useScanLogic.ts
│   ├── useLocateLogic.ts
│   └── useFileTransfer.ts
├── utils/
│   └── nhrbParser.ts
├── components/
│   └── dashboard/
└── types.ts
```

Module roles:

- `services/bleService.ts`: BLE transport/protocol layer. It owns UUIDs, characteristics, connection flow, command sending, and notification parsing.
- `hooks/useRFIDConnection.ts`: connected/disconnected state, settings, battery heartbeat, telemetry.
- `hooks/useScanLogic.ts`: interactive scan, batch scan, live tag map, statistics, stop burst.
- `hooks/useLocateLogic.ts`: locate state and RSSI response handling.
- `hooks/useFileTransfer.ts`: file request, transfer progress, busy retry, NHRB parsing.
- `utils/nhrbParser.ts`: batch file parser, independent from React.
- `App.tsx`: connects `bleService` callbacks to hooks and protects operation mode routing.
- `components/`: current UI. This can be replaced completely in another app.

## 5. BLE Service And Characteristics

The device uses a custom BLE service:

| Component | UUID | Role |
|---|---|---|
| Service | `000000ff-0000-1000-8000-00805f9b34fb` | Main service |
| `FF01` | `0000ff01-0000-1000-8000-00805f9b34fb` | Send JSON commands, receive responses and live tag notifications |
| `FF02` | `0000ff02-0000-1000-8000-00805f9b34fb` | Request batch file by writing `send_file` |
| `FF03` | `0000ff03-0000-1000-8000-00805f9b34fb` | Receive batch file notifications |

Device selector:

- Prefer `namePrefix: "NHR-10"` or `namePrefix: "Nextwaves"`.
- Always pass `optionalServices: [SERVICE_UUID]`.
- If a runtime cannot parse the filters, fallback to `acceptAllDevices: true`, but still pass `optionalServices`.

## 6. Operation State Machine

The app should always have one active operation mode:

```ts
type InventoryMode = 'idle' | 'interactive' | 'batch' | 'batchSaving' | 'locate';
```

Meaning:

| Mode | Reader activity | App accepts |
|---|---|---|
| `idle` | No inventory | Settings, battery, temperature |
| `interactive` | Realtime scan | `live_tags`, battery heartbeat |
| `batch` | Device-side batch inventory | Status, slower battery heartbeat |
| `batchSaving` | Reader is saving batch data | Avoid dense polling, wait for save completion |
| `locate` | Target EPC search | `F` response with RSSI |

Important rules:

- Stop or suspend the old mode before starting a new one.
- Do not process `live_tags` unless mode is `interactive`.
- Do not process `F` responses unless mode is `locate`.
- On disconnect, reset scan state, locate state, and batch saving state.
- Do not fetch history while batch saving is active.

## 7. Data Flow

```mermaid
flowchart TD
  User["User action"]
  UI["UI tab"]
  App["App.tsx"]
  Conn["useRFIDConnection"]
  Scan["useScanLogic"]
  Locate["useLocateLogic"]
  File["useFileTransfer"]
  BLE["bleService"]
  Parser["nhrbParser"]
  Device["NHR-10 reader"]

  User --> UI
  UI --> App
  App --> Conn
  App --> Scan
  App --> Locate
  App --> File
  Conn --> BLE
  Scan --> BLE
  Locate --> BLE
  File --> BLE
  BLE <--> Device
  BLE --> App
  App --> Conn
  App --> Scan
  App --> Locate
  BLE --> File
  File --> Parser
```

`bleService.setCallbacks()` is the key integration point:

```ts
bleService.setCallbacks(
  handleDataReceived,
  addLog,
  handleFileCallback
);
```

`handleDataReceived` in `App.tsx` routes data:

- Settings/system responses always go to connection logic.
- `live_tags` only goes to scan logic while scanning is active.
- `F` responses only go to locate logic while locate is active.
- `WE`/`WD` responses update write status.
- `SAVE`/`XB` batch save responses update saving state.

## 8. Command Protocol

All main control commands are sent through `FF01` as UTF-8 JSON:

```ts
await bleService.sendCommand({ cmd: 'S' });
```

`sendCommand()` protects BLE GATT with two mechanisms:

- Command queue: only one command write runs at a time.
- Write gap: command writes are spaced by about 85 ms.

Keep both mechanisms when porting to another platform. In real BLE operation, writing too quickly can cause GATT errors, dropped commands, or firmware-side processing overload.

Main commands:

| Command | Purpose |
|---|---|
| `DI` | Read device info/name |
| `GRI` | Read firmware/info |
| `GB` | Read battery |
| `GT` | Read temperature |
| `GP` / `SP` | Get/set RF power |
| `GLP` / `SLP` | Get/set link profile |
| `GQS` / `SQS` | Get/set Q and session |
| `GQP` / `SQP` | Get/set query timing |
| `GTF` / `TF` / `STF` | Get/set/save Tag Focus |
| `S` / `X` | Start/stop interactive scan |
| `SB` / `XB` | Start/stop batch scan |
| `F` | Locate EPC |
| `WE` | Write EPC |
| `WD` | Write memory bank |
| `POPUP` | Show popup on reader |
| `SAVE` | Save configuration |

## 9. Notification Protocol

### 9.1 JSON Response

If an `FF01` notification starts with byte `{` (`0x7B`), the app decodes it as UTF-8 and parses JSON.

Example:

```json
{ "cmd": "GB", "voltage": 3.9, "state": "normal" }
```

### 9.2 Binary live_tags

If a notification starts with `NH`, the app parses a binary live tag frame:

```text
byte 0..1  : "NH"
byte 2     : version = 1
byte 3     : type = 1
byte 4..7  : seq uint32 little-endian
byte 8     : itemCount
items      : epcLen + epcBytes + rssi int8 + countDelta uint16 LE + totalCount uint32 LE
```

After parsing, the app normalizes it to the same logical payload:

```ts
{
  cmd: 'live_tags',
  seq: number,
  d: [
    [epcHex, rssi, countDelta, totalCount]
  ]
}
```

`bleService` batches multiple live tag frames and flushes every 100 ms so the UI remains smooth at high tag rates.

## 10. Batch File NHRB

The batch file is downloaded through `FF03` after the app writes `send_file` to `FF02`.

Frames on `FF03`:

| Header | Meaning |
|---|---|
| `0xFFFF` | START frame, payload is JSON metadata |
| sequence number | DATA frame |
| `0xFFFE` | EOF frame |
| Unframed JSON | Busy/error response |

START metadata:

```json
{
  "cmd": "START",
  "format": "NHRB",
  "version": 1,
  "size": 1234,
  "chunks": 10
}
```

NHRB file format:

| Offset | Field |
|---|---|
| 0..3 | Magic `NHRB` |
| 4 | Version `1` |
| 5 | Header length `32` |
| 6 | Format ID `1` |
| 7 | Record size `17` |
| 8..11 | Record count, uint32 LE |
| 12..15 | Payload bytes, uint32 LE |
| 16..19 | Payload CRC32, uint32 LE |
| 20..23 | Unix timestamp, uint32 LE |
| 24 | Max EPC length, currently `16` bytes |

Each record:

```text
byte 0      : epcLen
byte 1..16  : EPC bytes
```

The parser must verify magic, version, size, and CRC32 before exposing EPC data to the app.

## 11. Integrating Into Another Platform

When porting to another platform, separate the system into 3 layers:

| Layer | Responsibility | Reuse strategy |
|---|---|---|
| UI/Application | Screens, buttons, tables, navigation, forms | Replace for the new app |
| RFID controller | State machine, scan/locate/batch/write flow, callback routing | Reuse `hooks/` or rebuild the same logic |
| BLE transport | Connect, discover service, write command, subscribe notifications | Web uses `bleService`; native platforms need an equivalent adapter |

Minimum interface to keep across platforms:

```ts
interface RFIDTransport {
  connect(): Promise<void>;
  disconnect(): void;
  sendCommand(command: object): Promise<void>;
  requestFileTransfer(): Promise<void>;
  onDataReceived(callback: (data: unknown) => void): void;
  onFileTransfer(callback: (event: string, data?: unknown) => void): void;
  onLog(callback: (message: string, type: 'info' | 'error' | 'rx' | 'tx') => void): void;
}
```

Recommended porting flow:

1. Keep the command set and UUIDs unchanged.
2. Implement a BLE transport for the target platform.
3. Port the `idle/interactive/batch/batchSaving/locate` state machine.
4. Port JSON parsing, binary `live_tags` parsing, and NHRB parsing.
5. Port heartbeat logic according to the platform’s BLE behavior.
6. Build a new UI that calls these actions: connect, start scan, stop scan, start batch, stop batch, fetch history, locate, write, settings.
7. Test each flow independently before combining them into the full UI.

## 12. Platform Guidance

| Platform | Recommended integration approach |
|---|---|
| Desktop web | Use Web Bluetooth directly if the browser supports it, served via HTTPS/localhost |
| Android web | Use Web Bluetooth on a supported browser; connect still needs a user gesture |
| Android WebView | Check `navigator.bluetooth`; if unavailable or unstable, use a native BLE bridge |
| Native Android | Implement BLE with Android Bluetooth APIs; keep the same JSON commands and parsers |
| iOS/iPadOS | Use native CoreBluetooth or a native bridge for WebView; do not depend on PWA Web Bluetooth directly |
| Windows native | Implement BLE with WinRT/Bluetooth APIs or a desktop framework BLE plugin |
| macOS native | Implement BLE with CoreBluetooth or a desktop framework BLE plugin |
| Desktop wrapper | Use web transport if the embedded Chromium runtime supports Web Bluetooth reliably; otherwise use a native bridge |

The key point: the new app does not have to use Web Bluetooth. As long as it keeps the protocol, UUIDs, command queue, state machine, and data parsers, it can reproduce the same behavior over native BLE.

## 13. Integration Checklist

- If using Web Bluetooth, connect must be triggered by a user action.
- Always include the custom service UUID in `optionalServices`.
- Do not send parallel commands on the same characteristic.
- Keep a small delay between command writes.
- Do not run `interactive`, `batch`, and `locate` at the same time.
- Suspend live tags when stopping scan, starting batch, locating, or disconnecting.
- When stopping scan/batch, wait for response or use stop retry like the current web app.
- Do not fetch batch files while the reader is still `saving` or `busy`.
- When receiving batch files, verify chunks, size, and CRC.
- Log TX/RX during bring-up to compare app behavior with firmware behavior.
- For native bridges, expose an API shaped like `bleService` so upper-level app logic stays platform-independent.

## 14. Notes When Reusing This Source Code

- `bleService` is currently a singleton. If the new app must connect to multiple readers at the same time, refactor it into multiple instances.
- `App.tsx` protects operation mode and routes callback data. Do not copy `useScanLogic` alone while dropping the callback guard.
- `SettingsTab` currently has some buttons that call `bleService` directly. In a new app, settings commands can be moved into a dedicated controller for easier maintenance.
- `utils/nhrbParser.ts` is independent and should be kept nearly unchanged when porting.
- BLE logic is optimized for one NHR-10/Nextwaves reader. If firmware changes commands or binary frames, update `bleService` first, then update UI logic.

## 15. Platform References

- [MDN: Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)
- [Chrome Developers: Communicating with Bluetooth devices over JavaScript](https://developer.chrome.com/docs/capabilities/bluetooth)
- [Google Chrome Help: Connect a website to a Bluetooth device](https://support.google.com/chrome/answer/6362090)
- [WebKit Bug 238049: Add Support for Web Bluetooth in iOS WebKit](https://bugs.webkit.org/show_bug.cgi?id=238049)
