'use client';

import { useState, type FormEvent } from 'react';
import { Check, Languages, LockKeyhole, MessageCircle, Sparkles } from 'lucide-react';

type MessageLanguage = 'fr' | 'ar';
type PatientDemoRecipient = { id: string; name: string };

const copy: Record<MessageLanguage, {
  languageName: string;
  clinicMessage: string;
  patientMessage: string;
  draftLabel: string;
  draftHint: string;
  preview: string;
}> = {
  fr: {
    languageName: 'français',
    clinicMessage: 'Bonjour. Cet échange appartient au parcours de démonstration. Aucun rendez-vous ni document réel n’est concerné.',
    patientMessage: 'Merci, je découvre l’espace de démonstration.',
    draftLabel: 'Votre brouillon fictif',
    draftHint: 'Ne saisissez aucune donnée personnelle ou de santé.',
    preview: 'Aperçu du brouillon · non envoyé',
  },
  ar: {
    languageName: 'arabe',
    clinicMessage: 'مرحباً. هذه المحادثة ضمن العرض التوضيحي فقط. لا تتعلق بموعد أو وثيقة حقيقية.',
    patientMessage: 'شكراً، أستكشف مساحة العرض التوضيحي.',
    draftLabel: 'مسودة تجريبية',
    draftHint: 'لا تُدخل أي بيانات شخصية أو صحية.',
    preview: 'معاينة المسودة · لم تُرسل',
  },
};

export function PatientMessagesDemo({ patient }: { patient: PatientDemoRecipient }) {
  const [language, setLanguage] = useState<MessageLanguage>('fr');
  const [drafts, setDrafts] = useState<Record<MessageLanguage, string>>({ fr: '', ar: '' });
  const [previewed, setPreviewed] = useState(false);
  const [read, setRead] = useState(false);
  const [contextOpen,setContextOpen]=useState(false);
  const selectedCopy = copy[language];
  const currentDraft = drafts[language];

  function previewDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (currentDraft.trim()) setPreviewed(true);
  }

  function updateDraft(value: string) {
    setDrafts(current => ({ ...current, [language]: value }));
    setPreviewed(false);
  }

  return <>
    <div className="pass-greeting">
      <span className="eyebrow">VOTRE ÉQUIPE À VOS CÔTÉS</span>
      <h1>Messages</h1>
      <p>Un exemple local de conversation administrative.</p>
    </div>
    <section className="pass-card messages-demo" aria-label="Conversation administrative fictive">
      <div className="messages-demo-sidebar">
      <span className="pass-tag"><LockKeyhole size={13} />FICTIF · LOCAL · SANS ENVOI</span>
      <button type="button" className="messages-demo-context-toggle" aria-label="À propos de cet exemple" aria-expanded={contextOpen} aria-controls="messages-demo-context" onClick={()=>setContextOpen(open=>!open)}>À propos</button>
      <div id="messages-demo-context" data-expanded={contextOpen}>
      <h2 id="messages-demo-title">Votre équipe</h2>
      <p className="messages-demo-note">Conversation fictive : aucun envoi. Ne saisissez aucune donnée réelle.</p>
      <p className="messages-demo-note">Ce choix de langue ne représente pas une préférence enregistrée.</p>
      <div className="messages-demo-patient" aria-label="Profil fictif sélectionné">
        <span className="messages-demo-avatar" aria-hidden="true">{patient.name.slice(0, 1) || 'D'}</span>
        <span><strong>{patient.name || 'Profil fictif non apparié'}</strong><small>{patient.id} · scénario local uniquement</small></span>
      </div>
      </div></div><div className="messages-demo-conversation">
      <div className="messages-demo-language">
        <span><Languages size={16} /> Aperçu de langue</span>
        <div role="group" aria-label="Langue de l’aperçu">
          <button type="button" aria-pressed={language === 'fr'} onClick={() => { setLanguage('fr'); setPreviewed(false); }}>Français</button>
          <button type="button" lang="ar" aria-pressed={language === 'ar'} onClick={() => { setLanguage('ar'); setPreviewed(false); }}>العربية</button>
        </div>
      </div>

      <article className="messages-demo-thread" aria-label={`Conversation fictive en ${selectedCopy.languageName}`} lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <header><span className="messages-demo-team"><MessageCircle size={17} />Accueil Dental Spa</span><span className="messages-demo-sample">EXEMPLE</span></header>
        <div className="messages-demo-message messages-demo-message-team">
          <small>{language === 'fr' ? 'Équipe du cabinet · fictif' : 'فريق العيادة · مثال'}</small>
          <p>{selectedCopy.clinicMessage}</p>
          <time>{language === 'fr' ? 'Aucune date réelle' : 'لا يوجد تاريخ حقيقي'}</time>
        </div>
        <div className="messages-demo-message messages-demo-message-patient">
          <small>{language === 'fr' ? 'Réponse fictive' : 'رد تجريبي'}</small>
          <p>{selectedCopy.patientMessage}</p>
          <time>{language === 'fr' ? 'Aucune date réelle' : 'لا يوجد تاريخ حقيقي'}</time>
        </div>
      </article>

      <div className="messages-demo-read-state">
        <span className={read ? 'messages-demo-read messages-demo-read-done' : 'messages-demo-read'}>
          {read ? <><Check size={14} />Lu dans cet aperçu</> : <><span aria-hidden="true" />1 exemple non lu</>}
        </span>
        <button type="button" aria-pressed={read} onClick={() => setRead(current => !current)}>
          {read ? 'Réinitialiser l’état fictif' : 'Marquer l’exemple comme lu'}
        </button>
      </div>

      <form className="messages-demo-compose" onSubmit={previewDraft}>
        <label htmlFor="patient-demo-message">{selectedCopy.draftLabel}</label>
        <p>{selectedCopy.draftHint}</p>
        <textarea
          id="patient-demo-message"
          value={currentDraft}
          onChange={event => updateDraft(event.target.value)}
          maxLength={400}
          rows={4}
          dir={language === 'ar' ? 'rtl' : 'ltr'}
          aria-describedby="patient-demo-message-limit"
        />
        <div className="messages-demo-compose-footer">
          <small id="patient-demo-message-limit">{currentDraft.length}/400</small>
          <button className="pass-primary" type="submit" disabled={!currentDraft.trim()}><Sparkles size={16} />Aperçu uniquement</button>
        </div>
        {previewed && <div className="messages-demo-draft-preview" role="status" lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}>
          <strong>{selectedCopy.preview}</strong>
          <p>{currentDraft}</p>
          <small>Aucune transmission, requête API ou sauvegarde n’a eu lieu.</small>
        </div>}
      </form>
      </div>
    </section>
  </>;
}
