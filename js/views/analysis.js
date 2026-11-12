// Analyse IA d'une période : consentement explicite, aperçu exact des
// données envoyées, envoi uniquement à la demande.

import { h, fill } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { card, openSheet, note, toast } from '../ui/components.js';
import { state, derived, saveSettings } from '../core/store.js';
import { hasAiKey, analyzePeriod } from '../core/ai.js';
import { buildAnalysisPayload, unverifiedNumbers } from '../domain/analysis.js';
import { formatDayShort } from '../core/dates.js';

export const hasDataConsent = () => !!state.settings.ai?.dataConsent;

export async function setDataConsent(on) {
  await saveSettings({ ai: { dataConsent: !!on, consentAt: on ? new Date().toISOString() : null } });
}

/** Carte d'entrée affichée dans Progrès (seulement si une clé est configurée). */
export function analysisCard(range) {
  if (!hasAiKey()) return null;
  return card(h('button', { class: 'ai-box', onclick: () => openAnalysisSheet(range) },
    icon('sparkle', 20),
    h('div', { class: 'grow' }, h('b', null, 'Analyser cette période avec l’IA'),
      h('span', { class: 'muted small' }, hasDataConsent() ? 'Données agrégées uniquement · à ta demande' : 'Facultatif · tu vois les données avant tout envoi')),
    icon('chevron', 16)));
}

export function openAnalysisSheet(range) {
  const { ctx } = derived();
  const payload = buildAnalysisPayload(state, range, ctx, { currency: state.settings.currency });
  openSheet({
    title: 'Analyse IA',
    size: 'full',
    build: (close) => {
      const body = h('div', { class: 'stack' });
      if (!payload) {
        body.append(note('Pas encore de données sur cette période. Rien n’est envoyé.', 'info'));
        return body;
      }
      let accepted = hasDataConsent();
      const preview = h('details', { class: 'form-details' },
        h('summary', null, 'Voir exactement les données envoyées'),
        h('pre', { class: 'payload-preview' }, JSON.stringify(payload, null, 2)));
      const result = h('div', { class: 'stack' });
      const go = h('button', { class: 'btn btn-primary btn-block btn-lg', disabled: !accepted }, icon('sparkle', 18), 'Analyser');
      const consent = accepted ? null : h('label', { class: 'consent-row' },
        h('input', { type: 'checkbox', onchange: (e) => { accepted = e.target.checked; go.disabled = !accepted; } }),
        h('span', null, 'J’accepte d’envoyer ces données agrégées à Anthropic (Claude) pour cette analyse. Je pourrai retirer mon accord dans Réglages › Assistant IA.'));

      go.onclick = async () => {
        if (!accepted) return;
        if (!hasDataConsent()) await setDataConsent(true);
        go.disabled = true;
        fill(result, h('p', { class: 'muted center' }, 'Analyse en cours…'));
        try {
          const a = await analyzePeriod(payload);
          fill(result, renderResult(a, payload));
          result.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (err) {
          fill(result, note(err.message, 'warn'));
        } finally { go.disabled = false; }
      };

      body.append(
        h('p', { class: 'muted' }, `Période du ${formatDayShort(range.start)} au ${formatDayShort(range.end)}`.replace(/\.*$/, '.')),
        note('Seuls des totaux et moyennes calculés par l’app sont envoyés : aucune note, aucun nom de produit, aucun lieu, aucune heure précise. Rien n’est envoyé sans ton appui sur « Analyser ».', 'info'),
        preview, consent, go, result);
      return body;
    },
  });
}

function renderResult(a, payload) {
  const flag = (text) => {
    const odd = unverifiedNumbers(text, payload);
    return h('li', null, text, odd.length ? h('span', { class: 'badge badge-orange', title: 'Chiffre absent des données envoyées' }, 'à vérifier') : null);
  };
  return h('div', { class: 'stack ai-result' },
    a.resume ? h('p', { class: 'lead' }, a.resume) : null,
    a.observations.length ? h('div', null, h('h3', null, 'Constats'), h('ul', { class: 'bullets' }, a.observations.map(flag))) : null,
    a.pistes.length ? h('div', null, h('h3', null, 'Pistes, si tu le souhaites'), h('ul', { class: 'bullets' }, a.pistes.map(flag))) : null,
    a.limites ? h('p', { class: 'muted small' }, a.limites) : null,
    h('p', { class: 'hint' }, 'Analyse générée par une IA à partir de tes agrégats : elle peut se tromper et ne remplace pas un avis médical. Les liens observés ne sont pas des causes.'));
}

/** Bloc des réglages : état du consentement, retrait. */
export function consentSettingsCard() {
  const on = hasDataConsent();
  return card(
    h('h3', null, 'Analyse de tes données'),
    h('p', { class: 'muted' }, on
      ? `Accord donné le ${formatDayShort((state.settings.ai.consentAt || new Date().toISOString()).slice(0, 10))}. Des données agrégées sont envoyées seulement quand tu appuies sur « Analyser », dans Progrès.`
      : 'Dans Progrès, l’assistant peut analyser une période à partir de totaux et moyennes. Ton accord est demandé avant le premier envoi, avec l’aperçu exact des données.'),
    on ? h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-ghost', onclick: async () => { await setDataConsent(false); toast('Accord retiré'); window.dispatchEvent(new Event('tts:render')); } }, 'Retirer mon accord')) : null);
}
