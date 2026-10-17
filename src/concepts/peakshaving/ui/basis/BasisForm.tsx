// Velden van de open Basis per gebouwfunctie (UX-plan §3.1): woning 6, meerdere woningen 7, kantoor 8 velden.
// Bij grootverbruik komt de cel "Gecontracteerd vermogen" erbij. Alle andere invoer staat in Meer instellingen
// (wat er is) of in Wat als? (wat je kiest).
import { LARGE_CONNECTION_ID } from '../../data/connections';
import { buildingKind } from '../../model/input';
import { useStore } from '../../store';
import {
  ConnectionField,
  ContractedField,
  DesignLoadField,
  DhwField,
  DwellingsField,
  EmitterField,
  KindField,
  NightSetbackField,
  ShareField,
  UseHoursField,
} from './fields';
import s from './Basis.module.css';

export function BasisForm() {
  const kind = useStore((st) => buildingKind(st.input.building));
  const large = useStore((st) => st.input.grid.connection === LARGE_CONNECTION_ID);
  const office = kind === 'office';
  return (
    <div className={s.form}>
      <KindField />
      {kind === 'multi' && <DwellingsField />}
      <DesignLoadField />
      <EmitterField />
      {/* kantoor: tapwater staat in Meer instellingen › Tapwater; wel gebruikstijden en nachtverlaging */}
      {office ? (
        <>
          <UseHoursField />
          <NightSetbackField />
        </>
      ) : (
        <DhwField />
      )}
      <ConnectionField />
      {large && <ContractedField />}
      <ShareField />
    </div>
  );
}
