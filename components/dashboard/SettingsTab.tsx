import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, SlidersHorizontal } from 'lucide-react';
import { Button } from '../ui/Button';
import { RegionBandSelection, Settings as SettingsType } from '../../types';
import { bleService } from '../../services/bleService';
import { PageHeader } from './PageHeader';
import { BLE_DEVICE_NAME_MAX_BYTES, validateBleDeviceName } from '../../utils/deviceName';

interface SettingsTabProps {
  isConnected: boolean;
  isBusy: boolean;
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
const REGION_OPTIONS: Array<{ label: string; value: RegionBandSelection }> = [
  { label: 'US', value: 'US' },
  { label: 'ETSI', value: 'ETSI' },
  { label: 'VN', value: 'VN' },
  { label: 'JP', value: 'JP' },
  { label: 'KOR', value: 'KOR' },
  { label: 'Custom', value: 'Custom' },
];
const PROFILE_SELECT_OPTIONS = LINK_PROFILES.map((item) => ({ label: item.label, value: item.id }));
const DWELL_SELECT_OPTIONS = DWELL_OPTIONS.map((item) => ({ label: String(item), value: item }));
const INTERVAL_SELECT_OPTIONS = INTERVAL_OPTIONS.map((item) => ({ label: `${item} ms`, value: item }));
const APPEND_SELECT_OPTIONS = APPEND_OPTIONS.map((item) => ({ label: String(item), value: item }));
const Q_SELECT_OPTIONS = Q_OPTIONS.map((item) => ({ label: String(item), value: item }));
const SESSION_SELECT_OPTIONS = SESSION_OPTIONS.map((item) => ({ label: `S${item}`, value: item }));
const FIELD_CLASS = 'h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-blue-500';
const COMPACT_BUTTON_CLASS = 'h-10 text-sm';
const REGION_MIN_KHZ = 840000;
const REGION_MAX_KHZ = 960000;
const VN_REGION_DEFAULT = { startKHz: 918500, count: 9, space125KHz: 4 };
const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const normalizeProfileValue = (value: unknown, fallback = 53) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const normalizeRegionNumber = (value: unknown, fallback: number) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
};
const isVnDefaultRegion = (regionBand?: SettingsType['regionBand']) => (
  regionBand?.startKHz === VN_REGION_DEFAULT.startKHz &&
  regionBand?.count === VN_REGION_DEFAULT.count &&
  regionBand?.space125KHz === VN_REGION_DEFAULT.space125KHz
);
const normalizeRegionSelection = (regionBand?: SettingsType['regionBand']): RegionBandSelection => {
  const val = String(regionBand?.val ?? '').toUpperCase();

  if (regionBand?.mode === 'custom') {
    return val === 'VN' && isVnDefaultRegion(regionBand) ? 'VN' : 'Custom';
  }

  return REGION_OPTIONS.some((option) => option.value === val) && val !== 'Custom'
    ? val as RegionBandSelection
    : 'US';
};
const formatFrequencyMHz = (khz: number | undefined) => (
  typeof khz === 'number' && Number.isFinite(khz) ? `${(khz / 1000).toFixed(3)} MHz` : '--'
);
type SelectFieldId = 'profile' | 'q' | 'session' | 'interval' | 'dwell' | 'append';
type SelectOption = { label: string; value: number };
type SettingsAction = () => void | Promise<void>;
const ACTIVE_CARD_STYLE: React.CSSProperties = { borderColor: '#93b4fa' };

const SettingsCard = ({
  actionId,
  activeActionKey,
  children,
  className = '',
  subtitle,
  title,
}: {
  actionId?: string;
  activeActionKey?: string | null;
  children: React.ReactNode;
  className?: string;
  subtitle?: string;
  title: string;
}) => {
  const isActive = actionId ? activeActionKey?.startsWith(`${actionId}:`) : false;

  return (
    <section
      className={`soft-glass rounded-xl p-5 transition-colors  ${className}`}
      style={isActive ? ACTIVE_CARD_STYLE : undefined}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs font-normal text-[#64748b]">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
};

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <label htmlFor={'setting-' + String(children).toLowerCase().replace(/[^a-z0-9]+/g, '-')} className="mb-1 block text-sm font-medium text-[#64748b]">{children}</label>
);

const SelectField = ({ id, onChange, options, value }: {
  id: SelectFieldId; onChange: (value: number) => void; options: SelectOption[]; value: number;
}) => <select id={'setting-' + id} aria-label={id === 'profile' ? 'RF link profile' : id} className={FIELD_CLASS} value={value} onChange={event => onChange(Number(event.target.value))}>
  {!options.some(option => option.value === value) && <option value={value}>{value} (device value)</option>}
  {options.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}
</select>;
const RegionSelectField = ({ value, onChange }: {
  value: RegionBandSelection; onChange: (value: RegionBandSelection) => void;
}) => <select id="setting-region" className={FIELD_CLASS} value={value} onChange={event => onChange(event.target.value as RegionBandSelection)}>
  {REGION_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
</select>;

export const SettingsTab: React.FC<SettingsTabProps> = ({ isConnected, isBusy, settings, onSaveConfig }) => {
  const [power, setPower] = useState(settings.power);
  const [deviceName, setDeviceName] = useState(settings.deviceName);
  const [profile, setProfile] = useState(() => normalizeProfileValue(settings.linkProfile));
  const [qValue, setQValue] = useState(settings.qValue);
  const [session, setSession] = useState(settings.session);
  const [queryInterval, setQueryInterval] = useState(settings.scanParams?.interval || 0);
  const [dwell, setDwell] = useState(settings.scanParams?.dwell || 0);
  const [append, setAppend] = useState(settings.scanParams?.append || 0);
  const [tagFocus, setTagFocus] = useState(settings.tagFocus);
  const [regionSelection, setRegionSelection] = useState<RegionBandSelection>(() => normalizeRegionSelection(settings.regionBand));
  const [customStartKHz, setCustomStartKHz] = useState(() => normalizeRegionNumber(settings.regionBand?.startKHz, VN_REGION_DEFAULT.startKHz));
  const [customCount, setCustomCount] = useState(() => normalizeRegionNumber(settings.regionBand?.count, VN_REGION_DEFAULT.count));
  const [customSpace, setCustomSpace] = useState(() => normalizeRegionNumber(settings.regionBand?.space125KHz, VN_REGION_DEFAULT.space125KHz));
  const [saveRegion, setSaveRegion] = useState(settings.regionBand?.save ?? true);
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionPending, setActionPending] = useState(false);
  const inFlightRef = useRef(false);
  const activeActionTimerRef = useRef<number | null>(null);
  const powerSyncRevision = settings.syncRevision?.power ?? 0;
  const deviceNameSyncRevision = settings.syncRevision?.deviceName ?? 0;
  const profileSyncRevision = settings.syncRevision?.linkProfile ?? 0;
  const qSessionSyncRevision = settings.syncRevision?.qSession ?? 0;
  const queryParamsSyncRevision = settings.syncRevision?.queryParams ?? 0;
  const tagFocusSyncRevision = settings.syncRevision?.tagFocus ?? 0;
  const regionBandSyncRevision = settings.syncRevision?.regionBand ?? 0;

  useEffect(() => {
    setPower(settings.power);
  }, [settings.power, powerSyncRevision]);

  useEffect(() => {
    setDeviceName(settings.deviceName);
  }, [deviceNameSyncRevision, settings.deviceName]);

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
    setRegionSelection(normalizeRegionSelection(settings.regionBand));
    setCustomStartKHz(normalizeRegionNumber(settings.regionBand?.startKHz, VN_REGION_DEFAULT.startKHz));
    setCustomCount(normalizeRegionNumber(settings.regionBand?.count, VN_REGION_DEFAULT.count));
    setCustomSpace(normalizeRegionNumber(settings.regionBand?.space125KHz, VN_REGION_DEFAULT.space125KHz));
    if (typeof settings.regionBand?.save === 'boolean') {
      setSaveRegion(settings.regionBand.save);
    }
  }, [regionBandSyncRevision, settings.regionBand]);

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

  useEffect(() => {
    if (!isConnected || isBusy) setConfirmSave(false);
  }, [isConnected, isBusy]);

  const handleGetPower = () => bleService.getPower();
  const handleSetPower = () => bleService.setPower(power);
  const handleGetDeviceName = () => bleService.getConfiguredDeviceName();
  const handleSetDeviceName = () => bleService.setConfiguredDeviceName(deviceName);
  const handleGetProfile = () => bleService.getProfile();
  const handleSetProfile = () => bleService.setLinkProfile(profile);
  const handleGetQSession = () => bleService.getQSession();
  const handleSetQSession = () => bleService.setQSession(qValue, session);
  const handleGetQueryParams = () => bleService.getQueryParam();
  const handleSetQueryParams = () => bleService.setQueryParam(queryInterval, dwell, append);
  const handleGetTagFocus = () => bleService.getTagFocus();
  const handleSetTagFocus = () => bleService.setTagFocus(tagFocus);
  const handleGetRegion = () => bleService.getRegion();
  const adjustPower = (delta: number) => setPower((current) => clampNumber(current + delta, 0, 30));
  const customStepKHz = customSpace * 125;
  const customEndKHz = customStartKHz + Math.max(0, customCount - 1) * customStepKHz;
  const customRegionError = useMemo(() => {
    if (customStartKHz < REGION_MIN_KHZ || customStartKHz > REGION_MAX_KHZ) {
      return `Start must be ${REGION_MIN_KHZ}..${REGION_MAX_KHZ} kHz`;
    }
    if (customCount < 1 || customCount > 255) {
      return 'Channel count must be 1..255';
    }
    if (customSpace < 1 || customSpace > 255) {
      return 'Space must be 1..255';
    }
    if (customEndKHz > REGION_MAX_KHZ) {
      return `End frequency ${customEndKHz} kHz exceeds ${REGION_MAX_KHZ} kHz`;
    }
    return '';
  }, [customCount, customEndKHz, customSpace, customStartKHz]);
  const deviceNameValidation = useMemo(() => validateBleDeviceName(deviceName), [deviceName]);
  const handleRegionChange = (value: RegionBandSelection) => {
    setRegionSelection(value);
    if (value === 'Custom') {
      setCustomStartKHz(normalizeRegionNumber(settings.regionBand?.startKHz, VN_REGION_DEFAULT.startKHz));
      setCustomCount(normalizeRegionNumber(settings.regionBand?.count, VN_REGION_DEFAULT.count));
      setCustomSpace(normalizeRegionNumber(settings.regionBand?.space125KHz, VN_REGION_DEFAULT.space125KHz));
    }
  };
  const handleSetRegion = () => {
    if (regionSelection === 'Custom') {
      if (customRegionError) return;
      return bleService.setCustomRegion(customStartKHz, customCount, customSpace, saveRegion);
    }

    return bleService.setRegion(regionSelection, saveRegion);
  };
  const tagFocusIndicatorStyle: React.CSSProperties = {
    width: 'calc((100% - 0.5rem) / 2)',
    transform: tagFocus ? 'translateX(100%)' : 'translateX(0)',
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

  const runSettingsAction = async (actionKey: string, action: SettingsAction) => {
    if (!isConnected || isBusy || inFlightRef.current) return;
    inFlightRef.current = true;
    setActionPending(true); setActionError(''); markActionPressed(actionKey);
    try { await action(); } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Device command failed.');
    } finally { inFlightRef.current = false; setActionPending(false); }
  };
  const getSettingsActionHandlers = (actionKey: string, action: SettingsAction) => ({
    onClick: () => void runSettingsAction(actionKey, action),
  });

  const ActionRow = ({
    id,
    onGet,
    onSet,
    setDisabled = false,
  }: {
    id: string;
    onGet: SettingsAction;
    onSet: SettingsAction;
    setDisabled?: boolean;
  }) => (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <Button
        {...getSettingsActionHandlers(`${id}:get`, onGet)}
        disabled={!isConnected}
        variant="secondary"
        size="sm"
        className={`${COMPACT_BUTTON_CLASS} touch-manipulation ${
          activeActionKey === `${id}:get` ? 'bg-white/95 text-slate-800  brightness-[1.07]' : ''
        }`}
      >
        Read
      </Button>
      <Button
        {...getSettingsActionHandlers(`${id}:set`, onSet)}
        disabled={!isConnected || setDisabled}
        variant="primary"
        size="sm"
        className={`${COMPACT_BUTTON_CLASS} touch-manipulation ${
          activeActionKey === `${id}:set` ? ' brightness-[1.1] saturate-[1.18]' : ''
        }`}
      >
        Apply
      </Button>
    </div>
  );

  return (
    <div className="page-content">
      <PageHeader
        icon={SlidersHorizontal}
        title="Device settings"
        subtitle="Read current values, adjust RF parameters, then apply them to your reader."
        meta={<span className={`rounded-full border px-2 py-0.5 text-xs font-normal ${isConnected ? 'border-[#34C759]/35 bg-[#34C759]/10 text-[#248A3D]' : 'border-[#FF9500]/35 bg-[#FF9500]/10 text-[#A45A00]'}`}>{isConnected ? 'Device online' : 'Offline · controls locked'}</span>}
      />

      <p className="text-sm leading-6 text-slate-500">Read retrieves the current value. Apply sends a change to the reader. Save configuration keeps the applied RF settings after a restart.</p>
      {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}
      <fieldset disabled={!isConnected || isBusy || actionPending} aria-label="Device configuration" className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-2">
        <SettingsCard actionId="power" activeActionKey={activeActionKey} title="Power" subtitle="RF output">
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              aria-label="Decrease RF power" onClick={() => adjustPower(-1)}
              className="h-11 w-11 rounded-md border border-[#2563eb]/22 bg-white/54 text-xl font-semibold text-slate-700 shadow-sm transition-colors hover:bg-white/82 sm:h-10 sm:w-10"
            >
              -
            </button>
            <div className="min-w-[104px] rounded-lg border border-[#2563eb]/18 bg-white/48 px-3 py-2 text-center">
              <div className="font-mono text-3xl font-bold text-slate-800">{power}</div>
              <div className="text-sm font-medium text-[#64748b]">dBm</div>
            </div>
            <button
              type="button"
              aria-label="Increase RF power" onClick={() => adjustPower(1)}
              className="h-11 w-11 rounded-md border border-[#2563eb]/22 bg-white/54 text-xl font-semibold text-slate-700 shadow-sm transition-colors hover:bg-white/82 sm:h-10 sm:w-10"
            >
              +
            </button>
          </div>
          <ActionRow id="power" onGet={handleGetPower} onSet={handleSetPower} />
        </SettingsCard>

        <SettingsCard
          actionId="device-name"
          activeActionKey={activeActionKey}
          title="Bluetooth Device Name"
          subtitle="GAP + advertising · persistent"
          className=""
        >
          <div>
            <FieldLabel>Name</FieldLabel>
            <input
              type="text"
              id="setting-name" value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              aria-invalid={!deviceNameValidation.valid}
              autoComplete="off"
              spellCheck={false}
              className={`${FIELD_CLASS} font-mono ${!deviceNameValidation.valid ? 'border-[#FF3B30]/60' : ''}`}
            />
            <div className="mt-1.5 flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-xs font-semibold">
              <span className={deviceNameValidation.valid ? 'text-[#527176]' : 'text-[#C32118]'}>
                {deviceNameValidation.error ?? 'Applied after disconnect and the next advertising cycle'}
              </span>
              <span className={`shrink-0 font-mono ${deviceNameValidation.byteLength > BLE_DEVICE_NAME_MAX_BYTES ? 'text-[#C32118]' : 'text-[#527176]'}`}>
                {deviceNameValidation.byteLength}/{BLE_DEVICE_NAME_MAX_BYTES} UTF-8 bytes
              </span>
            </div>
          </div>
          <ActionRow
            id="device-name"
            onGet={handleGetDeviceName}
            onSet={handleSetDeviceName}
            setDisabled={!deviceNameValidation.valid}
          />
        </SettingsCard>

        <SettingsCard
          actionId="profile"
          activeActionKey={activeActionKey}
          title="RF Link Profile"
          subtitle="Backscatter link"
          className=""
        >
          <SelectField
            id="profile"
            value={profile}
            options={PROFILE_SELECT_OPTIONS}
            onChange={setProfile}
          />
          <ActionRow id="profile" onGet={handleGetProfile} onSet={handleSetProfile} />
        </SettingsCard>

        <SettingsCard
          actionId="q-session"
          activeActionKey={activeActionKey}
          title="EPC Gen2"
          subtitle="Q and session"
          className=""
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
        </SettingsCard>

        <SettingsCard actionId="tag-focus" activeActionKey={activeActionKey} title="Tag Focus" subtitle="Singulation assist">
          <div className="soft-surface relative grid grid-cols-2 rounded-md border border-[#2563eb]/24 p-1">
            <span
              aria-hidden="true"
              className="absolute bottom-1 left-1 top-1 rounded bg-[#eff6ff]/95  ring-1 ring-[#2563eb]/45 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={tagFocusIndicatorStyle}
            />
            {[
              { label: 'OFF', value: false },
              { label: 'ON', value: true },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                aria-pressed={tagFocus === item.value} onClick={() => setTagFocus(item.value)}
                className={`relative z-10 h-10 rounded text-xs font-bold transition-colors sm:h-9 ${
                  tagFocus === item.value ? 'text-slate-800' : 'text-[#64748b] hover:text-slate-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <ActionRow id="tag-focus" onGet={handleGetTagFocus} onSet={handleSetTagFocus} />
        </SettingsCard>

        <SettingsCard
          actionId="region-band"
          activeActionKey={activeActionKey}
          title="RFID Region Band"
          subtitle="Reader frequency plan"
          className="xl:col-span-2"
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_104px]">
            <div>
              <FieldLabel>Region</FieldLabel>
              <RegionSelectField
                value={regionSelection}
                onChange={handleRegionChange}
              />
            </div>
            <div className="flex items-end">
              <label className="soft-surface flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-[#2563eb]/20 bg-white/58 px-2 text-xs font-bold text-[#52666B] sm:h-9">
                <input
                  type="checkbox"
                  checked={saveRegion}
                  onChange={(event) => setSaveRegion(event.target.checked)}
                  className="h-4 w-4 accent-[#2563eb]"
                />
                Save
              </label>
            </div>
          </div>

          {regionSelection === 'Custom' && (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_90px_minmax(0,1fr)]">
              <div>
                <FieldLabel>Start Freq, kHz</FieldLabel>
                <input
                  type="number"
                  min={REGION_MIN_KHZ}
                  max={REGION_MAX_KHZ}
                  id="setting-start-freq-khz" value={customStartKHz}
                  onChange={(event) => setCustomStartKHz(normalizeRegionNumber(event.target.value, 0))}
                  className={`${FIELD_CLASS} text-right font-mono ${customRegionError && (customStartKHz < REGION_MIN_KHZ || customStartKHz > REGION_MAX_KHZ) ? 'border-[#FF3B30]/60' : ''}`}
                />
              </div>
              <div>
                <FieldLabel>Count</FieldLabel>
                <input
                  type="number"
                  min={1}
                  max={255}
                  id="setting-count" value={customCount}
                  onChange={(event) => setCustomCount(normalizeRegionNumber(event.target.value, 1))}
                  className={`${FIELD_CLASS} text-right font-mono ${customRegionError && (customCount < 1 || customCount > 255) ? 'border-[#FF3B30]/60' : ''}`}
                />
              </div>
              <div>
                <FieldLabel>Space</FieldLabel>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={255}
                    id="setting-space" value={customSpace}
                    onChange={(event) => setCustomSpace(normalizeRegionNumber(event.target.value, 1))}
                    className={`${FIELD_CLASS} text-right font-mono ${customRegionError && (customSpace < 1 || customSpace > 255) ? 'border-[#FF3B30]/60' : ''}`}
                  />
                  <span className="shrink-0 text-xs font-bold text-[#64748b]">x125 kHz</span>
                </div>
              </div>
              <p className={`font-mono text-xs font-bold sm:col-span-3 ${customRegionError ? 'text-[#C32118]' : 'text-slate-800'}`}>
                {customRegionError || `End ${customEndKHz} kHz (${formatFrequencyMHz(customEndKHz)}), step ${customStepKHz} kHz`}
              </p>
            </div>
          )}

          <ActionRow
            id="region-band"
            onGet={handleGetRegion}
            onSet={handleSetRegion}
            setDisabled={regionSelection === 'Custom' && Boolean(customRegionError)}
          />
        </SettingsCard>

        <SettingsCard
          actionId="query-params"
          activeActionKey={activeActionKey}
          title="Query Parameter"
          subtitle="Inventory timing"
          className="xl:col-span-2"
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
        </SettingsCard>

        <section className="soft-glass rounded-lg p-3 xl:col-span-2">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">Save Configuration</h3>
              <p className="mt-0.5 text-xs font-normal text-[#64748b]">Persist current settings to device memory</p>
            </div>
            <Button onClick={() => setConfirmSave(true)} disabled={!isConnected} title={!isConnected ? 'Connect the NHR-10 before saving configuration' : undefined} variant="primary" size="md" className="h-10 w-full font-bold tracking-wide md:h-9 md:w-auto md:min-w-[220px]">
              Save configuration
            </Button>
          </div>
          {confirmSave && (
            <div role="alertdialog" aria-labelledby="confirm-save-title" className="mt-3 flex flex-col gap-3 rounded-lg border border-[#FF9500]/35 bg-[#FFF7E8] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#C56A00]" />
                <div>
                  <h4 id="confirm-save-title" className="text-xs font-bold text-[#7A3F00]">Persist current configuration?</h4>
                  <p className="mt-0.5 text-xs font-medium leading-4 text-[#8A5A24]">This overwrites the configuration stored in device flash.</p>
                </div>
              </div>
              <div className="flex gap-2 sm:shrink-0">
                <Button variant="outline" size="sm" onClick={() => setConfirmSave(false)} className="h-9 flex-1 sm:min-w-[90px]">Cancel</Button>
                <Button variant="danger" size="sm" onClick={() => { void runSettingsAction('config:save', onSaveConfig); setConfirmSave(false); }} className="h-9 flex-1 sm:min-w-[130px]">Confirm save</Button>
              </div>
            </div>
          )}
        </section>
      </fieldset>
    </div>
  );
};
