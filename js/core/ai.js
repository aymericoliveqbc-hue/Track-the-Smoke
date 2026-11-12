// Assistant IA facultatif : estimation d'un budget de projet par Claude.
//
// - Appel direct depuis l'appareil vers l'API Anthropic avec la clé de
//   l'utilisateur (aucun serveur intermédiaire). Projet sans dépendance ni
//   build : requête HTTP brute plutôt que le SDK.
// - Seule la description du projet est envoyée — jamais les données de
//   consommation, de sommeil ou d'achats.
// - La clé reste sur l'appareil (localStorage), hors des sauvegardes.

const KEY = 'tts-ai-key';
export const AI_MODEL = 'claude-opus-5-5';

export const getAiKey = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
export const setAiKey = (k) => { if (k) localStorage.setItem(KEY, k.trim()); else localStorage.removeItem(KEY); };
export const hasAiKey = () => !!getAiKey();

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          amount: { type: 'number' },
          note: { type: 'string' },
        },
        required: ['label', 'amount', 'note'],
        additionalProperties: false,
      },
    },
    assumptions: { type: 'string' },
  },
  required: ['title', 'items', 'assumptions'],
  additionalProperties: false,
};

const SYSTEM = `Tu aides une personne à chiffrer un projet personnel (voyage, déménagement, achat…) pour s'en servir comme objectif d'épargne.
Donne un budget réaliste et prudent, décomposé en 3 à 8 postes, avec des montants en euros (nombres, sans symbole), arrondis à la dizaine.
Pour chaque poste, une note courte (une phrase) qui explique l'hypothèse.
N'ajoute pas de poste « imprévus » : l'application ajoute sa propre marge.
Dans "assumptions", résume en une ou deux phrases les hypothèses générales (durée, nombre de personnes, niveau de confort, période).
Si la description est vague, choisis des hypothèses raisonnables et dis-les. Réponds en français.`;

/**
 * @returns {Promise<{title:string, items:{label,amount,note}[], assumptions:string}>}
 */
export async function estimateProject({ name, description, template, currency = 'EUR' }) {
  const key = getAiKey();
  if (!key) throw new Error('Ajoute ta clé API dans Réglages › Assistant IA.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2026-10-21',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 16000,
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `Type de projet : ${template}\nNom : ${name || '(sans nom)'}\nDescription : ${description || '(aucune)'}\nDevise : ${currency}`,
      }],
    }),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Clé API refusée. Vérifie-la dans Réglages › Assistant IA.');
    if (res.status === 429) throw new Error('Trop de demandes pour le moment, réessaie dans un instant.');
    if (res.status === 402 || res.status === 403) throw new Error('Accès refusé par l’API (crédit ou droits du compte).');
    throw new Error(`Le service IA n’a pas répondu (erreur ${res.status}).`);
  }
  const msg = await res.json();
  if (msg.stop_reason === 'refusal') throw new Error('L’IA n’a pas pu traiter cette demande. Reformule la description.');
  if (msg.stop_reason === 'max_tokens') throw new Error('Réponse incomplète, réessaie avec une description plus courte.');
  const text = (msg.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Réponse illisible, réessaie.'); }
  data.items = (data.items || []).filter((it) => it && typeof it.label === 'string' && Number.isFinite(it.amount) && it.amount >= 0);
  return data;
}
