// Assistant IA facultatif (Claude), deux usages :
//  1. estimer le budget d'un projet : seuls le nom et la description du
//     projet sont envoyés ;
//  2. analyser une période : uniquement des agrégats (domain/analysis.js),
//     après consentement explicite, avec aperçu exact des données envoyées,
//     et seulement quand l'utilisateur appuie sur « Analyser ». Jamais
//     d'envoi automatique, jamais d'entrée brute ni de note libre.
//
// Appel direct depuis l'appareil vers l'API Anthropic avec la clé de
// l'utilisateur (aucun serveur intermédiaire) : requête HTTP brute, le
// projet n'a ni dépendance ni build. La clé reste sur l'appareil
// (localStorage), hors des sauvegardes.

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

const SYSTEM = `Tu aides une personne à chiffrer un projet personnel (voyage, épargne, achat, logement, loisirs…) pour s'en servir comme objectif d'épargne.
Donne un budget réaliste et prudent, décomposé en 3 à 8 postes, avec des montants en euros (nombres, sans symbole), arrondis à la dizaine.
Pour chaque poste, une note courte (une phrase) qui explique l'hypothèse.
N'ajoute pas de poste « imprévus » : l'application ajoute sa propre marge.
Dans "assumptions", résume en une ou deux phrases les hypothèses générales (durée, nombre de personnes, niveau de confort, période).
Si la description est vague, choisis des hypothèses raisonnables et dis-les. Réponds en français.`;

/** Requête Messages API avec sortie JSON structurée. */
async function callClaude({ system, content, schema }) {
  const key = getAiKey();
  if (!key) throw new Error('Ajoute ta clé API dans Réglages › Assistant IA.');
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
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
        output_config: { effort: 'low', format: { type: 'json_schema', schema } },
        system,
        messages: [{ role: 'user', content }],
      }),
    });
  } catch {
    throw new Error('Pas de connexion au service IA. Vérifie ta connexion internet.');
  }
  if (!res.ok) {
    if (res.status === 401) throw new Error('Clé API refusée. Vérifie-la dans Réglages › Assistant IA.');
    if (res.status === 429) throw new Error('Trop de demandes pour le moment, réessaie dans un instant.');
    if (res.status === 402 || res.status === 403) throw new Error('Accès refusé par l’API (crédit ou droits du compte).');
    throw new Error(`Le service IA n’a pas répondu (erreur ${res.status}).`);
  }
  const msg = await res.json();
  if (msg.stop_reason === 'refusal') throw new Error('L’IA n’a pas pu traiter cette demande.');
  if (msg.stop_reason === 'max_tokens') throw new Error('Réponse incomplète, réessaie.');
  const text = (msg.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  try { return JSON.parse(text); } catch { throw new Error('Réponse illisible, réessaie.'); }
}

/**
 * @returns {Promise<{title:string, items:{label,amount,note}[], assumptions:string}>}
 */
export async function estimateProject({ name, description, template, currency = 'EUR' }) {
  const data = await callClaude({
    system: SYSTEM,
    schema: SCHEMA,
    content: `Type de projet : ${template}\nNom : ${name || '(sans nom)'}\nDescription : ${description || '(aucune)'}\nDevise : ${currency}`,
  });
  data.items = (data.items || []).filter((it) => it && typeof it.label === 'string' && Number.isFinite(it.amount) && it.amount >= 0);
  return data;
}

/* ------------------------------------------------------------------ */
/* Analyse d'une période (données agrégées, avec consentement)         */
/* ------------------------------------------------------------------ */

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    resume: { type: 'string' },
    observations: { type: 'array', items: { type: 'string' } },
    pistes: { type: 'array', items: { type: 'string' } },
    limites: { type: 'string' },
  },
  required: ['resume', 'observations', 'pistes', 'limites'],
  additionalProperties: false,
};

const ANALYSIS_SYSTEM = `Tu accompagnes une personne qui suit sa consommation de tabac, de CBD ou d'autres produits pour la comprendre, la réduire ou l'arrêter, à son rythme.
Tu reçois uniquement des agrégats calculés par son application (JSON). Règles strictes :
- N'utilise QUE les chiffres présents dans les données. Ne calcule pas de nouveaux pourcentages, n'extrapole pas, n'invente rien. Une valeur null signifie « non renseigné » : ne la devine pas, ne la remplace pas par zéro.
- Les quantités ont une part pesée, le reste est estimé : reste prudent sur leur précision.
- Aucun diagnostic médical, aucun conseil de traitement ou de dosage. Si le sommeil ou les envies semblent difficiles, tu peux suggérer d'en parler à un professionnel de santé ou à Tabac Info Service (39 89).
- Un lien entre deux chiffres est une corrélation observée, jamais une cause.
- Ton bienveillant, jamais culpabilisant, sans morale. Une consommation n'efface jamais les progrès.
- Respecte le mode choisi par méthode (suivi libre, réduction, arrêt) : ne pousse pas à arrêter une méthode suivie librement.
Réponds en français, tutoiement.
"resume" : 2 phrases maximum.
"observations" : 2 à 5 constats factuels courts, chacun appuyé sur des chiffres des données.
"pistes" : 1 à 3 idées concrètes et facultatives, adaptées aux données (moments, déclencheurs, envies résistées…).
"limites" : une phrase sur ce que les données ne permettent pas de conclure (période courte, quantités estimées, nuits peu renseignées…).`;

/** @returns {Promise<{resume, observations[], pistes[], limites}>} */
export async function analyzePeriod(payload) {
  const data = await callClaude({
    system: ANALYSIS_SYSTEM,
    schema: ANALYSIS_SCHEMA,
    content: `Voici mes données agrégées :\n${JSON.stringify(payload)}`,
  });
  const strs = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.trim()) : []);
  return { resume: String(data.resume || ''), observations: strs(data.observations), pistes: strs(data.pistes), limites: String(data.limites || '') };
}
