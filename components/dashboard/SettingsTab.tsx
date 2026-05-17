import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '../ui/Button';
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
  { id: 11, label: '11 - 640 kHz / FM0' },
  { id: 13, label: '13 - 160 kHz / Miller 8' },
  { id: 53, label: '53 - 640 kHz / Miller 4' },
];

const DWELL_OPTIONS = Array.from({ length: 254 }, (_, index) => index + 2);
const INTERVAL_OPTIONS = [0, 10, 20, 30, 40, 50, 60];
const APPEND_OPTIONS = [0, 1, 2, 3, 4];
const Q_OPTIONS = Array.from({ length: 16 }, (_, index) => index);
const SESSION_OPTIONS = [0, 1, 2, 3];
const PROFILE_SELECT_OPTIONS = LINK_PROFILES.map((item) => ({ label: item.label, value: item.id }));
const DWELL_SELECT_OPTIONS = DWELL_OPTIONS.map((item) => ({ label: String(item), value: item }));
const INTERVAL_SELECT_OPTIONS = INTERVAL_OPTIONS.map((item) => ({ label: `${item} ms`, value: item }));
const APPEND_SELECT_OPTIONS = APPEND_OPTIONS.map((item) => ({ label: String(item), value: item }));
const Q_SELECT_OPTIONS = Q_OPTIONS.map((item) => ({ label: String(item), value: item }));
const SESSION_SELECT_OPTIONS = SESSION_OPTIONS.map((item) => ({ label: `S${item}`, value: item }));
const FIELD_CLASS = 'soft-surface h-10 w-full rounded-md border border-[#52c7da]/20 bg-white/58 px-2 text-xs font-bold text-[#1D1D1F] outline-none focus:border-[#52c7da]/60 sm:h-9';
const COMPACT_BUTTON_CLASS = 'h-10 text-[10px] font-bold tracking-wide sm:h-8';
const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const normalizeProfileValue = (value: unknown, fallback = 53) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
type SelectFieldId = 'profile' | 'q' | 'session' | 'interval' | 'dwell' | 'append';
type SelectOption = { label: string; value: number };
type SettingsAction = () => void | Promise<void>;
type SettingsActionSource = 'early' | 'click';

export const SettingsTab: React.FC<SettingsTabProps> = ({ settings, onSaveConfig, onShowPopup }) => {
  const [power, setPower] = useState(settings.power);
  const [profile, setProfile] = useState(() => normalizeProfileValue(settings.linkProfile));
  const [qValue, setQValue] = useState(settings.qValue);
  const [session, setSession] = useState(settings.session);
  const [queryInterval, setQueryInterval] = useState(settings.scanParams?.interval || 0);
  const [dwell, setDwell] = useState(settings.scanParams?.dwell || 0);
  const [openSelect, setOpenSelect] = useState<SelectFieldId | null>(null);
  const [append, setAppend] = useState(settings.scanParams?.append || 0);
  const [tagFocus, setTagFocus] = useState(settings.tagFocus);
  const [popupContent, setPopupContent] = useState('Hello!');
  const [popupTime, setPopupTime] = useState(2000);
  const [popupBeep, setPopupBeep] = useState(true);
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);
  const settingsActionAtRef = useRef(0);
  const activeActionTimerRef = useRef<number | null>(null);
  const powerSyncRevision = settings.syncRevision?.power ?? 0;
  const profileSyncRevision = settings.syncRevision?.linkProfile ?? 0;
  const qSessionSyncRevision = settings.syncRevision?.qSession ?? 0;
  const queryParamsSyncRevision = settings.syncRevision?.queryParams ?? 0;
  const tagFocusSyncRevision = settings.syncRevision?.tagFocus ?? 0;

  useEffect(() => {
    setPower(settings.power);
  }, [settings.power, powerSyncRevision]);

  useEffect(() => {
    setProfile(normalizeProfileValue(settings.linkProfile));
  }, [settings.linkProfile, profileSyncRevision]);

  useEffect(() => {
    setQValue(settings.qValue);
  }, [settings.qValue, qSessionSyncRevision]);

  useEffect(() => {
    setSession(settings.session);
  }, [settings.session, qSessionSyncRevision]);

  useEffect(() => {
    setTagFocus(settings.tagFocus);
  }, [settings.tagFocus, tagFocusSyncRevision]);

  useEffect(() => {
    if (!settings.scanParams) return;

    setQueryInterval(settings.scanParams.interval);
    setDwell(settings.scanParams.dwell);
    setAppend(settings.scanParams.append || 0);
  }, [queryParamsSyncRevision, settings.scanParams?.append, settings.scanParams?.dwell, settings.scanParams?.interval]);

  useEffect(() => () => {
    if (activeActionTimerRef.current !== null) {
      window.clearTimeout(activeActionTimerRef.current);
    }
  }, []);

  const handleGetPower = () => bleService.getPower();
  const handleSetPower = () => bleService.setPower(power);
  const handleGetProfile = () => bleService.getProfile();
  const handleSetProfile = () => bleService.setLinkProfile(profile);
  const handleGetQSession = () => bleService.getQSession();
  const handleSetQSession = () => bleService.setQSession(qValue, session);
  const handleGetQueryParams = () => bleService.getQueryParam();
  const handleSetQueryParams = () => bleService.setQueryParam(queryInterval, dwell, append);
  const handleGetTagFocus = () => bleService.getTagFocus();
  const handleSetTagFocus = () => bleService.setTagFocus(tagFocus);
  const adjustPower = (delta: number) => setPower((current) => clampNumber(current + delta, 0, 30));
  const tagFocusIndicatorStyle: React.CSSProperties = {
    width: 'calc((100% - 0.5rem) / 2)',
    transform: tagFocus ? 'translateX(100%)' : 'translateX(0)',
  };
  const activeCardStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(218,247,252,0.88))',
    boxShadow: '0 30px 78px rgba(18,78,90,0.22), 0 0 0 1px rgba(82,199,218,0.18) inset, 0 1px 0 rgba(255,255,255,0.98) inset',
    backdropFilter: 'blur(36px) saturate(210%)',
    WebkitBackdropFilter: 'blur(36px) saturate(210%)',
  };

  const markActionPressed = (actionKey: string) => {
    setActiveActionKey(actionKey);
    if (activeActionTimerRef.current !== null) {
      window.clearTimeout(activeActionTimerRef.current);
    }
    activeActionTimerRef.current = window.setTimeout(() => {
      setActiveActionKey(null);
      activeActionTimerRef.current = null;
    }, 380);
  };

  const runSettingsAction = (actionKey: string, action: SettingsAction, source: SettingsActionSource) => {
    const now = Date.now();
    if (source === 'click' && now - settingsActionAtRef.current < 650) {
      return;
    }
    if (source === 'early' && now - settingsActionAtRef.current < 250) {
      return;
    }

    settingsActionAtRef.current = now;
    markActionPressed(actionKey);

    try {
      const result = action();
      if (result && typeof result.catch === 'function') {
        void result.catch((error) => console.error('Settings action failed', error));
      }
    } catch (error) {
      console.error('Settings action failed', error);
    }
  };

  const getSettingsActionHandlers = (actionKey: string, action: SettingsAction) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === 'mouse') return;
      event.preventDefault();
      event.stopPropagation();
      runSettingsAction(actionKey, action, 'early');
    },
    onTouchStart: (event: React.TouchEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      runSettingsAction(actionKey, action, 'early');
    },
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      runSettingsAction(actionKey, action, 'click');
    },
  });

  const Card = ({
    actionId,
    children,
    className = '',
    subtitle,
    title,
  }: {
    actionId?: string;
    children: React.ReactNode;
    className?: string;
    subtitle?: string;
    title: string;
  }) => {
    const isActive = actionId ? activeActionKey?.startsWith(`${actionId}:`) : false;

    return (
      <section
        className={`soft-glass rounded-lg p-3 transition-[background,box-shadow,filter,backdrop-filter] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${isActive ? 'brightness-[1.06]' : ''} ${className}`}
        style={isActive ? activeCardStyle : undefined}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-[#166B78]">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#7A8E92]">{subtitle}</p>}
          </div>
        </div>
        {children}
      </section>
    );
  };

  const ActionRow = ({ id, onGet, onSet }: { id: string; onGet: SettingsAction; onSet: SettingsAction }) => (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <Button
        {...getSettingsActionHandlers(`${id}:get`, onGet)}
        variant="secondary"
        size="sm"
        className={`${COMPACT_BUTTON_CLASS} touch-manipulation ${
          activeActionKey === `${id}:get` ? 'bg-white/95 text-[#0C4F5B] shadow-[inset_0_2px_14px_rgba(18,78,90,0.14),0_10px_24px_rgba(18,78,90,0.08)] brightness-[1.07]' : ''
        }`}
      >
        GET
      </Button>
      <Button
        {...getSettingsActionHandlers(`${id}:set`, onSet)}
        variant="primary"
        size="sm"
        className={`${COMPACT_BUTTON_CLASS} touch-manipulation ${
          activeActionKey === `${id}:set` ? 'shadow-[inset_0_2px_16px_rgba(18,78,90,0.18),0_14px_30px_rgba(82,199,218,0.36)] brightness-[1.1] saturate-[1.18]' : ''
        }`}
      >
        SET
      </Button>
    </div>
  );

  const FieldLabel = ({ children }: { children: React.ReactNode }) => (
    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[#6E7F83]">{children}</label>
  );

  const SelectField = ({
    id,
    onChange,
    options,
    value,
  }: {
    id: SelectFieldId;
    onChange: (value: number) => void;
    options: SelectOption[];
    value: number;
  }) => {
    const selectRef = useRef<HTMLDivElement>(null);
    const isOpen = openSelect === id;
    const selectedValue = normalizeProfileValue(value, value);
    const selectedOption = options.find((option) => option.value === selectedValue);

    useEffect(() => {
      if (!isOpen) return;

      const handlePointerDown = (event: PointerEvent) => {
        if (!selectRef.current?.contains(event.target as Node)) {
          setOpenSelect(null);
        }
      };

      window.addEventListener('pointerdown', handlePointerDown);
      return () => window.removeEventListener('pointerdown', handlePointerDown);
    }, [isOpen]);

    return (
      <div ref={selectRef} className="relative">
        <button
          type="button"
          className={`${FIELD_CLASS} flex items-center justify-between text-left`}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          onClick={() => setOpenSelect((current) => current === id ? null : id)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpenSelect(null);
            }
          }}
        >
          <span className="truncate font-mono">{selectedOption?.label ?? value}</span>
          <ChevronDown
            size={16}
            strokeWidth={2.2}
            className={`shrink-0 text-[#5D7479] transition-transform duration-200 ${isOpen ? 'rotate-180 text-[#166B78]' : ''}`}
            aria-hidden="true"
          />
        </button>

        {isOpen && (
          <div
            role="listbox"
            className="select-menu-scrollbar absolute left-0 right-0 top-[calc(100%+6px)] z-[130] max-h-52 overflow-y-auto rounded-md border border-[#52c7da]/24 bg-white p-1 shadow-[0_16px_42px_rgba(18,78,90,0.14)]"
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selectedValue === option.value}
                className={`block h-8 w-full rounded px-2 text-left font-mono text-xs font-semibold sm:h-7 ${
                  selectedValue === option.value ? 'bg-[#E7F9FC] text-[#0C4F5B] ring-1 ring-[#52c7da]/35' : 'text-[#52666B] hover:bg-[#F5F5F7] hover:text-[#166B78]'
                }`}
                onClick={() => {
                  onChange(option.value);
                  setOpenSelect(null);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-transparent p-2 sm:p-3 md:p-5">
      <div className="grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card actionId="power" title="Power" subtitle="RF output">
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => adjustPower(-1)}
              className="h-11 w-11 rounded-md border border-[#52c7da]/22 bg-white/54 text-xl font-semibold text-[#166B78] shadow-sm transition-colors hover:bg-white/82 sm:h-10 sm:w-10"
            >
              -
            </button>
            <div className="min-w-[104px] rounded-lg border border-[#52c7da]/18 bg-white/48 px-3 py-2 text-center">
              <div className="font-mono text-3xl font-bold text-[#0C4F5B]">{power}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-[#7A8E92]">dBm</div>
            </div>
            <button
              type="button"
              onClick={() => adjustPower(1)}
              className="h-11 w-11 rounded-md border border-[#52c7da]/22 bg-white/54 text-xl font-semibold text-[#166B78] shadow-sm transition-colors hover:bg-white/82 sm:h-10 sm:w-10"
            >
              +
            </button>
          </div>
          <ActionRow id="power" onGet={handleGetPower} onSet={handleSetPower} />
        </Card>

        <Card
          actionId="profile"
          title="RF Link Profile"
          subtitle="Backscatter link"
          className={`relative overflow-visible ${openSelect === 'profile' ? 'z-[120]' : 'z-10'}`}
        >
          <SelectField
            id="profile"
            value={profile}
            options={PROFILE_SELECT_OPTIONS}
            onChange={setProfile}
          />
          <ActionRow id="profile" onGet={handleGetProfile} onSet={handleSetProfile} />
        </Card>

        <Card
          actionId="q-session"
          title="EPC Gen2"
          subtitle="Q and session"
          className={`relative overflow-visible ${openSelect === 'q' || openSelect === 'session' ? 'z-[120]' : 'z-10'}`}
        >
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel>Q</FieldLabel>
              <SelectField
                id="q"
                value={qValue}
                options={Q_SELECT_OPTIONS}
                onChange={setQValue}
              />
            </div>
            <div>
              <FieldLabel>Session</FieldLabel>
              <SelectField
                id="session"
                value={session}
                options={SESSION_SELECT_OPTIONS}
                onChange={setSession}
              />
            </div>
          </div>
          <ActionRow id="q-session" onGet={handleGetQSession} onSet={handleSetQSession} />
        </Card>

        <Card actionId="tag-focus" title="Tag Focus" subtitle="Singulation assist">
          <div className="soft-surface relative grid grid-cols-2 rounded-md border border-[#52c7da]/24 p-1">
            <span
              aria-hidden="true"
              className="absolute bottom-1 left-1 top-1 rounded bg-[#E7F9FC]/95 shadow-[0_8px_22px_rgba(82,199,218,0.18)] ring-1 ring-[#52c7da]/45 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={tagFocusIndicatorStyle}
            />
            {[
              { label: 'OFF', value: false },
              { label: 'ON', value: true },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => setTagFocus(item.value)}
                className={`relative z-10 h-10 rounded text-xs font-bold transition-colors sm:h-9 ${
                  tagFocus === item.value ? 'text-[#0C4F5B]' : 'text-[#6E7F83] hover:text-[#166B78]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <ActionRow id="tag-focus" onGet={handleGetTagFocus} onSet={handleSetTagFocus} />
        </Card>

        <Card
          actionId="query-params"
          title="Query Parameter"
          subtitle="Inventory timing"
          className={`relative overflow-visible xl:col-span-2 ${openSelect === 'interval' || openSelect === 'dwell' || openSelect === 'append' ? 'z-[120]' : 'z-10'}`}
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <FieldLabel>Interval</FieldLabel>
              <SelectField
                id="interval"
                value={queryInterval}
                options={INTERVAL_SELECT_OPTIONS}
                onChange={setQueryInterval}
              />
            </div>
            <div>
              <FieldLabel>Dwell</FieldLabel>
              <SelectField
                id="dwell"
                value={clampNumber(dwell, 2, 255)}
                options={DWELL_SELECT_OPTIONS}
                onChange={setDwell}
              />
            </div>
            <div>
              <FieldLabel>Append</FieldLabel>
              <SelectField
                id="append"
                value={append}
                options={APPEND_SELECT_OPTIONS}
                onChange={setAppend}
              />
            </div>
          </div>
          <ActionRow id="query-params" onGet={handleGetQueryParams} onSet={handleSetQueryParams} />
        </Card>

        <Card title="Device Popup" subtitle="Display test" className="xl:col-span-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px_104px]">
            <div>
              <FieldLabel>Content</FieldLabel>
              <input
                type="text"
                value={popupContent}
                onChange={(event) => setPopupContent(event.target.value.substring(0, 15))}
                maxLength={15}
                className={`${FIELD_CLASS} font-mono`}
              />
            </div>
            <div>
              <FieldLabel>Time</FieldLabel>
              <input
                type="number"
                value={popupTime}
                min={100}
                max={10000}
                onChange={(event) => setPopupTime(Number(event.target.value))}
                className={`${FIELD_CLASS} text-right font-mono`}
              />
            </div>
            <div>
              <FieldLabel>Beep</FieldLabel>
              <button
                type="button"
                onClick={() => setPopupBeep((current) => !current)}
                className={`h-10 w-full rounded-md border text-xs font-bold transition-colors sm:h-9 ${
                  popupBeep
                    ? 'border-[#52c7da]/36 bg-white text-[#166B78]'
                    : 'border-[#52c7da]/20 bg-white/48 text-[#7A8E92]'
                }`}
              >
                {popupBeep ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
          <Button
            onClick={() => onShowPopup(popupContent, popupTime, popupBeep)}
            variant="primary"
            size="sm"
            fullWidth
            className={`${COMPACT_BUTTON_CLASS} mt-3`}
          >
            TEST POPUP
          </Button>
        </Card>

        <section className="soft-glass rounded-lg p-3 md:col-span-2 xl:col-span-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#166B78]">Save Configuration</h3>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#7A8E92]">Persist current settings to device memory</p>
            </div>
            <Button onClick={onSaveConfig} variant="danger" size="md" className="h-10 w-full font-bold tracking-wide md:h-9 md:w-auto md:min-w-[220px]">
              SAVE CONFIG TO FLASH
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
};
