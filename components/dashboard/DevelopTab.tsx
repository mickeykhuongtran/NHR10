import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Barcode, Camera, Copy, Database, Play, Square } from 'lucide-react';
import type { BrowserMultiFormatReader as BrowserMultiFormatReaderType, IScannerControls } from '@zxing/browser';
import { Button } from '../ui/Button';
import { ConnectionStatus, Tag } from '../../types';
import { PageHeader } from './PageHeader';

interface DevelopTabProps {
  activeScanType: 'interactive' | 'batch' | null;
  isBatchSaving: boolean;
  isScanning: boolean;
  onClearTags: () => void;
  onStartScan: () => void;
  onStopScan: () => void;
  status: ConnectionStatus;
  tags: Tag[];
}

type CodeScanState = 'idle' | 'starting' | 'scanning' | 'found' | 'error';

interface CodeResult {
  format: string;
  text: string;
  timestamp: number;
}

const formatRssi = (value: number | null | undefined) => (
  value === null || value === undefined || !Number.isFinite(value) ? '--' : value.toFixed(value < 0 ? 0 : 1)
);

const getSignalLevel = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  const magnitude = value < 0 ? Math.abs(value) : value;
  const clamped = Math.max(60, Math.min(110, magnitude));
  return value < 0 ? (110 - clamped) / 50 : (clamped - 60) / 50;
};

export const DevelopTab: React.FC<DevelopTabProps> = ({
  activeScanType,
  isBatchSaving,
  isScanning,
  onClearTags,
  onStartScan,
  onStopScan,
  status,
  tags,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReaderType | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const handledResultRef = useRef(false);
  const [codeState, setCodeState] = useState<CodeScanState>('idle');
  const [codeError, setCodeError] = useState('');
  const [codeResult, setCodeResult] = useState<CodeResult | null>(null);
  const [copied, setCopied] = useState(false);
  const isConnected = status === 'connected';
  const isRfidRunning = activeScanType === 'interactive';
  const isRfidBlocked = activeScanType === 'batch' || isBatchSaving || !isConnected;

  const displayedTags = useMemo(() => (
    [...tags]
      .sort((a, b) => (b.lastSeen ?? b.timestamp ?? 0) - (a.lastSeen ?? a.timestamp ?? 0))
      .slice(0, 120)
  ), [tags]);

  const stopCodeScan = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    handledResultRef.current = false;
    setCodeState((current) => current === 'starting' || current === 'scanning' ? 'idle' : current);
  };

  useEffect(() => () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  const startCodeScan = async () => {
    if (!videoRef.current || codeState === 'starting' || codeState === 'scanning') return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setCodeState('error');
      setCodeError('Camera API is not available in this browser.');
      return;
    }

    handledResultRef.current = false;
    setCopied(false);
    setCodeError('');
    setCodeState('starting');

    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = readerRef.current ?? new BrowserMultiFormatReader(undefined, {
        delayBetweenScanAttempts: 220,
        delayBetweenScanSuccess: 500,
      });
      readerRef.current = reader;

      const prefersPortraitCamera = window.matchMedia('(pointer: coarse), (max-width: 640px)').matches;

      controlsRef.current = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            aspectRatio: { ideal: prefersPortraitCamera ? 3 / 4 : 16 / 9 },
            height: { ideal: prefersPortraitCamera ? 1280 : 720 },
            width: { ideal: prefersPortraitCamera ? 720 : 1280 },
          },
        },
        videoRef.current,
        (result, error, controls) => {
          if (result && !handledResultRef.current) {
            handledResultRef.current = true;
            const text = result.getText();
            const format = String(result.getBarcodeFormat?.() ?? 'CODE');
            setCodeResult({ format, text, timestamp: Date.now() });
            setCodeState('found');
            controls.stop();
            controlsRef.current = null;
            return;
          }

          const errorName = String(error?.name ?? '');
          if (error && errorName && !errorName.includes('NotFoundException')) {
            setCodeError(error.message || errorName);
          }
        },
      );

      setCodeState('scanning');
    } catch (error: any) {
      controlsRef.current?.stop();
      controlsRef.current = null;
      setCodeState('error');
      setCodeError(error?.message || 'Could not start the camera.');
    }
  };

  const handleCopyCode = async () => {
    if (!codeResult) return;

    try {
      await navigator.clipboard?.writeText(codeResult.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 900);
    } catch (error) {
      setCopied(false);
    }
  };

  const toggleRfidScan = () => {
    if (isRfidRunning) {
      onStopScan();
      return;
    }

    onStartScan();
  };

  return (
    <div className="flex h-full max-w-full touch-pan-y flex-col gap-3 overflow-y-auto overflow-x-hidden overscroll-contain bg-transparent p-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:p-3 md:p-5">
      <PageHeader
        icon={Barcode}
        title="DEVELOP"
        subtitle="Camera code scan and compact RFID live table for field demo checks."
        meta={
          <span className="rounded-full border border-[#DDECEF] bg-white/58 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#6E7F83]">
            Camera opens on scan
          </span>
        }
      />

      <div className="grid flex-none grid-cols-1 gap-3 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(320px,0.92fr)_minmax(420px,1.08fr)]">
        <section className="soft-glass flex min-h-0 flex-col overflow-hidden rounded-lg xl:min-h-[34rem]">
          <div className="flex flex-col gap-3 border-b border-[#DDECEF]/75 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-xs font-bold uppercase tracking-wide text-[#166B78]">QR / Barcode</h2>
              <p className="mt-0.5 text-[11px] font-medium text-[#6E6E73]">Use rear camera when available.</p>
            </div>
            <div className="flex gap-2 sm:justify-end">
              {codeState === 'starting' || codeState === 'scanning' ? (
                <Button variant="danger" size="sm" className="h-9 w-full min-w-[112px] sm:w-auto" onClick={stopCodeScan}>
                  <Square size={14} fill="currentColor" /> STOP
                </Button>
              ) : (
                <Button variant="primary" size="sm" className="h-9 w-full min-w-[112px] sm:w-auto" onClick={startCodeScan}>
                  <Camera size={14} /> SCAN CODE
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-3 p-3">
            <div className="develop-camera-shell relative overflow-hidden rounded-lg border border-[#DDECEF] bg-[#1C1C1E]">
              <video
                ref={videoRef}
                className={`absolute inset-0 h-full w-full object-cover object-center ${codeState === 'starting' || codeState === 'scanning' ? 'opacity-100' : 'opacity-35'}`}
                muted
                playsInline
              />
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="develop-scan-window rounded-lg border-2 border-white/82 shadow-[0_0_0_999px_rgba(0,0,0,0.28)]" />
              </div>
              <div className="absolute left-3 top-3 rounded-full border border-white/20 bg-black/42 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                {codeState === 'starting' ? 'Starting camera' : codeState === 'scanning' ? 'Scanning' : codeState === 'found' ? 'Code found' : 'Camera idle'}
              </div>
            </div>

            <div className="rounded-lg border border-[#DDECEF] bg-white/62 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#6E7F83]">Last Code</p>
                  {codeResult ? (
                    <>
                      <p className="mt-1 break-all font-mono text-sm font-semibold text-[#1D1D1F]">{codeResult.text}</p>
                      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[#7A8E92]">
                        {codeResult.format} - {new Date(codeResult.timestamp).toLocaleTimeString()}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-xs font-medium text-[#6E6E73]">No code scanned yet.</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0"
                  onClick={handleCopyCode}
                  disabled={!codeResult}
                  title="Copy code"
                >
                  <Copy size={14} /> {copied ? 'COPIED' : 'COPY'}
                </Button>
              </div>
              {codeState === 'error' && (
                <p className="mt-2 rounded-md border border-[#FF3B30]/28 bg-[#FF3B30]/10 px-2 py-1 text-[11px] font-medium text-[#C32118]">
                  {codeError}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="soft-glass flex min-h-[34rem] flex-col overflow-hidden rounded-lg">
          <div className="flex flex-col gap-3 border-b border-[#DDECEF]/75 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-xs font-bold uppercase tracking-wide text-[#166B78]">RFID Live Scan</h2>
              <p className="mt-0.5 text-[11px] font-medium text-[#6E6E73]">Compact EPC table for quick pairing with scanned codes.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={isRfidRunning ? 'danger' : 'success'}
                size="sm"
                className={`h-9 min-w-[116px] ${!isRfidRunning ? 'bg-[#52c7da] border-[#52c7da] hover:bg-[#42b9cc]' : ''}`}
                onClick={toggleRfidScan}
                disabled={isRfidBlocked && !isRfidRunning}
                title={!isConnected ? 'Connect BLE first' : activeScanType === 'batch' ? 'Stop batch mode before live RFID scan' : undefined}
              >
                {isRfidRunning ? (
                  <><Square size={14} fill="currentColor" /> STOP RFID</>
                ) : (
                  <><Play size={14} fill="currentColor" /> SCAN RFID</>
                )}
              </Button>
              <Button variant="outline" size="sm" className="h-9" onClick={onClearTags}>
                CLEAR
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 border-b border-[#DDECEF]/75 bg-white/40">
            <div className="border-r border-[#DDECEF]/75 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6E7F83]">Visible EPC</p>
              <p className="mt-1 text-xl font-semibold text-[#1D1D1F]">{displayedTags.length}</p>
            </div>
            <div className="border-r border-[#DDECEF]/75 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6E7F83]">Mode</p>
              <p className="mt-1 text-xl font-semibold text-[#166B78]">{isRfidRunning ? 'Live' : 'Idle'}</p>
            </div>
            <div className="px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6E7F83]">BLE</p>
              <p className="mt-1 text-xl font-semibold text-[#1D1D1F]">{isConnected ? 'On' : 'Off'}</p>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-white/86 backdrop-blur-xl">
                <tr className="border-b border-[#DDECEF]/75 text-[10px] font-semibold uppercase tracking-wide text-[#52666B]">
                  <th className="w-14 px-3 py-2">#</th>
                  <th className="px-3 py-2">EPC</th>
                  <th className="w-32 px-3 py-2 text-right">Signal</th>
                  <th className="w-24 px-3 py-2 text-right">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDECEF]/75">
                {displayedTags.map((tag, index) => {
                  const rssi = tag.lastRssi ?? tag.rssi;
                  const level = getSignalLevel(rssi);

                  return (
                    <tr key={tag.epc} className="bg-white/42 transition-colors hover:bg-white/72">
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-[#7A8E92]">{index + 1}</td>
                      <td className="max-w-[24rem] px-3 py-2 font-mono text-xs font-semibold text-[#0C4F5B]">
                        <span className="block truncate" title={tag.epc}>{tag.epc}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-2 w-14 overflow-hidden rounded-full bg-[#EAFBFD] ring-1 ring-[#52c7da]/30">
                            <div className="h-full rounded-full bg-[#52c7da]" style={{ width: `${Math.max(6, level * 100)}%` }} />
                          </div>
                          <span className="w-10 text-right font-mono text-xs font-semibold text-[#166B78]">{formatRssi(rssi)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-[#1D1D1F]">{tag.count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {displayedTags.length === 0 && (
              <div className="flex h-full min-h-[18rem] flex-col items-center justify-center gap-2 text-[#7A8E92]">
                <Database size={32} strokeWidth={1.2} />
                <p className="font-mono text-xs">{isConnected ? 'No EPC detected' : 'Connect BLE to scan RFID'}</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
