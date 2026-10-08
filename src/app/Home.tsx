import { Link } from 'react-router-dom';
import { CONCEPTS } from '../concepts';
import s from './app.module.css';

export default function Home() {
  return (
    <main className={s.main}>
      <section className={s.hero}>
        <h1>Installatieconcepten</h1>
        <p className={s.lead}>
          Interactieve rekenmodellen en visualisaties voor het kiezen en begrijpen van installatieconcepten.
          Pas de invoer aan, zie direct wat er hydraulisch en thermisch gebeurt en waarom.
        </p>
      </section>
      <ul className={s.grid} aria-label="Concepten">
        {CONCEPTS.map((c) => (
          <li key={c.id}>
            {c.status === 'actief' ? (
              <Link to={c.route} className={`${s.tile} ${s.tileActive}`}>
                <span className={s.badge}>Beschikbaar</span>
                <h2>{c.titel}</h2>
                <p>{c.beschrijving}</p>
                <span className={s.open}>Openen →</span>
              </Link>
            ) : (
              <div className={`${s.tile} ${s.tileSoon}`} aria-disabled="true">
                <span className={`${s.badge} ${s.badgeSoon}`}>Binnenkort</span>
                <h2>{c.titel}</h2>
                <p>{c.beschrijving}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
