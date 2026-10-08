import { LIMITS } from '../data/limits';
import { COPPER_TUBES } from '../data/pipes';
import { PANEL_SIZES, PITCHES } from '../data/ceiling';
import { defaultAdvanced, type AdvancedConfig, type KlimaatplafondConfig } from '../model/config';
import { FIELD_INFO } from '../texts';
import { useStore } from '../store';
import { Accordion, CheckField, NumField, NumInput, SegField, SelectField } from './fields';
import { ValveCard } from './ValveCard';
import s from './ui.module.css';

type AdvKey = string[];

interface AdvDef {
  path: AdvKey;
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  scale?: number;
  info?: string;
}

const ADV_GROUPS: { title: string; fields: AdvDef[] }[] = [
  {
    title: 'Plafondkarakteristiek q = f_s · K · ΔT^n',
    fields: [
      { path: ['charKoelen', 'K'], label: 'K koelen', min: 1, max: 50, step: 0.1 },
      { path: ['charKoelen', 'n'], label: 'n koelen', min: 0.8, max: 1.5, step: 0.01 },
      { path: ['charVerwarmen', 'K'], label: 'K verwarmen', min: 1, max: 50, step: 0.1 },
      { path: ['charVerwarmen', 'n'], label: 'n verwarmen', min: 0.8, max: 1.5, step: 0.01 },
      { path: ['fs', '75'], label: 'f_s steek 75', min: 0.5, max: 1.5, step: 0.01 },
      { path: ['fs', '100'], label: 'f_s steek 100', min: 0.5, max: 1.5, step: 0.01 },
      { path: ['fs', '150'], label: 'f_s steek 150', min: 0.5, max: 1.5, step: 0.01 },
    ],
  },
  {
    title: 'Warmteoverdracht',
    fields: [
      {
        path: ['rCond'],
        label: 'R_cond (buis → plaat)',
        unit: 'm²K/W',
        min: 0,
        max: 0.1,
        step: 0.001,
        info: 'Geleidingsweerstand van buis naar plaatoppervlak.',
      },
      {
        path: ['reRef'],
        label: 'Re_ref karakteristiek',
        min: 2500,
        max: 20000,
        step: 100,
        info: 'Reynoldsgetal waarbij de karakteristiek is gemeten.',
      },
    ],
  },
  {
    title: 'Weerstanden en ruwheid',
    fields: [
      { path: ['zetaBend'], label: 'ζ per 180°-bocht', min: 0, max: 5, step: 0.05 },
      { path: ['hoseLength'], label: 'Koppelslang lengte', unit: 'm', min: 0.05, max: 3, step: 0.05 },
      { path: ['zetaHose'], label: 'ζ per koppeling', min: 0, max: 5, step: 0.1 },
      { path: ['zetaT'], label: 'ζ per T-stuk', min: 0, max: 5, step: 0.1 },
      { path: ['epsCopper'], label: 'Ruwheid koper', unit: 'mm', min: 0, max: 1, step: 0.0005 },
      { path: ['epsMulti'], label: 'Ruwheid meerlagenbuis', unit: 'mm', min: 0, max: 1, step: 0.001 },
    ],
  },
  {
    title: 'Paneel, last en zones',
    fields: [
      { path: ['cPanel'], label: 'C_paneel', unit: 'kJ/(m²K)', min: 0.5, max: 50, step: 0.5 },
      {
        path: ['tOutDesign'],
        label: 'Ontwerp-buitentemp. verwarmen',
        unit: '°C',
        min: -30,
        max: 10,
        step: 1,
      },
      { path: ['hK'], label: 'Transmissie koelen h_k', unit: 'W/(m²K)', min: 0, max: 10, step: 0.1 },
      { path: ['hZone'], label: 'Koppeling zones H_z', unit: 'W/K', min: 0, max: 5000, step: 10 },
    ],
  },
  {
    title: 'Klepdynamiek',
    fields: [
      { path: ['valveB', 'runtime90'], label: 'Type B: looptijd 90°', unit: 's', min: 10, max: 600, step: 5 },
      { path: ['valveB', 'nGl'], label: 'Type B: n_gl', min: 1, max: 6, step: 0.1 },
      {
        path: ['valveA', 'switchTime'],
        label: 'Type A: omschakeltijd',
        unit: 's',
        min: 5,
        max: 300,
        step: 5,
      },
      {
        path: ['valveA', 'picvStroke'],
        label: 'Type A: PICV volle slag',
        unit: 's',
        min: 10,
        max: 600,
        step: 5,
      },
    ],
  },
  {
    title: 'Kalibratie op de referentieberekening',
    fields: [
      {
        path: ['netFactor'],
        label: 'Strengdrukval in netwerk',
        min: 0.3,
        max: 1.5,
        step: 0.01,
        info: 'Factor op de strengdrukval binnen het netwerk (circuitdrukval en verdeling). 0,75 reproduceert de referentiewaarden (S1, S5, S6); 1,0 gebruikt exact dezelfde strengdrukval als de puzzelmatrix.',
      },
      {
        path: ['tauFactor'],
        label: 'Paneel-tijdconstante',
        min: 0.1,
        max: 2,
        step: 0.05,
        info: 'Factor op τ = C_paneel·R_char(8 K) + verblijftijd. 0,5 reproduceert de referentiedynamiek; 1,0 is de letterlijke formule (verwarmen is dan zwak gedempt).',
      },
    ],
  },
  {
    title: 'Grenswaarden meldingen',
    fields: [
      { path: ['limits', 'vMin'], label: 'v min', unit: 'm/s', min: 0, max: 2, step: 0.05 },
      { path: ['limits', 'vMax'], label: 'v max', unit: 'm/s', min: 0.2, max: 3, step: 0.05 },
      { path: ['limits', 'reLaminar'], label: 'Re laminair', min: 500, max: 5000, step: 50 },
      { path: ['limits', 'reTransition'], label: 'Re overgang', min: 1000, max: 10000, step: 100 },
      { path: ['limits', 'dtMinCool'], label: 'ΔT min koelen', unit: 'K', min: 0.5, max: 6, step: 0.5 },
      { path: ['limits', 'dtMinHeat'], label: 'ΔT min verwarmen', unit: 'K', min: 0.5, max: 10, step: 0.5 },
      {
        path: ['limits', 'exhaustedDt'],
        label: 'Uitgeputte streng (W07)',
        unit: 'K',
        min: 0.1,
        max: 5,
        step: 0.1,
      },
      {
        path: ['limits', 'maldistWarn'],
        label: 'Ongelijkheid waarschuwing',
        unit: '%',
        min: 1,
        max: 100,
        step: 1,
        scale: 100,
      },
      {
        path: ['limits', 'maldistInfo'],
        label: 'Ongelijkheid info',
        unit: '%',
        min: 1,
        max: 100,
        step: 1,
        scale: 100,
      },
      { path: ['limits', 'dewMargin'], label: 'Marge boven dauwpunt', unit: 'K', min: 0, max: 5, step: 0.5 },
      {
        path: ['limits', 'ceilingMaxHeat'],
        label: 'Plafond max. verwarmen',
        unit: '°C',
        min: 25,
        max: 45,
        step: 1,
      },
      { path: ['limits', 'kvRatioMin'], label: 'Kv/Kvs min (W12)', min: 0.05, max: 0.8, step: 0.05 },
      {
        path: ['limits', 'feasibleFraction'],
        label: 'Haalbaar debiet (W02)',
        unit: '%',
        min: 50,
        max: 100,
        step: 1,
        scale: 100,
      },
      { path: ['limits', 'maxDpB'], label: 'Max. Δp Type B', unit: 'kPa', min: 10, max: 1000, step: 10 },
      { path: ['limits', 'maxDpA'], label: 'Max. Δp Type A', unit: 'kPa', min: 10, max: 1000, step: 10 },
      {
        path: ['limits', 'occupancy'],
        label: 'Bezetting (I02)',
        unit: '%',
        min: 10,
        max: 100,
        step: 1,
        scale: 100,
      },
    ],
  },
];

function getPath(obj: unknown, path: AdvKey): number {
  return path.reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj) as number;
}

function setPath(adv: AdvancedConfig, path: AdvKey, value: number): AdvancedConfig {
  const next = JSON.parse(JSON.stringify(adv)) as Record<string, unknown>;
  let o = next;
  for (let i = 0; i < path.length - 1; i++) o = o[path[i]] as Record<string, unknown>;
  o[path[path.length - 1]] = value;
  return next as unknown as AdvancedConfig;
}

export function SettingsPanel() {
  const config = useStore((st) => st.config);
  const setConfig = useStore((st) => st.setConfig);
  const setValveCount = useStore((st) => st.setValveCount);
  const set = (patch: Partial<KlimaatplafondConfig>): void => setConfig((c) => ({ ...c, ...patch }));

  return (
    <section aria-label="Instellingen" className="noPrint">
      <Accordion title="Ruimte en last" open>
        <NumField
          label={FIELD_INFO.floorArea.label}
          info={FIELD_INFO.floorArea.info}
          value={config.floorArea}
          {...LIMITS.floorArea}
          unit="m²"
          onChange={(floorArea) => set({ floorArea })}
        />
        <NumField
          label={FIELD_INFO.heatLoss.label}
          info={FIELD_INFO.heatLoss.info}
          value={config.heatLoss}
          {...LIMITS.heatLoss}
          unit="W"
          onChange={(heatLoss) => set({ heatLoss })}
        />
        <p className={s.hint} style={{ margin: '-6px 0 0' }}>
          {(config.heatLoss / config.floorArea).toFixed(1).replace('.', ',')} W/m²
        </p>
        <NumField
          label={FIELD_INFO.coolLoad.label}
          info={FIELD_INFO.coolLoad.info}
          value={config.coolLoad}
          {...LIMITS.coolLoad}
          unit="W"
          onChange={(coolLoad) => set({ coolLoad })}
        />
        <p className={s.hint} style={{ margin: '-6px 0 0' }}>
          {(config.coolLoad / config.floorArea).toFixed(1).replace('.', ',')} W/m²
        </p>
        <SegField
          label={FIELD_INFO.mass.label}
          info={FIELD_INFO.mass.info}
          value={config.mass}
          options={[
            { value: 'licht', label: 'Licht' },
            { value: 'middel', label: 'Middel' },
            { value: 'zwaar', label: 'Zwaar' },
          ]}
          onChange={(mass) => set({ mass })}
        />
        <NumField
          label={FIELD_INFO.rh.label}
          info={FIELD_INFO.rh.info}
          value={config.rh}
          {...LIMITS.rh}
          unit="%"
          onChange={(rh) => set({ rh })}
        />
        <CheckField
          label="Starttemperatuur automatisch (setpoint ∓ 3 K)"
          info={FIELD_INFO.startTemp.info}
          checked={config.startTemp === null}
          onChange={(auto) => set({ startTemp: auto ? null : config.setCool + 3 })}
        />
        {config.startTemp !== null && (
          <NumField
            label="Starttemperatuur"
            value={config.startTemp}
            {...LIMITS.startTemp}
            unit="°C"
            onChange={(startTemp) => set({ startTemp })}
          />
        )}
        <CheckField
          label="Huidige temperatuur behouden bij wijzigingen"
          checked={config.keepCurrent}
          onChange={(keepCurrent) => set({ keepCurrent })}
        />
      </Accordion>

      <Accordion title="Watertemperaturen en setpoints" open>
        <div className={s.fieldRow}>
          <NumField
            label={FIELD_INFO.tSupplyCool.label}
            info={FIELD_INFO.tSupplyCool.info}
            value={config.tSupplyCool}
            {...LIMITS.tSupplyCool}
            unit="°C"
            onChange={(tSupplyCool) => set({ tSupplyCool })}
          />
          <NumField
            label={FIELD_INFO.tSupplyHeat.label}
            info={FIELD_INFO.tSupplyHeat.info}
            value={config.tSupplyHeat}
            {...LIMITS.tSupplyHeat}
            unit="°C"
            onChange={(tSupplyHeat) => set({ tSupplyHeat })}
          />
          <NumField
            label={FIELD_INFO.dtCool.label}
            info={FIELD_INFO.dtCool.info}
            value={config.dtCool}
            {...LIMITS.dtCool}
            unit="K"
            onChange={(dtCool) => set({ dtCool })}
          />
          <NumField
            label={FIELD_INFO.dtHeat.label}
            info={FIELD_INFO.dtHeat.info}
            value={config.dtHeat}
            {...LIMITS.dtHeat}
            unit="K"
            onChange={(dtHeat) => set({ dtHeat })}
          />
          <NumField
            label={FIELD_INFO.setHeat.label}
            info={FIELD_INFO.setHeat.info}
            value={config.setHeat}
            {...LIMITS.setHeat}
            unit="°C"
            onChange={(setHeat) => set({ setHeat })}
          />
          <NumField
            label={FIELD_INFO.setCool.label}
            info={FIELD_INFO.setCool.info}
            value={config.setCool}
            min={Math.max(LIMITS.setCool.min, config.setHeat + 1)}
            max={LIMITS.setCool.max}
            step={LIMITS.setCool.step}
            unit="°C"
            onChange={(setCool) => set({ setCool })}
          />
        </div>
        <p className={s.hint} style={{ margin: 0 }}>
          Setpoint koelen ≥ setpoint verwarmen + 1 K (dode zone).
        </p>
      </Accordion>

      <Accordion title="Plafond" open>
        <SelectField
          label={FIELD_INFO.panelSize.label}
          info={FIELD_INFO.panelSize.info}
          value={config.panelSize}
          options={(Object.keys(PANEL_SIZES) as (keyof typeof PANEL_SIZES)[]).map((k) => ({
            value: k,
            label: PANEL_SIZES[k].label,
          }))}
          onChange={(panelSize) => set({ panelSize })}
        />
        <SegField
          label={FIELD_INFO.pitch.label}
          info={FIELD_INFO.pitch.info}
          value={config.pitch}
          options={PITCHES.map((p) => ({ value: p, label: `${p} mm` }))}
          onChange={(pitch) => set({ pitch })}
        />
        <SelectField
          label={FIELD_INFO.tube.label}
          info={FIELD_INFO.tube.info}
          value={config.tube}
          options={COPPER_TUBES.map((t) => ({ value: t.id as typeof config.tube, label: t.label }))}
          onChange={(tube) => set({ tube })}
        />
      </Accordion>

      <Accordion title="Kleppen, zones en hydrauliek" open>
        <SegField
          label={FIELD_INFO.valveCount.label}
          info={FIELD_INFO.valveCount.info}
          value={config.valveCount}
          options={[
            { value: 1 as const, label: '1' },
            { value: 2 as const, label: '2' },
            { value: 3 as const, label: '3' },
          ]}
          onChange={setValveCount}
        />
        <div className={s.fieldRow}>
          <NumField
            label={FIELD_INFO.dpAvailable.label}
            info={FIELD_INFO.dpAvailable.info}
            value={config.dpAvailable}
            {...LIMITS.dpAvailable}
            unit="kPa"
            onChange={(dpAvailable) => set({ dpAvailable })}
          />
          <NumField
            label={FIELD_INFO.dpMax.label}
            info={FIELD_INFO.dpMax.info}
            value={config.dpMax}
            {...LIMITS.dpMax}
            unit="kPa"
            onChange={(dpMax) => set({ dpMax })}
          />
        </div>
        {config.valves.map((_, i) => (
          <ValveCard key={i} index={i} />
        ))}
      </Accordion>

      <Accordion title="Regeling en simulatie" open>
        <CheckField
          label={FIELD_INFO.dewProtection.label}
          info={FIELD_INFO.dewProtection.info}
          checked={config.dewProtection}
          onChange={(dewProtection) => set({ dewProtection })}
        />
        <div className={s.fieldRow}>
          <NumField
            label={FIELD_INFO.Kp.label}
            info={FIELD_INFO.Kp.info}
            value={config.Kp}
            {...LIMITS.Kp}
            unit="/K"
            onChange={(Kp) => set({ Kp })}
          />
          <NumField
            label={FIELD_INFO.Ti.label}
            info={FIELD_INFO.Ti.info}
            value={config.Ti}
            {...LIMITS.Ti}
            unit="s"
            onChange={(Ti) => set({ Ti })}
          />
        </div>
        <SegField
          label={FIELD_INFO.flowChar.label}
          info={FIELD_INFO.flowChar.info}
          value={config.flowChar}
          options={[
            { value: 'gelijkprocentig', label: 'Gelijkprocentig' },
            { value: 'lineair', label: 'Lineair' },
          ]}
          onChange={(flowChar) => set({ flowChar })}
        />
        <SegField
          label={FIELD_INFO.speed.label}
          info={FIELD_INFO.speed.info}
          value={config.speed}
          options={[
            { value: 1 as const, label: '1×' },
            { value: 10 as const, label: '10×' },
            { value: 60 as const, label: '60×' },
            { value: 300 as const, label: '300×' },
          ]}
          onChange={(speed) => set({ speed })}
        />
      </Accordion>

      <Accordion title="Geavanceerd">
        <div>
          <button
            type="button"
            className={`${s.btn} ${s.btnSmall}`}
            onClick={() => set({ advanced: defaultAdvanced() })}
          >
            Standaardwaarden herstellen
          </button>
        </div>
        <SegField
          label="Lastverdeling over zones"
          value={config.advanced.loadSplit}
          options={[
            { value: 'panels', label: 'Naar panelen' },
            { value: 'manual', label: 'Handmatig' },
          ]}
          onChange={(loadSplit) => set({ advanced: { ...config.advanced, loadSplit } })}
        />
        {ADV_GROUPS.map((g) => (
          <fieldset
            key={g.title}
            style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px 10px', margin: 0 }}
          >
            <legend style={{ fontSize: '0.82rem', fontWeight: 600, padding: '0 4px' }}>{g.title}</legend>
            <div className={s.fieldRow}>
              {g.fields.map((f) => {
                const sc = f.scale ?? 1;
                return (
                  <NumInput
                    key={f.path.join('.')}
                    label={f.label}
                    info={f.info}
                    unit={f.unit}
                    value={getPath(config.advanced, f.path) * sc}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    onChange={(x) => set({ advanced: setPath(config.advanced, f.path, x / sc) })}
                  />
                );
              })}
            </div>
          </fieldset>
        ))}
      </Accordion>
    </section>
  );
}
