// Informations utiles — accompagnement, sans diagnostic médical.

import { h } from '../ui/dom.js';
import { note } from '../ui/components.js';

const SECTIONS = [
  {
    id: 'nicotine', title: 'Le sevrage nicotinique', tag: 'Nicotine',
    body: [
      'La nicotine, présente dans le tabac, entraîne une dépendance physique et comportementale. En réduisant ou en arrêtant, certaines personnes ressentent irritabilité, difficultés de concentration, troubles du sommeil, augmentation de l’appétit ou envies intenses.',
      'Ces manifestations sont fréquentes, généralement temporaires, et tendent à diminuer au fil des semaines. Leur intensité varie beaucoup d’une personne à l’autre.',
      'Réduire progressivement est une démarche valable : chaque gramme en moins compte.',
    ],
  },
  {
    id: 'cravings', title: 'Les envies de fumer',
    body: [
      'Une envie dure souvent quelques minutes. Noter son intensité et son déclencheur aide à repérer les moments sensibles (après un repas, en fin de journée, face au stress…).',
      'Pistes souvent utiles : différer de quelques minutes, boire un verre d’eau, respirer lentement, changer d’activité ou de pièce, prévenir un proche.',
      'Une envie suivie d’une consommation n’est pas un échec : c’est une information pour la suite.',
    ],
  },
  {
    id: 'sleep', title: 'Le sommeil',
    body: [
      'Le sommeil peut être perturbé pendant une réduction ou un arrêt, en particulier les premières semaines.',
      'Des habitudes régulières aident souvent : horaires de coucher et de lever stables, lumière du jour le matin, écrans et caféine limités le soir, chambre calme et fraîche.',
      'Les graphiques de l’application montrent des corrélations observées, jamais des causes. Ils ne remplacent pas un avis médical.',
    ],
  },
  {
    id: 'cbd', title: 'CBD et THC : deux choses différentes', tag: 'CBD',
    body: [
      'Le CBD (cannabidiol) et le THC (tétrahydrocannabinol) sont deux composés distincts du chanvre. L’application suit uniquement les quantités de produits CBD que tu enregistres et n’en déduit jamais une quantité de THC.',
      'Fumé avec du tabac, un joint de CBD expose aussi à la nicotine et aux produits de combustion du tabac.',
      'Le CBD n’est pas présenté ici comme un traitement du sommeil ou de l’anxiété.',
    ],
  },
  {
    id: 'synthetic', title: 'HHC, 10-OH-HHC, D10… : pas du CBD', tag: 'Molécules',
    body: [
      'Ces cannabinoïdes, souvent vendus à côté du CBD, sont obtenus par transformation chimique. Ce ne sont pas du CBD : plusieurs ont des effets psychoactifs proches de ceux du THC, et leurs effets à long terme sont encore très peu étudiés.',
      'Leur statut légal change selon les pays et évolue rapidement (en France, le HHC et certains dérivés sont classés comme stupéfiants depuis 2023). Renseigne-toi sur la réglementation en vigueur.',
      'L\u2019application suit chaque molécule séparément, sans jamais l\u2019additionner au CBD ni l\u2019assimiler au THC.',
    ],
  },
  {
    id: 'habits', title: 'Les habitudes',
    body: [
      'Beaucoup de consommations sont associées à des routines (café, pause, trajet, coucher). Les repérer dans les statistiques « Habitudes » permet de choisir lesquelles modifier en premier.',
      'Espacer certaines consommations, retarder la première de la journée ou supprimer un créneau précis sont des étapes concrètes et mesurables.',
    ],
  },
  {
    id: 'support', title: 'Substituts et accompagnement professionnel',
    body: [
      'Les substituts nicotiniques (patchs, gommes, pastilles, sprays, inhalateurs) peuvent atténuer les symptômes de manque. Un médecin, un pharmacien, une sage-femme ou un infirmier peut t’aider à choisir le dosage adapté ; en France, ils peuvent être pris en charge sur prescription.',
      'Un accompagnement par un tabacologue ou une consultation spécialisée augmente les chances de réussite.',
    ],
  },
];

const RESOURCES = [
  { name: 'Tabac info service', detail: '39 89 · tabac-info-service.fr — conseils et coaching gratuits (France).' },
  { name: 'Drogues info service', detail: '0 800 23 13 13 · drogues-info-service.fr — information et écoute, anonyme et gratuit (France).' },
  { name: 'Ton médecin ou ton pharmacien', detail: 'Pour les substituts nicotiniques, le sommeil ou toute difficulté de sevrage.' },
  { name: 'Urgences', detail: 'En cas de détresse : 15 (SAMU) ou 112.' },
];

export function healthContent() {
  return h('div', { class: 'stack' },
    note('Cette application est un outil de suivi personnel. Elle ne remplace pas un professionnel de santé et ne fournit aucun diagnostic.', 'info'),
    ...SECTIONS.map((s) => h('details', { class: 'card info-block' },
      h('summary', null, h('span', null, s.title), s.tag ? h('span', { class: 'badge badge-muted' }, s.tag) : null),
      ...s.body.map((p) => h('p', null, p)))),
    h('section', { class: 'card' }, h('h3', { class: 'card-title' }, 'Ressources'),
      h('div', { class: 'list' }, RESOURCES.map((r) => h('div', { class: 'row' }, h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, r.name), h('span', { class: 'row-sub' }, r.detail)))))),
    note('Si tu rencontres des difficultés importantes de sommeil, d’humeur ou de sevrage, n’hésite pas à consulter un professionnel de santé.', 'warn'));
}
