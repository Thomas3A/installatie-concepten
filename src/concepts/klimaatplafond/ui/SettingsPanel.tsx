import { LIMITS } from '../data/limits';
import { COPPER_TUBES } from '../data/pipes';
import { PANEL_SIZES, PITCHES } from '../data/ceiling';
import { defaultAdvanced, type KlimaatplafondConfig } from '../model/config';
import { FIELD_INFO } from '../texts';
import { useStore } from '../store';
import { Accordion, CheckField, NumField, NumInput, SegField, SelectField } from './fields';
import { ADV_GROUPS, setPath, getPath } from './advancedFields';
import { ValveCard } from './ValveCard';
import s from './ui.module.css';

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
