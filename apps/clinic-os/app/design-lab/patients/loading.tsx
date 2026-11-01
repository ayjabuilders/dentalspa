import s from './patients.module.css';
export default function Loading(){return <div className={s.lab}><main className={s.main} aria-busy="true"><p role="status">Chargement du prototype Patients…</p></main></div>;}
