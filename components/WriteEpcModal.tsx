import React, { useState, useEffect } from 'react';
import { X, FileText, ArrowRight, AlertTriangle, Radio, CheckCircle2, XCircle, Search } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Tag, WriteStatus } from '../types';

interface WriteEpcModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWrite: (targetEpc: string, newEpc: string, password?: string) => void;
  writeStatus: WriteStatus;
  writeMessage: string;
  
  // Scanning props
  onStartScan: () => void;
  onStopScan: () => void;
  isScanning: boolean;
  liveTags: Tag[];
}

export const WriteEpcModal: React.FC<WriteEpcModalProps> = ({
  isOpen,
  onClose,
  onWrite,
  writeStatus,
  writeMessage,
  onStartScan,
  onStopScan,
  isScanning,
  liveTags
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [targetEpc, setTargetEpc] = useState('');
  const [newEpc, setNewEpc] = useState('');
  const [error, setError] = useState('');

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setTargetEpc('');
      setNewEpc('');
      setError('');
    }
    // Cleanup: Ensure scan stops if modal closes while scanning
    return () => {
      if (isScanning && isOpen) {
        onStopScan();
      }
    };
  }, [isOpen]);

  // When a user selects a tag in Step 1
  const handleSelectTag = (epc: string) => {
    if (isScanning) onStopScan();
    setTargetEpc(epc);
    setNewEpc(epc); // Pre-fill with current for easy editing
    setStep(2);
    setError('');
  };

  const handleBackToScan = () => {
    setStep(1);
    setTargetEpc('');
    // Auto-restart scan? Maybe optional. Let's let user click start.
  };

  const validateAndWrite = () => {
    // 1. Hex validation
    const hexRegex = /^[0-9A-Fa-f]+$/;
    if (!hexRegex.test(newEpc)) {
      setError('New EPC must contain only Hex characters (0-9, A-F).');
      return;
    }
    // 2. Length validation (must be multiple of 4 chars = 16 bits)
    if (newEpc.length === 0 || newEpc.length % 4 !== 0) {
        setError(`Length must be a multiple of 4 characters. Current: ${newEpc.length}`);
        return;
    }
    
    setError('');
    onWrite(targetEpc, newEpc, '00000000');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/50 shrink-0">
          <div className="flex items-center gap-2 text-slate-100">
            <div className="p-1.5 bg-blue-500/10 rounded-lg">
                <FileText className="w-5 h-5 text-blue-400" />
            </div>
            <div>
                <h2 className="font-semibold text-sm">Write EPC Tool</h2>
                <p className="text-[10px] text-slate-400">Step {step} of 2</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* Global Warning */}
          <div className="bg-amber-900/20 border border-amber-800/50 rounded-lg p-3 flex items-start gap-3 mb-6">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200/80 leading-relaxed">
              <strong>Safety Warning:</strong> Ensure only <u>ONE</u> tag is near the antenna. Writing with multiple tags in the field may overwrite the wrong tag.
            </p>
          </div>

          {/* Step 1: Scan & Select */}
          {step === 1 && (
            <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                <div className="flex items-center justify-between">
                    <h3 className="text-slate-200 font-medium text-sm">1. Find Target Tag</h3>
                    {isScanning ? (
                        <Button size="sm" variant="danger" onClick={onStopScan}>Stop Scan</Button>
                    ) : (
                        <Button size="sm" variant="success" onClick={onStartScan}>Start Scan</Button>
                    )}
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-lg h-60 overflow-y-auto relative custom-scrollbar">
                    {liveTags.length === 0 ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-2">
                            <Radio className={`w-8 h-8 ${isScanning ? 'animate-pulse text-blue-500' : 'text-slate-700'}`} />
                            <p className="text-xs">{isScanning ? 'Scanning for tags...' : 'Press Start Scan to find tags'}</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-800">
                            {liveTags.map((tag, idx) => (
                                <button 
                                    key={idx}
                                    onClick={() => handleSelectTag(tag.epc)}
                                    className="w-full flex items-center justify-between p-3 hover:bg-slate-800 transition-colors group text-left"
                                >
                                    <div>
                                        <p className="font-mono text-emerald-400 text-sm group-hover:text-emerald-300 transition-colors">{tag.epc}</p>
                                        <p className="text-[10px] text-slate-500">RSSI: {tag.rssi} dBm</p>
                                    </div>
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">Select</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
          )}

          {/* Step 2: Write */}
          {step === 2 && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                 <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase font-semibold tracking-wider">Target Tag (Locked)</label>
                    <div className="bg-slate-800/50 border border-slate-700 rounded-md p-3 flex items-center gap-2">
                        <Search className="w-4 h-4 text-slate-500" />
                        <span className="font-mono text-slate-300 text-sm">{targetEpc}</span>
                    </div>
                 </div>

                 <div className="flex justify-center py-2">
                    <ArrowRight className="w-6 h-6 text-slate-600 animate-pulse" />
                 </div>

                 <div className="space-y-4">
                     <Input 
                        label="New EPC Value (Hex)"
                        placeholder="E280..."
                        value={newEpc}
                        onChange={(e) => {
                            setNewEpc(e.target.value.toUpperCase());
                            setError('');
                        }}
                        error={error}
                        className="font-mono"
                        disabled={writeStatus === 'pending' || writeStatus === 'success'}
                     />
                     <div className="text-[10px] text-slate-500 flex justify-between">
                        <span>Characters: {newEpc.length}</span>
                        <span>Bits: {newEpc.length * 4}</span>
                     </div>
                 </div>

                 {/* Write Status Feedback */}
                 {writeStatus === 'success' && (
                     <div className="bg-emerald-900/20 border border-emerald-800 rounded-lg p-3 flex items-center gap-3">
                         <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                         <p className="text-sm text-emerald-200">{writeMessage}</p>
                     </div>
                 )}
                 
                 {writeStatus === 'error' && (
                     <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 flex items-center gap-3">
                         <XCircle className="w-5 h-5 text-red-500" />
                         <p className="text-sm text-red-200">{writeMessage}</p>
                     </div>
                 )}

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/30 flex justify-between items-center shrink-0">
          {step === 2 ? (
             <Button variant="outline" onClick={handleBackToScan} disabled={writeStatus === 'pending'}>
                Back
             </Button>
          ) : (
             <span /> // Spacer
          )}
          
          <div className="flex gap-3">
             <Button variant="secondary" onClick={onClose} disabled={writeStatus === 'pending'}>
                {writeStatus === 'success' ? 'Close' : 'Cancel'}
             </Button>
             
             {step === 2 && writeStatus !== 'success' && (
                <Button 
                    variant="primary" 
                    onClick={validateAndWrite} 
                    disabled={writeStatus === 'pending'}
                >
                    {writeStatus === 'pending' ? 'Writing...' : 'Write Tag'}
                </Button>
             )}
          </div>
        </div>

      </div>
    </div>
  );
};