import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { PageHeader } from './PageHeader';
import { Tag } from '../../types';

interface LocateTabProps {
  isConnected: boolean;
  isBusy: boolean;
  tags: Tag[];
  onLocate: (epc: string) => void;
  onStopLocate: () => void;
  targetRssi: number | null;
  isLocating: boolean;
  targetEpc: string;
  setTargetEpc: (epc: string) => void;
}

export const LocateTab: React.FC<LocateTabProps> = ({ isConnected, isBusy, tags, onLocate, onStopLocate, targetRssi, isLocating, targetEpc, setTargetEpc }) => {
  const [pending, setPending] = useState(false);
  const valid = /^[0-9a-f]+$/i.test(targetEpc) && targetEpc.length % 4 === 0;
  const level = targetRssi === null ? 0 : Math.max(0, Math.min(100, targetRssi < 0 ? (110 - Math.abs(targetRssi)) * 2 : (targetRssi - 60) * 2));
  const run = async () => {
    if (pending) return;
    setPending(true);
    try { await (isLocating ? onStopLocate() : onLocate(targetEpc)); } finally { setPending(false); }
  };
  return <div className="page-content">
    <PageHeader title="Find a tag" subtitle="Choose an EPC, then follow the signal to find your item." meta={<span className={`status-pill ${isLocating ? 'online' : ''}`}><span className="status-dot" />{isLocating ? 'Finding' : 'Ready'}</span>} />
    <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="eyebrow">01 · Select a tag</p>
        <div className="mt-5">
          <Input label="Target EPC" list="scanned-epcs" placeholder="Enter or select a scanned EPC" value={targetEpc} onChange={e => setTargetEpc(e.target.value.replace(/\s/g, '').toUpperCase())} disabled={isLocating} className="font-mono" error={targetEpc && !valid ? 'Use hexadecimal characters in complete 16-bit words (4 characters).' : undefined} />
          <datalist id="scanned-epcs">{tags.map(tag => <option key={tag.epc} value={tag.epc} />)}</datalist>
          <p className="mt-3 text-sm leading-6 text-slate-500">Use Find tag from scan results to fill this field automatically.</p>
        </div>
        <Button fullWidth className="mt-5" variant={isLocating ? 'danger' : 'primary'} onClick={() => void run()} disabled={!isConnected || pending || (!isLocating && (!valid || isBusy))}>{isLocating ? 'Stop finding' : 'Start finding'}</Button>
        {!isConnected && <p className="mt-3 text-sm text-slate-500">Connect your reader to begin.</p>}
        {isBusy && !isLocating && <p className="mt-3 text-sm text-amber-700">Stop the active scan or finish the transfer first.</p>}
      </section>
      <section className="flex min-h-[360px] flex-col rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <p className="eyebrow">02 · Follow the signal</p>
        <div className="my-auto py-8 text-center">
          <p className="text-sm text-slate-500">{isLocating ? targetRssi === null ? 'Waiting for the target tag' : 'Tag detected' : 'Signal strength'}</p>
          <p className="mt-3 text-6xl font-semibold tracking-tight tabular-nums text-slate-900">{isLocating && targetRssi !== null ? targetRssi : '—'}<span className="ml-2 text-base font-normal text-slate-400">{targetRssi !== null && targetRssi < 0 ? 'dBm' : 'reader units'}</span></p>
          <div className="mx-auto mt-8 max-w-lg">
            <div className="flex justify-between text-xs text-slate-400"><span>Weaker</span><span>Stronger</span></div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100" role="meter" aria-label="Relative target signal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={isLocating ? level : 0}>
              <div className="h-full rounded-full bg-blue-600 transition-[width] duration-200" style={{ width: `${isLocating ? level : 0}%` }} />
            </div>
          </div>
        </div>
        <p className="mx-auto max-w-lg text-center text-sm leading-6 text-slate-500">Move slowly and sweep the antenna. A stronger signal can help guide you; tag orientation and reflections also affect the reading.</p>
      </section>
    </div>
  </div>;
};
