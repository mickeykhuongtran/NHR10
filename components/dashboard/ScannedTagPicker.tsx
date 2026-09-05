import React, { useMemo, useState } from 'react';
import { Tag } from '../../types';
import { Input } from '../ui/Input';

interface ScannedTagPickerProps {
  tags: Tag[];
  selectedEpc: string;
  onSelect: (epc: string) => void;
  onOpenScanner: () => void;
}

export function ScannedTagPicker({ tags, selectedEpc, onSelect, onOpenScanner }: ScannedTagPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const matches = useMemo(() => {
    const query = search.replace(/\s/g, '').toUpperCase();
    return tags.filter(tag => tag.epc.toUpperCase().includes(query));
  }, [tags, search]);

  return <div className="rounded-lg border border-slate-200">
    <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-blue-700" aria-expanded={open} aria-controls="write-scanned-tags" onClick={() => setOpen(!open)}>
      <span>{open ? 'Hide scanned tags' : 'Choose from scanned tags'}</span><span className="shrink-0 text-xs font-normal text-slate-500">{tags.length} tags</span>
    </button>
    {open && <div id="write-scanned-tags" className="space-y-3 border-t border-slate-100 p-4">
      <p className="text-xs leading-5 text-slate-500">Results from Scan tags. Select one EPC as the write target. These are previous readings, not a check that the tag is still nearby.</p>
      {tags.length > 0 ? <>
        <Input type="search" label="Filter scanned EPCs" placeholder="Search any part of an EPC" value={search} onChange={e => setSearch(e.target.value)} />
        <fieldset className="max-h-64 overflow-y-auto rounded-md border border-slate-200" aria-label="Scanned write targets">
          {matches.slice(0, 100).map(tag => <label key={tag.epc} className={`flex cursor-pointer items-start gap-3 border-b border-slate-100 px-3 py-3 last:border-0 ${selectedEpc === tag.epc ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
            <input type="radio" name="write-target" value={tag.epc} checked={selectedEpc === tag.epc} onChange={() => onSelect(tag.epc)} className="mt-1 shrink-0" />
            <span className="min-w-0"><span className="block break-all font-mono text-xs text-slate-800">{tag.epc}</span><span className="mt-1 block text-xs text-slate-500">{tag.count} reads{tag.lastRssi != null || tag.rssi != null ? ` · Last signal ${tag.lastRssi ?? tag.rssi}${(tag.lastRssi ?? tag.rssi)! < 0 ? ' dBm' : ' reader units'}` : ''}</span></span>
          </label>)}
          {matches.length === 0 && <p className="p-4 text-sm text-slate-500">No EPC matches this filter.</p>}
        </fieldset>
        {matches.length > 100 && <p className="text-xs text-slate-500">Showing 100 of {matches.length} matches. Filter by EPC to narrow the list.</p>}
      </> : <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-500"><p>No scanned tags yet. Run a scan, stop it, then return here to choose a target.</p><button type="button" className="text-action mt-2 !px-0" onClick={onOpenScanner}>Go to Scan tags →</button></div>}
    </div>}
  </div>;
}
