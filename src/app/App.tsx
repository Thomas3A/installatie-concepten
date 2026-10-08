import { Suspense } from 'react';
import { HashRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { CONCEPTS } from '../concepts';
import Home from './Home';
import s from './app.module.css';

export const DISCLAIMER =
  'Indicatief rekenmodel voor uitleg en conceptkeuze. Geen vervanging van de productberekening van de fabrikant.';

export default function App() {
  return (
    <HashRouter>
      <div className={s.shell}>
        <header className={`${s.header} noPrint`}>
          <Link to="/" className={s.brand}>
            <span className={s.logo} aria-hidden="true" />
            Installatieconcepten
          </Link>
        </header>
        <div className={s.content}>
          <Suspense fallback={<p className={s.loading}>Laden…</p>}>
            <Routes>
              <Route path="/" element={<Home />} />
              {CONCEPTS.filter((c) => c.component).map((c) => {
                const C = c.component!;
                return <Route key={c.id} path={`${c.route}/*`} element={<C />} />;
              })}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </div>
        <footer className={s.footer}>{DISCLAIMER}</footer>
      </div>
    </HashRouter>
  );
}
