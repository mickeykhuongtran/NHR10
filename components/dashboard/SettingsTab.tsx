import React, { useState, useEffect } from 'react';
import { Zap, Radio, Clock, Activity, Save, RefreshCw, Send } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Settings as SettingsType } from '../../types';
import { bleService } from '../../services/bleService';

interface SettingsTabProps {
  settings: SettingsType;
  onUpdateSettings: (key: keyof SettingsType, value: any) => void;
  onSaveSetting: (key: string, value: any) => void;
  onSaveConfig: () => void;
  onShowPopup: (content: string, time: number, beep: boolean) => void;
}

const LINK_PROFILES = [
  { id: 11, label: "11: 640kHz, FM0" },
  { id: 13, label: "13: 160kHz, Miller 8" },
  { id: 53, label: "53: 640kHz, Miller 4" },
];

export const SettingsTab: React.FC<SettingsTabProps> = ({ settings, onSaveConfig, onShowPopup }) => {
  // --- Local State for Inputs ---
  const [power, setPower] = useState(settings.power);
  const [profile, setProfile] = useState(settings.linkProfile);
  const [qValue, setQValue] = useState(settings.qValue);
  const [session, setSession] = useState(settings.session);
  
  const [interval, setInterval] = useState(settings.scanParams?.interval || 0);
  const [dwell, setDwell] = useState(settings.scanParams?.dwell || 0);
  const [append, setAppend] = useState(settings.scanParams?.append || 0);
  
  const [tagFocus, setTagFocus] = useState(settings.tagFocus);

  // Popup State
  const [popupContent, setPopupContent] = useState('Hello!');
  const [popupTime, setPopupTime] = useState(2000);
  const [popupBeep, setPopupBeep] = useState(true);

  // Sync local state when settings prop updates (from GET responses)
  useEffect(() => {
    setPower(settings.power);
    setProfile(settings.linkProfile);
    setQValue(settings.qValue);
    setSession(settings.session);
    setTagFocus(settings.tagFocus);
    if (settings.scanParams) {
        setInterval(settings.scanParams.interval);
        setDwell(settings.scanParams.dwell);
        setAppend(settings.scanParams.append || 0);
    }
  }, [settings]);

  // --- Handlers ---

  // Block 1: Power
  const handleGetPower = () => bleService.getPower();
  const handleSetPower = () => bleService.setPower(power);

  // Block 2: Profile
  const handleGetProfile = () => bleService.getProfile();
  const handleSetProfile = () => {
    // Use specific SLP command
    bleService.setLinkProfile(profile);
  };

  // Block 3: EPC Gen2 (Q & Session)
  const handleGetQSession = () => bleService.getQSession();
  const handleSetQSession = () => {
    // Use specific SQS command
    bleService.setQSession(qValue, session);
  };

  // Block 4: Query Params
  const handleGetQueryParams = () => bleService.getQueryParam();
  const handleSetQueryParams = () => bleService.setQueryParam(interval, dwell, append);

  // Block 5: Tag Focus
  const handleGetTagFocus = () => bleService.getTagFocus();
  const handleSetTagFocus = () => bleService.setTagFocus(tagFocus);

  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-y-auto bg-slate-950">
      
      {/* Block 1: Power Control */}
      <div className="bg-slate-900 p-4 rounded-sm border border-slate-800 space-y-4">
        <div className="flex justify-between items-center border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-orange-500" />
            <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wide">Power Control</h3>
          </div>
          <span className="font-mono text-lg font-bold text-orange-500">{power} <span className="text-[10px] text-slate-600">dBm</span></span>
        </div>
        
        <div className="px-2">
            <input 
              type="range" 
              min="0" 
              max="30" 
              value={power} 
              onChange={(e) => setPower(parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-orange-600"
            />
        </div>

        <div className="flex gap-2">
            <Button onClick={handleGetPower} variant="secondary" size="sm" className="flex-1 h-8 text-[10px]">
                <RefreshCw size={12} className="mr-1" /> GET
            </Button>
            <Button onClick={handleSetPower} variant="primary" size="sm" className="flex-1 h-8 text-[10px]">
                <Send size={12} className="mr-1" /> SET
            </Button>
        </div>
      </div>

      {/* Block 2: RF Link Profile */}
      <div className="bg-slate-900 p-4 rounded-sm border border-slate-800 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <Activity size={16} className="text-indigo-500" />
          <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wide">RF Link Profile</h3>
        </div>
        
        <select 
          value={profile} 
          onChange={(e) => setProfile(parseInt(e.target.value))}
          className="w-full h-9 px-2 bg-slate-950 border border-slate-800 rounded-sm font-bold text-xs text-slate-300 focus:outline-none focus:border-cyan-600"
        >
          {LINK_PROFILES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>

        <div className="flex gap-2">
            <Button onClick={handleGetProfile} variant="secondary" size="sm" className="flex-1 h-8 text-[10px]">
                <RefreshCw size={12} className="mr-1" /> GET
            </Button>
            <Button onClick={handleSetProfile} variant="primary" size="sm" className="flex-1 h-8 text-[10px]">
                <Send size={12} className="mr-1" /> SET
            </Button>
        </div>
      </div>

      {/* Block 3: EPC Gen2 (Q & Session) */}
      <div className="bg-slate-900 p-4 rounded-sm border border-slate-800 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <Radio size={16} className="text-blue-500" />
          <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wide">EPC Gen2 (Q & Session)</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Q Value</label>
              <select 
                value={qValue} 
                onChange={(e) => setQValue(parseInt(e.target.value))}
                className="w-full h-9 px-2 bg-slate-950 border border-slate-800 rounded-sm font-bold text-xs text-slate-300 focus:outline-none focus:border-cyan-600"
              >
                {[...Array(16)].map((_, i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Session</label>
              <select 
                value={session} 
                onChange={(e) => setSession(parseInt(e.target.value))}
                className="w-full h-9 px-2 bg-slate-950 border border-slate-800 rounded-sm font-bold text-xs text-slate-300 focus:outline-none focus:border-cyan-600"
              >
                {[0, 1, 2, 3].map(i => <option key={i} value={i}>S{i}</option>)}
              </select>
            </div>
        </div>

        <div className="flex gap-2">
            <Button onClick={handleGetQSession} variant="secondary" size="sm" className="flex-1 h-8 text-[10px]">
                <RefreshCw size={12} className="mr-1" /> GET
            </Button>
            <Button onClick={handleSetQSession} variant="primary" size="sm" className="flex-1 h-8 text-[10px]">
                <Send size={12} className="mr-1" /> SET
            </Button>
        </div>
      </div>

      {/* Block 4: Query Parameter */}
      <div className="bg-slate-900 p-4 rounded-sm border border-slate-800 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <Clock size={16} className="text-teal-500" />
          <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wide">Query Parameter</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Interval (ms)</label>
            <select 
              value={interval} 
              onChange={(e) => setInterval(parseInt(e.target.value))}
              className="w-full h-9 px-2 bg-slate-950 border border-slate-800 rounded-sm font-bold text-xs text-slate-300 focus:outline-none focus:border-cyan-600"
            >
              {[0, 10, 20, 30, 40, 50, 60].map(val => (
                <option key={val} value={val}>{val} ms</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">DWELL (RAW COUNT)</label>
            <select 
              value={dwell} 
              onChange={(e) => setDwell(parseInt(e.target.value))}
              className="w-full h-9 px-2 bg-slate-950 border border-slate-800 rounded-sm font-bold text-xs text-slate-300 focus:outline-none focus:border-cyan-600"
            >
              {/* 2 to 255 */}
              {Array.from({ length: 254 }, (_, i) => i + 2).map(val => (
                <option key={val} value={val}>{val}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Append</label>
            <select 
              value={append} 
              onChange={(e) => setAppend(parseInt(e.target.value))}
              className="w-full h-9 px-2 bg-slate-950 border border-slate-800 rounded-sm font-bold text-xs text-slate-300 focus:outline-none focus:border-cyan-600"
            >
              {[0, 1, 2, 3, 4].map(val => (
                <option key={val} value={val}>{val}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2">
            <Button onClick={handleGetQueryParams} variant="secondary" size="sm" className="flex-1 h-8 text-[10px]">
                <RefreshCw size={12} className="mr-1" /> GET
            </Button>
            <Button onClick={handleSetQueryParams} variant="primary" size="sm" className="flex-1 h-8 text-[10px]">
                <Send size={12} className="mr-1" /> SET
            </Button>
        </div>
      </div>

      {/* Block 5: Tag Focus */}
      <div className="bg-slate-900 p-4 rounded-sm border border-slate-800 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <Activity size={16} className="text-purple-500" />
          <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wide">Tag Focus</h3>
        </div>

        <div className="flex items-center justify-between px-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</span>
            <div className="flex items-center gap-3">
                <span className={`text-xs font-mono font-bold ${tagFocus ? 'text-purple-400' : 'text-slate-500'}`}>
                    {tagFocus ? 'ENABLED' : 'DISABLED'}
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={tagFocus} 
                        onChange={(e) => setTagFocus(e.target.checked)} 
                    />
                    <div className="w-9 h-5 bg-slate-950 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600 peer-checked:after:bg-white"></div>
                </label>
            </div>
        </div>

        <div className="flex gap-2">
            <Button onClick={handleGetTagFocus} variant="secondary" size="sm" className="flex-1 h-8 text-[10px]">
                <RefreshCw size={12} className="mr-1" /> GET
            </Button>
            <Button onClick={handleSetTagFocus} variant="primary" size="sm" className="flex-1 h-8 text-[10px]">
                <Send size={12} className="mr-1" /> SET
            </Button>
        </div>
      </div>

      {/* Device Popup Test */}
      <div className="bg-slate-900 p-3 rounded-sm border border-slate-800 space-y-3">
        <div className="flex items-center gap-2 text-cyan-500 mb-1">
          <Activity size={16} />
          <h3 className="text-xs font-bold uppercase tracking-wider">Device Popup Test</h3>
        </div>
        
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Content (Max 15)</span>
                <Input 
                    type="text" 
                    value={popupContent} 
                    onChange={(e) => setPopupContent(e.target.value.substring(0, 15))} 
                    className="w-32 h-7 text-xs text-right font-mono"
                    maxLength={15}
                />
            </div>
            <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Time (ms)</span>
                <Input 
                    type="number" 
                    value={popupTime} 
                    onChange={(e) => setPopupTime(Number(e.target.value))} 
                    className="w-24 h-7 text-xs text-right font-mono"
                    min={100}
                    max={10000}
                />
            </div>
            <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Beep</span>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={popupBeep} 
                        onChange={(e) => setPopupBeep(e.target.checked)} 
                    />
                    <div className="w-9 h-5 bg-slate-950 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-600 peer-checked:after:bg-white"></div>
                </label>
            </div>
        </div>

        <Button 
            onClick={() => onShowPopup(popupContent, popupTime, popupBeep)} 
            variant="primary" 
            size="sm" 
            fullWidth
            className="h-8 text-[10px]"
        >
            <Send size={12} className="mr-1" /> TEST POPUP
        </Button>
      </div>

      {/* Global Save */}
      <div className="pt-4 border-t border-slate-800">
        <Button 
          fullWidth 
          onClick={onSaveConfig} 
          variant="danger" 
          size="md" 
          className="h-10 font-bold tracking-widest"
        >
          <Save size={18} className="mr-2" /> SAVE CONFIG TO FLASH
        </Button>
        <p className="text-center text-[10px] text-slate-600 mt-2 font-mono uppercase">Persist current settings to device memory</p>
      </div>
    </div>
  );
};
