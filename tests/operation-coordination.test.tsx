import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../App';

let captured: any;
const mocks = vi.hoisted(() => ({
  stopScan: vi.fn(), startScan: vi.fn(), stopLocate: vi.fn(), resetLocate: vi.fn(), addLog: vi.fn(),
  scan: { isScanning: false, activeScanType: null, stopScan: vi.fn(), resetScanSession: vi.fn() },
  connection: { status: 'connected', logs: [], settings: {}, addLog: vi.fn(), setInventoryActive: vi.fn() },
  ble: { setCallbacks: vi.fn(), writeEpc: vi.fn() },
}));
vi.mock('../components/dashboard/DashboardLayout', () => ({ DashboardLayout: (props: any) => { captured = props; return <div />; } }));
vi.mock('../services/bleService', () => ({ bleService: mocks.ble }));
vi.mock('../hooks/useRFIDConnection', () => ({ useRFIDConnection: () => ({ ...mocks.connection, addLog: mocks.addLog }) }));
vi.mock('../hooks/useScanLogic', () => ({ useScanLogic: () => ({ ...mocks.scan, stopScan: mocks.stopScan, startScan: mocks.startScan }) }));
vi.mock('../hooks/useLocateLogic', () => ({ useLocateLogic: () => ({ isLocating: false, stopLocate: mocks.stopLocate, resetLocateState: mocks.resetLocate }) }));
vi.mock('../hooks/useFileTransfer', () => ({ useFileTransfer: () => ({ transferStatus: 'idle' }) }));
let root: Root;
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  mocks.stopScan.mockResolvedValue(undefined); mocks.startScan.mockResolvedValue(undefined); mocks.ble.writeEpc.mockResolvedValue(undefined);
  root = createRoot(document.createElement('div'));
  act(() => root.render(<App />));
});
afterEach(() => { act(() => root.unmount()); vi.useRealTimers(); });

it('finishes a scan stop without sending an extra locate stop command', async () => {
  await act(async () => captured.onStopScan());
  expect(mocks.stopScan).toHaveBeenCalledOnce();
  expect(mocks.stopLocate).not.toHaveBeenCalled();
  expect(mocks.resetLocate).toHaveBeenCalledOnce();
});

it('blocks a new scan until the stop command sequence has finished', async () => {
  let finish!: () => void;
  mocks.stopScan.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  let stop!: Promise<void>;
  act(() => { stop = captured.onStopScan(); });
  expect(captured.commandPending).toBe(true);
  await act(async () => captured.onStartScan());
  expect(mocks.startScan).not.toHaveBeenCalled();
  await act(async () => { finish(); await stop; });
  expect(captured.commandPending).toBe(false);
  await act(async () => captured.onStartScan());
  expect(mocks.startScan).toHaveBeenCalledOnce();
});

it('does not leave a write pending indefinitely without a firmware response', async () => {
  await act(async () => captured.onWriteEpc('', 'E20000112233445566778899'));
  expect(captured.writeStatus).toBe('pending');
  act(() => vi.advanceTimersByTime(10000));
  expect(captured.writeStatus).toBe('error');
  expect(captured.writeMessage).toContain('verify');
});
