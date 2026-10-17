// Meer instellingen (UX-plan §3.2): één <details> "Meer instellingen · {standaardwaarden | n aangepast}" met de groepen
// Klimaat, Gebouw, Tapwater, Warmtepomp en Beoordeling als H3. De velden blijven altijd in de DOM (ook dichtgeklapt),
// zodat tests en revealSetting ze vinden.
import type { ReactNode } from 'react';
import { buildingKind } from '../../model/input';
import { useStore } from '../../store';
import { MORE_SETTINGS_GROUPS, UI_LABELS } from '../../texts';
import { moreSettingsChanged } from '../../view/settingsDiff';
import { ClimateField, ClimateStats } from '../ClimateSelect';
import {
  AllowedHoursField,
  BuildingMoreFields,
  DesignTempsField,
  DhwDetailsField,
  DhwField,
  FieldCell,
  HeatPumpMoreField,
  MassField,
} from './fields';
import s from './Basis.module.css';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={s.group}>
      <h3 className={s.groupTitle}>{title}</h3>
      {children}
    </div>
  );
}

export function MoreSettings() {
  const changed = useStore((st) => moreSettingsChanged(st.input));
  const office = useStore((st) => buildingKind(st.input.building) === 'office');
  const dhwOn = useStore((st) => st.input.building.dhw.enabled);
  return (
    <details className={s.more}>
      <summary className={s.moreSummary}>{UI_LABELS.moreSettingsSummary(changed)}</summary>
      <div className={s.moreBody}>
        <Group title={MORE_SETTINGS_GROUPS.climate}>
          <FieldCell field="climate" className={s.stack}>
            <ClimateField />
            <ClimateStats />
          </FieldCell>
        </Group>
        <Group title={MORE_SETTINGS_GROUPS.building}>
          <MassField />
          <DesignTempsField />
          <BuildingMoreFields />
        </Group>
        {/* tapwater: bij kantoor ook het vinkje; de getallen alleen als tapwater aan staat (zoals in de oude invoer) */}
        {(office || dhwOn) && (
          <Group title={MORE_SETTINGS_GROUPS.dhw}>
            {office && <DhwField summary={false} />}
            <DhwDetailsField />
          </Group>
        )}
        <Group title={MORE_SETTINGS_GROUPS.heatPump}>
          <HeatPumpMoreField />
        </Group>
        <Group title={MORE_SETTINGS_GROUPS.assessment}>
          <AllowedHoursField />
        </Group>
      </div>
    </details>
  );
}
