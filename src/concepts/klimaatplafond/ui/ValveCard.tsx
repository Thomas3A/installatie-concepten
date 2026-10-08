import { fmt } from '../../../core/format';
import { LIMITS } from '../data/limits';
import { PICVS, TYPE_B, picvsForDn, type Dn } from '../data/valves';
import { DIST_PIPES } from '../data/pipes';
import { FIELD_INFO } from '../texts';
import { useStore } from '../store';
import { CheckField, NumField, NumInput, SegField, SelectField } from './fields';
import { StrandEditor } from './StrandEditor';
import s from './ui.module.css';

export function ValveCard({ index }: { index: number }) {
  const config = useStore((st) => st.config);
  const design = useStore((st) => st.design);
  const patch = useStore((st) => st.patchValve);
  const applyAdvice = useStore((st) => st.applyAdvice);
  const v = config.valves[index];
  const vd = design.valves[index];
  const auto = v.coupling === 'auto';
  const kvOptions = TYPE_B.kvs[v.dn].map((k) => ({ value: k, label: fmt(k, 2) }));
  const picvOptions = picvsForDn(v.dn).map((p) => ({ value: p.id, label: p.label }));

  const sameAdvice =
    vd &&
    (v.type === 'B'
      ? v.kvsKoelen === vd.advice.b.kvs.koelen && v.kvsVerwarmen === vd.advice.b.kvs.verwarmen
      : v.picv === vd.advice.a.picv);

  return (
    <div className={s.valveCard} role="group" aria-label={`Klep ${index + 1}`}>
      <h4>Klep {index + 1}</h4>
      <div className={s.fieldRow}>
        <SegField
          label="Kleptype"
          info={FIELD_INFO.type.info}
          value={v.type}
          options={[
            { value: 'A', label: 'Type A' },
            { value: 'B', label: 'Type B' },
          ]}
          onChange={(type) => patch(index, { type, kvsKoelen: null, kvsVerwarmen: null, picv: null })}
        />
        <SegField
          label="DN"
          info={FIELD_INFO.dn.info}
          value={v.dn}
          options={[
            { value: 15 as Dn, label: '15' },
            { value: 20 as Dn, label: '20' },
          ]}
          onChange={(dn) => patch(index, { dn, kvsKoelen: null, kvsVerwarmen: null, picv: null })}
        />
      </div>

      {v.type === 'B' ? (
        <div className={s.fieldRow}>
          <SelectField
            label="Kvs koelen (m³/h)"
            info={FIELD_INFO.kvs.info}
            value={vd?.kvs.koelen ?? v.kvsKoelen ?? kvOptions[0].value}
            options={kvOptions}
            onChange={(x) => patch(index, { kvsKoelen: x })}
          />
          <SelectField
            label="Kvs verwarmen (m³/h)"
            info={FIELD_INFO.kvs.info}
            value={vd?.kvs.verwarmen ?? v.kvsVerwarmen ?? kvOptions[0].value}
            options={kvOptions}
            onChange={(x) => patch(index, { kvsVerwarmen: x })}
          />
        </div>
      ) : (
        <SelectField
          label="PICV-uitvoering"
          info={FIELD_INFO.picv.info}
          value={vd?.picv.id ?? v.picv ?? PICVS[1].id}
          options={picvOptions}
          onChange={(x) => patch(index, { picv: x })}
        />
      )}

      {vd && (
        <div className={s.advice} aria-live="polite">
          {v.type === 'B' ? (
            <span>
              Advies:{' '}
              {(['koelen', 'verwarmen'] as const)
                .map((m) => {
                  const k = vd.advice.b.kvs[m];
                  return k === null
                    ? `Kvs ${m}: geen passende Kvs (Kv nodig ${fmt(vd.advice.b.kvNodig[m], 2)}; Δp te laag)`
                    : `Kvs ${m} ${fmt(k, 2).replace(/,00$/, '')}`;
                })
                .join(' · ')}
              {vd.advice.b.suggestDn20 ? ' (DN20)' : ''}
              {vd.advice.b.opening.koelen !== null &&
                ` · opening bij Vmax ≈ ${fmt((vd.advice.b.opening.koelen ?? 0) * 100, 0)} %`}
            </span>
          ) : (
            <span>
              Advies: {vd.advice.a.picv ?? 'geen passende PICV'} · benodigd Δp {fmt(vd.advice.a.dpNeeded, 1)}{' '}
              kPa {vd.advice.a.ok ? '≤' : '>'} beschikbaar {fmt(vd.dpAvail / 1000, 1)} kPa
            </span>
          )}
          <button
            type="button"
            className={`${s.btn} ${s.btnSmall}`}
            disabled={!!sameAdvice}
            onClick={() => {
              if (v.type === 'B' && vd.advice.b.suggestDn20 && v.dn === 15)
                patch(index, { dn: 20, kvsKoelen: null, kvsVerwarmen: null, picv: null });
              else applyAdvice(index);
            }}
          >
            Advies toepassen
          </button>
        </div>
      )}

      <NumField
        label={FIELD_INFO.panelCount.label}
        info={FIELD_INFO.panelCount.info}
        value={v.panelCount}
        min={LIMITS.panelCount.min}
        max={LIMITS.panelCount.max}
        disabled={!auto}
        onChange={(x) => patch(index, { panelCount: x })}
      />
      <SegField
        label={FIELD_INFO.coupling.label}
        info={FIELD_INFO.coupling.info}
        value={v.coupling}
        options={[
          { value: 'auto', label: 'Automatisch' },
          { value: 'manual', label: 'Handmatig' },
        ]}
        onChange={(coupling) => {
          if (coupling === 'manual' && vd) {
            patch(index, {
              coupling,
              manualStrands: vd.strands.map((x) => ({ panels: x.panels, extraLength: x.extraLength })),
            });
          } else patch(index, { coupling });
        }}
      />
      {v.coupling === 'manual' && <StrandEditor valve={index} strands={v.manualStrands} />}
      {auto && vd && (
        <p className={s.hint} style={{ margin: 0 }}>
          Gekozen: {vd.strands.length} × {vd.strands[0]?.panels}
          {vd.strands.some((x) => x.panels !== vd.strands[0].panels)
            ? ` (${vd.strands.map((x) => x.panels).join('·')})`
            : ''}{' '}
          panelen per streng.
        </p>
      )}

      <CheckField
        label="Vmax automatisch (Σ ontwerpdebieten)"
        info={FIELD_INFO.vmax.info}
        checked={v.vmaxAuto}
        onChange={(vmaxAuto) => patch(index, { vmaxAuto })}
      />
      {!v.vmaxAuto && (
        <div className={s.fieldRow}>
          <NumInput
            label="Vmax koelen"
            value={v.vmaxKoelen}
            min={LIMITS.vmax.min}
            max={LIMITS.vmax.max}
            step={5}
            unit="l/h"
            onChange={(x) => patch(index, { vmaxKoelen: x })}
          />
          <NumInput
            label="Vmax verwarmen"
            value={v.vmaxVerwarmen}
            min={LIMITS.vmax.min}
            max={LIMITS.vmax.max}
            step={5}
            unit="l/h"
            onChange={(x) => patch(index, { vmaxVerwarmen: x })}
          />
        </div>
      )}
      {vd && v.vmaxAuto && (
        <p className={s.hint} style={{ margin: 0 }}>
          Vmax koelen {fmt(vd.modes.koelen.vmax * 3.6e6, 0)} l/h · verwarmen{' '}
          {fmt(vd.modes.verwarmen.vmax * 3.6e6, 0)} l/h
        </p>
      )}

      {v.type === 'B' && (
        <>
          <CheckField
            label="ΔT-manager"
            info={FIELD_INFO.dtManager.info}
            checked={v.dtManager}
            onChange={(dtManager) => patch(index, { dtManager })}
          />
          {v.dtManager && (
            <div className={s.fieldRow}>
              <NumInput
                label="ΔT min koelen"
                value={v.dtMinKoelen}
                min={LIMITS.dtMinCool.min}
                max={LIMITS.dtMinCool.max}
                step={0.5}
                unit="K"
                onChange={(x) => patch(index, { dtMinKoelen: x })}
              />
              <NumInput
                label="ΔT min verwarmen"
                value={v.dtMinVerwarmen}
                min={LIMITS.dtMinHeat.min}
                max={LIMITS.dtMinHeat.max}
                step={0.5}
                unit="K"
                onChange={(x) => patch(index, { dtMinVerwarmen: x })}
              />
            </div>
          )}
        </>
      )}

      <SelectField
        label={FIELD_INFO.distPipe.label}
        info={FIELD_INFO.distPipe.info}
        value={v.distPipe}
        options={DIST_PIPES.map((p) => ({ value: p.id as typeof v.distPipe, label: p.label }))}
        onChange={(distPipe) => patch(index, { distPipe })}
      />
      <div className={s.fieldRow}>
        <NumInput
          label="Klep → 1e streng"
          info={FIELD_INFO.distanceFirst.info}
          value={v.distanceFirst}
          min={LIMITS.distanceFirst.min}
          max={LIMITS.distanceFirst.max}
          step={0.5}
          unit="m"
          onChange={(x) => patch(index, { distanceFirst: x })}
        />
        <NumInput
          label="Hart-op-hart"
          info={FIELD_INFO.spacing.info}
          value={v.spacing}
          min={LIMITS.spacing.min}
          max={LIMITS.spacing.max}
          step={0.1}
          unit="m"
          onChange={(x) => patch(index, { spacing: x })}
        />
      </div>
      <SegField
        label={FIELD_INFO.layout.label}
        info={FIELD_INFO.layout.info}
        value={v.layout}
        options={[
          { value: 'direct', label: 'Direct retour' },
          { value: 'tichelmann', label: 'Tichelmann' },
        ]}
        onChange={(layout) => patch(index, { layout })}
      />
      <CheckField
        label="Afwijkend Δp vóór deze klep"
        checked={v.dpAvailable !== null}
        onChange={(on) => patch(index, { dpAvailable: on ? config.dpAvailable : null })}
      />
      {v.dpAvailable !== null && (
        <NumInput
          label="Δp vóór klep"
          value={v.dpAvailable}
          min={LIMITS.dpAvailable.min}
          max={LIMITS.dpAvailable.max}
          unit="kPa"
          onChange={(x) => patch(index, { dpAvailable: x })}
        />
      )}
      {config.advanced.loadSplit === 'manual' && (
        <NumInput
          label="Aandeel last"
          value={v.loadShare}
          min={0}
          max={100}
          unit="%"
          onChange={(x) => patch(index, { loadShare: x })}
        />
      )}
    </div>
  );
}
