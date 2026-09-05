import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DashboardLayout } from '../components/dashboard/DashboardLayout';
import { OperationsTab } from '../components/dashboard/OperationsTab';

vi.mock('react-virtualized-auto-sizer', () => ({ default: ({ children }: any) => children({ height: 300, width: 900 }) }));
vi.mock('../services/bleService', () => ({ bleService: { getSettings: vi.fn() } }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => { container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const render = (node: React.ReactNode) => act(() => root.render(node));
const buttons = () => [...container.querySelectorAll('button')];
const button = (label: string) => {
  const found = buttons().find(b => b.textContent?.trim() === label);
  if (!found) throw new Error(`Button not found: ${label}`);
  return found;
};
const click = (label: string) => act(() => button(label).click());
const input = (label: string) => {
  const found = [...container.querySelectorAll('label')].find(l => l.textContent === label);
  return container.querySelector<HTMLInputElement>(`#${CSS.escape(found!.htmlFor)}`)!;
};
const fill = (element: HTMLInputElement, value: string) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
});
const fixture = (): React.ComponentProps<typeof DashboardLayout> => ({
  commandPending: false,
  status: 'disconnected', settings: {
    power: 20, buzzer: true, tagFocus: true, fastTid: false, linkProfile: 53, qValue: 4, session: 1,
    scanParams: { interval: 30, dwell: 2, count: 0 }, version: 'test', temperature: 24,
    batterySnapshot: null, deviceInfo: '', deviceName: '', deviceCanonicalId: '',
  },
  tags: [], logs: [], scanStats: { visibleTags: 0, totalReads: 0, readsPerSecond: 0, uniquePerSecond: 0, averageRssi: null, peakRssi: null },
  isScanning: false, scanStartedAt: null, scanStoppedAt: null, removeStaleTags: false, staleRemoveMs: 3000,
  onChangeRemoveStaleTags: vi.fn(), onChangeStaleRemoveMs: vi.fn(), onConnect: vi.fn(), onDisconnect: vi.fn(),
  activeScanType: null, onStartScan: vi.fn(), onStopScan: vi.fn(), onStartBatch: vi.fn(), onStopBatch: vi.fn(), onClearTags: vi.fn(),
  onLocate: vi.fn(), onStopLocate: vi.fn(), targetRssi: null, isLocating: false,
  onWriteEpc: vi.fn(), onWriteData: vi.fn(), writeStatus: 'idle', writeMessage: '',
  onUpdateSettings: vi.fn(), onSaveSetting: vi.fn(), onFetchHistory: vi.fn(), onDownloadJson: vi.fn(), onDownloadCsv: vi.fn(),
  onDownloadTxt: vi.fn(), onShare: vi.fn(), onClearFileData: vi.fn(), historyData: [], isBatchSaving: false,
  batchSaveInfo: { state: 'idle', progress: 0, written: 0, total: 0 }, onDownloadLogs: vi.fn(), onClearLogs: vi.fn(),
  isFileTransferring: false, transferProgress: 0, transferStatus: 'idle', onApplyPreset: vi.fn(), onSaveConfig: vi.fn(), onShowPopup: vi.fn(),
});

it('starts with the guided scan workflow and keeps engineering tools collapsed', () => {
  render(<DashboardLayout {...fixture()} />);
  expect(container.querySelector('h1')?.textContent).toBe('Scan tags');
  expect(button('Start scan').disabled).toBe(true);
  expect(container.querySelector('#scan-guide')).not.toBeNull();
  expect(container.textContent).not.toContain('Develop');
  expect(buttons().some(b => b.textContent === 'Diagnostics')).toBe(false);
  click('Advanced');
  click('Diagnostics');
  expect(container.querySelector('h1')?.textContent).toBe('Diagnostics');
});

it('carries a scanned EPC directly into the find workflow', async () => {
  const props = fixture(); props.status = 'connected';
  props.tags = [{ epc: 'E20000112233445566778899', timestamp: 100, count: 4, rssi: -67 }];
  render(<DashboardLayout {...props} />);
  click('Find tag');
  expect(input('Target EPC').value).toBe(props.tags[0].epc);
  await act(async () => button('Start finding').click());
  expect(props.onLocate).toHaveBeenCalledWith(props.tags[0].epc);
});

it('keeps a stop action available across tabs and blocks conflicting commands', () => {
  const props = fixture(); props.status = 'connected'; props.isScanning = true; props.activeScanType = 'interactive';
  render(<DashboardLayout {...props} />);
  act(() => buttons().find(b => b.textContent?.includes('Find a tag'))!.click());
  fill(input('Target EPC'), 'E20000112233445566778899');
  expect(button('Start finding').disabled).toBe(true);
  click('Stop scan'); expect(props.onStopScan).toHaveBeenCalledOnce();
  click('Advanced'); click('Device settings');
  expect(container.querySelector('fieldset')?.disabled).toBe(true);
});

it('requires valid EPC data and explicit confirmation before writing', () => {
  const props = { isConnected: true, isBusy: false, onWriteEpc: vi.fn(), onWriteData: vi.fn(), writeStatus: 'idle' as const, writeMessage: '' };
  render(<OperationsTab {...props} />);
  fill(input('New EPC (hexadecimal)'), 'ZZZZ');
  expect(button('Review & write EPC').disabled).toBe(true);
  fill(input('New EPC (hexadecimal)'), 'E20000112233445566778899');
  click('Review & write EPC');
  expect(container.querySelector('dialog')?.open).toBe(true);
  expect(props.onWriteEpc).not.toHaveBeenCalled();
  click('Confirm write');
  expect(props.onWriteEpc).toHaveBeenCalledWith('', 'E20000112233445566778899', undefined);
});

it('filters retained diagnostic logs without changing the exported report', () => {
  const props = fixture(); props.logs = [{ type: 'rx', timestamp: 1, message: 'Battery sample' }, { type: 'error', timestamp: 2, message: 'TX failed' }];
  render(<DashboardLayout {...props} />); click('Advanced'); click('Diagnostics');
  const filter = container.querySelector<HTMLSelectElement>('[aria-label="Filter log events"]')!;
  act(() => { filter.value = 'error'; filter.dispatchEvent(new Event('change', { bubbles: true })); });
  const logView = container.querySelector('[aria-label="Device communication events"]');
  expect(logView?.textContent).toContain('TX failed'); expect(logView?.textContent).not.toContain('Battery sample');
  click('Export service report'); expect(props.onDownloadLogs).toHaveBeenCalledOnce();
});

it('prevents a download while the reader is saving a batch', () => {
  const props = fixture(); props.status = 'connected'; props.isBatchSaving = true;
  render(<DashboardLayout {...props} />);
  act(() => buttons().find(b => b.textContent?.includes('Saved data'))!.click());
  expect(button('Get saved data').disabled).toBe(true);
  expect(props.onFetchHistory).not.toHaveBeenCalled();
});
