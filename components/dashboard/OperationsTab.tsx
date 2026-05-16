import React, { useState } from 'react';
import { PenTool, Database, ArrowRight, Save, Lock } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface OperationsTabProps {
  onWriteEpc: (targetEpc: string, newEpc: string, password?: string) => void;
  onWriteData: (epc: string, mem: number, ptr: number, data: string, password?: string) => void;
  writeStatus: 'idle' | 'pending' | 'success' | 'error';
  writeMessage: string;
}

export const OperationsTab: React.FC<OperationsTabProps> = ({ onWriteEpc, onWriteData, writeStatus, writeMessage }) => {
  const [quickEpc, setQuickEpc] = useState('');
  const [quickPwd, setQuickPwd] = useState('');

  const [advEpc, setAdvEpc] = useState('');
  const [memBank, setMemBank] = useState(1); // Default EPC
  const [ptr, setPtr] = useState(2); // Default Pointer
  const [hexData, setHexData] = useState('');
  const [advPwd, setAdvPwd] = useState('');

  const handleQuickWrite = () => {
    onWriteEpc('', quickEpc, quickPwd);
  };

  const handleAdvWrite = () => {
    if (memBank === 1) {
      onWriteEpc(advEpc, hexData, advPwd);
    } else {
      onWriteData(advEpc, memBank, ptr, hexData, advPwd);
    }
  };

  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-y-auto bg-slate-950">
      
      {/* Quick Write EPC */}
      <div className="bg-slate-900 rounded-sm border border-slate-800 p-4 space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
          <div className="bg-cyan-950/30 p-1.5 rounded-sm text-cyan-500 border border-cyan-900/50">
            <PenTool size={16} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-200 tracking-tight">QUICK WRITE EPC</h2>
            <p className="text-[10px] text-slate-600 font-mono uppercase tracking-wider">Update EPC Memory Bank (Bank 1)</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">New EPC (Hex)</label>
            <Input 
              value={quickEpc} 
              onChange={(e) => setQuickEpc(e.target.value.toUpperCase())} 
              placeholder="E200..." 
              className="font-mono tracking-wider h-8"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Access Password (Optional)</label>
            <div className="relative">
              <Lock size={14} className="absolute left-2.5 top-2 text-slate-600" />
              <Input 
                value={quickPwd} 
                onChange={(e) => setQuickPwd(e.target.value.toUpperCase())} 
                placeholder="00000000" 
                className="pl-8 font-mono tracking-wider h-8"
                maxLength={8}
              />
            </div>
          </div>
        </div>

        <Button 
          fullWidth 
          size="md" 
          onClick={handleQuickWrite} 
          disabled={writeStatus === 'pending' || !quickEpc}
          variant="primary"
          className="h-8"
        >
          {writeStatus === 'pending' ? 'WRITING...' : 'WRITE NEW EPC'}
        </Button>
      </div>

      {/* Advanced Write Data */}
      <div className="bg-slate-900 rounded-sm border border-slate-800 p-4 space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
          <div className="bg-purple-950/30 p-1.5 rounded-sm text-purple-400 border border-purple-900/50">
            <Database size={16} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-200 tracking-tight">ADVANCED MEMORY WRITE</h2>
            <p className="text-[10px] text-slate-600 font-mono uppercase tracking-wider">Write to Reserved, TID, or User Banks</p>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Target Tag EPC</label>
            <Input 
              value={advEpc} 
              onChange={(e) => setAdvEpc(e.target.value.toUpperCase())} 
              placeholder="Target EPC..." 
              className="font-mono tracking-wider h-8"
            />
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Memory Bank</label>
              <select 
                value={memBank} 
                onChange={(e) => setMemBank(parseInt(e.target.value))}
                className="w-full h-8 px-2 bg-slate-950 border border-slate-800 rounded-sm font-bold text-xs text-slate-300 focus:ring-1 focus:ring-cyan-600 outline-none"
              >
                <option value={0}>Reserved (0)</option>
                <option value={1}>EPC (1)</option>
                <option value={2}>TID (2)</option>
                <option value={3}>User (3)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Word Pointer</label>
              <Input 
                type="number" 
                value={ptr} 
                onChange={(e) => setPtr(parseInt(e.target.value))} 
                placeholder="0" 
                min={0}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Access Password</label>
              <div className="relative">
                <Lock size={14} className="absolute left-2.5 top-2 text-slate-600" />
                <Input 
                  value={advPwd} 
                  onChange={(e) => setAdvPwd(e.target.value.toUpperCase())} 
                  placeholder="00000000" 
                  className="pl-8 font-mono tracking-wider h-8"
                  maxLength={8}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Hex Data Payload</label>
            <textarea 
              value={hexData} 
              onChange={(e) => setHexData(e.target.value.toUpperCase())} 
              placeholder="AABBCC..." 
              className="w-full p-3 bg-slate-950 border border-slate-800 rounded-sm font-mono text-xs text-slate-300 focus:ring-1 focus:ring-cyan-600 outline-none h-20 resize-none tracking-widest placeholder-slate-700"
            />
          </div>
        </div>

        <Button 
          fullWidth 
          size="md" 
          onClick={handleAdvWrite} 
          disabled={writeStatus === 'pending' || !advEpc || !hexData}
          variant="secondary"
          className="bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 h-8"
        >
          {writeStatus === 'pending' ? 'WRITING...' : 'EXECUTE WRITE OPERATION'}
        </Button>
      </div>

      {/* Status Message */}
      {writeMessage && (
        <div className={`p-3 rounded-sm border ${writeStatus === 'success' ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-500' : 'bg-red-950/30 border-red-900/50 text-red-500'}`}>
          <p className="font-bold text-[10px] uppercase tracking-wide">{writeStatus === 'success' ? 'SUCCESS' : 'ERROR'}</p>
          <p className="font-mono text-[10px] mt-0.5">{writeMessage}</p>
        </div>
      )}
    </div>
  );
};
