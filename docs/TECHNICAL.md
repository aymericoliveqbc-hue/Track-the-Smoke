# TRACK THE SMOKE — documentation technique

## 1. Choix de plateforme

L'environnement cible est l'iPhone. Une application native (SwiftUI) imposerait Xcode, un compte développeur et une distribution App Store. Le projet est donc livré sous forme de **Progressive Web App** installable depuis Safari :

- HTML / CSS / JavaScript (modules ES) **sans framework ni dépendance d'exécution**, sans étape de build ;
- **IndexedDB** pour le stockage structuré et persistant (`navigator.storage.persist()` demandé) ;
- **Service worker** en « cache d'abord » : fonctionnement intégral hors ligne ;
- manifeste, icônes, `viewport-fit=cover` et `env(safe-area-inset-*)` pour le plein écran iOS ;
- Content-Security-Policy stricte : `connect-src 'self'`, aucun script ni ressource tiers.

Le domaine métier (`js/domain/`) est pur et indépendant du DOM : il pourrait être réutilisé tel quel derrière une interface native (JavaScriptCore) ou un autre front.

## 2. Arborescence

```
index.html, manifest.webmanifest, sw.js
css/app.css                 Design system (tokens, composants)
assets/icons/               Logo SVG + PNG (192, 512, maskable, apple-touch)
js/app.js                   Démarrage, routage (#/vue/sous-vue), verrouillage, SW
js/app-reminders.js         Rappels dans l'app + notifications système
js/core/
  dates.js                  Jours locaux, périodes, durées (sans dérive DST)
  format.js                 Décimales FR, devises, unités métriques
  db.js                     Accès IndexedDB (base perso / base démo)
  store.js                  État en mémoire, persistance, dérivés, sauvegardes locales
  lock.js                   PIN (SHA-256 salé) et WebAuthn (Face ID)
js/domain/                  Logique métier pure, testée
  models.js                 Modèle, référentiels, valeurs par défaut
  costs.js                  Calculs financiers
  stats.js                  Agrégations statistiques
  cravings.js               Analyse des envies
  sleep.js                  Sommeil, contexte de la veille, corrélations
  simulator.js              Simulateur d'économies
  goals.js                  Référence, objectifs, parcours d'arrêt
  stock.js                  Stocks recalculés depuis un registre
  insights.js               Observations automatiques prudentes
  backup.js                 Export / import / CSV
  demo.js                   Jeu de démonstration
js/ui/                      DOM, icônes, graphiques SVG, composants, formulaires
js/views/                   Accueil, Journal, Statistiques, Objectifs, Profil, Santé, Onboarding
tests/domain.test.js        Tests unitaires (node --test)
tests/e2e.mjs               Scénarios de validation (Playwright)
```

Séparation demandée → module : utilisateurs/paramètres (`store.js`, `models.js#defaultSettings`), journal (`forms.js`, `entries.js`, `journal.js`), produits et achats (`profile.js`, `costs.js`), calculs financiers (`costs.js`, `simulator.js`), statistiques (`stats.js`, `cravings.js`, `insights.js`), sommeil (`sleep.js`), objectifs (`goals.js`), notifications (`app-reminders.js`), paramètres (`profile.js`).

## 3. Données

Base IndexedDB `track-the-smoke` (et `track-the-smoke-demo`, **totalement séparée**, pour le mode démo). Stores : `meta` (réglages), `entries`, `nights`, `products`, `purchases`, `inventories`, `categories`, `goals`, `backups`.

### Horodatage
`at: "YYYY-MM-DDTHH:mm"` en **heure murale locale** + `tzOffset`. Une consommation reste dans sa journée même après un voyage ou un changement d'heure. Toute l'arithmétique de jours se fait sur des clés `YYYY-MM-DD` en UTC (pas de décalage DST). Le changement de date pendant que l'app est ouverte est détecté.

### Consommation
```js
{ id, kind: 'consumption', categoryId: 'joint'|'rolled'|'cbd'|<perso>, at, tzOffset,
  tobacco: { grams, method: 'weighed'|'estimated', productId } | null,
  cbd: { amount, unit: 'g'|'ml'|'drop'|'unit', method, productId, form } | null,
  quantity: { amount, unit } | null,            // catégories personnalisées
  accessories: [{ type: 'slim'|'classic'|'filter'|'other', productId, count }],
  context, mood, mode, note, custom: {}, cravingId, createdAt, updatedAt }
```
`grams = null` signifie **inconnu** (jamais 0). Les quantités sont arrondies au centième.

### Envie
`{ id, kind: 'craving', at, intensity 0–10, product, trigger, triggerOther, durationMin, situation, emotion, note, outcome: 'resisted'|'consumed', consumptionId }`

### Nuit
Identifiée par la date de la **soirée** (`night_YYYY-MM-DD`). Coucher, essai, endormissement (heure ou durée), réveil, réveils nocturnes, qualité 1–5, sensation, bien-être (stress, agitation, fatigue, humeur, difficulté à se détendre, énergie 1–5). Les durées traversant minuit sont calculées depuis midi.

### Produits & achats
Produit : `kind: tobacco|cbd|accessory`, unité, tarif de référence facultatif. Achat : `packPrice`, `packSize`, `packCount`, date, fournisseur, `addToStock`.

## 4. Règles de calcul

**Prix unitaire** = prix du paquet / contenance. Le prix appliqué à une consommation est celui du **dernier achat daté au plus tard le jour de la consommation**, sinon le tarif de référence, sinon le premier achat connu. Modifier un prix futur ne réécrit donc pas le passé.

**Coût d'une consommation** = tabac × prix/g + CBD × prix/unité + Σ accessoires (prix unitaire × nombre). Les accessoires sont normalisés (une ligne par type/produit : jamais de double comptage). Si une quantité ou un prix manque, la composante vaut `null`, l'entrée est marquée **incomplète** et le motif est listé ; toutes les vues l'indiquent. Les unités CBD incompatibles (gouttes vs grammes) ne sont jamais converties implicitement.

**Statistiques** : tabac et CBD toujours séparés ; joints et roulées distingués (le tabac des joints est compté à part) ; totaux pesés / estimés / méthode inconnue / quantité manquante séparés et filtrables ; moyennes calculées sur les seules observations disponibles avec `n` affiché ; toute période est restreinte à la **couverture réelle** (aucun « 0 » avant le début du suivi, séries à `null`).

**Coûts recalculés à la volée** : aucun coût n'est stocké ; une modification (scénario 7) met à jour coûts, statistiques et stocks instantanément.

**Stocks** : jamais décrémentés en place, mais recalculés depuis un registre (dernier inventaire + achats − consommations à quantité connue). Les consommations sans quantité ne sont pas déduites et sont signalées.

**Simulateur** : profil de coût quotidien observé (tabac, CBD, accessoires par catégorie) sur 7/14/30/90 j ; scénarios −10/−25/−50 %, arrêt tabac (roulées supprimées, joints conservés sans tabac), arrêt CBD, arrêt total ; horizons 7 j → 1 an. Libellé « économies théoriques ».

**Économies réalisées** : (référence €/j × jours depuis la fin de la référence) − dépenses réellement enregistrées. Distinctes du simulateur.

**Parcours d'arrêt** : jours écoulés, jours sans, plus longue série, consommations depuis l'arrêt, quantités/unités/dépenses évitées vs référence. Rien n'est remis à zéro.

**Objectifs** : métrique, cible, paliers datés libres. Toute modification archive la version précédente (`revisions`). Évaluation sur les 7 derniers jours, progression = chemin parcouru entre la référence et la cible.

**Sommeil** : contexte de la journée D (consommations, soir dès 18 h, envies nocturnes). Corrélations de Pearson affichées seulement à partir de 7 nuits, avec formulation « corrélation observée, pas une cause ». Alerte bienveillante (consulter un professionnel) si les nuits récentes sont difficiles.

**Observations automatiques** : chaque règle a un seuil minimal de données ; sans données suffisantes, rien n'est affirmé.

## 5. Confidentialité & sécurité

- Aucun appel réseau sortant (CSP `connect-src 'self'`), aucune bibliothèque tierce.
- Verrouillage : PIN haché (SHA-256 + sel aléatoire), Face ID / Touch ID via WebAuthn (authentificateur de plateforme, vérification locale). Reverrouillage après 1 min en arrière-plan. Les secrets de verrouillage ne sont jamais exportés.
- Limite : les données IndexedDB ne sont pas chiffrées par l'application ; elles bénéficient du chiffrement de l'appareil iOS (code de déverrouillage activé).
- Sauvegardes : export JSON complet versionné (`schema`), CSV, import avec validation (remplacer ou fusionner), instantané local quotidien (7 conservés), rappel d'export mensuel. Suppression définitive (base détruite).
- Synchronisation : non implémentée et jamais obligatoire. L'architecture la permet : identifiants uniques, `updatedAt` sur chaque entrée, fusion par identifiant (`mergeData`) — base d'une synchronisation chiffrée de bout en bout ultérieure.

## 6. Notifications

Rappels configurables (journal, nuit, bilan hebdomadaire, objectifs, bilan financier mensuel, sauvegarde) affichés en bandeaux discrets et masquables. Notifications système facultatives via le service worker. **Limite iOS** : sans serveur de push (exclu pour la confidentialité), une PWA ne peut pas programmer de notification locale ; elles sont émises quand l'application est ouverte ou revient au premier plan.

## 7. Graphiques

SVG maison (`js/ui/charts.js`) : barres, barres empilées, courbes, carte de chaleur, nuage de points, barres de répartition, anneaux. Infobulle au toucher/survol, valeurs manquantes jamais dessinées comme des zéros, légendes systématiques au-delà d'une série. Palette : violet `#A995F5`, vert `#8DD5AF`, bleu `#83A9ED`, orange `#F0B47A` (séparation daltonisme et contraste ≥ 3:1 validés sur le fond `#191C24`).

## 8. Tests

`npm test` — 27 tests unitaires couvrant notamment : analyse des décimales FR, arithmétique de dates (DST, années bissextiles), prix au gramme, historique de prix, coûts complets/incomplets, non-double comptage des accessoires, unités CBD incompatibles, séparation pesé/estimé, absence de zéros fictifs, analyse des joints (n), corrélations, simulateur, référence/paliers/parcours sans remise à zéro, stocks, export/import, CSV, données de démo.

`npm run e2e` — rejoue dans Chromium (iPhone 14) les scénarios de validation :

| # | Scénario | Vérification |
|---|---|---|
| 1 | Joint 0,22 g tabac + 0,16 g CBD, slim + filtre | coût 0,97 € avec 15 €/30 g, 50 €/10 g, 1,60 €/32, 1,20 €/120 |
| 2 | Roulée 0,25 g, feuille classique | aucune section ni quantité CBD, coût 0,15 € |
| 3 | Envie 8/10 avant de dormir, résistée | 1 envie résistée, aucune consommation ajoutée |
| 4 | Comparer deux semaines | test unitaire + vues Synthèse / Accueil |
| 5 | 4 h pour s'endormir | enregistré, comparé à la journée précédente |
| 6 | Réduction de 25 % | test unitaire sur historique + Simulateur |
| 7 | Correction d'une quantité | tabac et dépenses recalculés |
| 8 | Export → « réinstallation » → import | restauration complète sur un navigateur vierge |

## 9. Mode démonstration

Accessible au premier lancement ou depuis Profil. Il bascule sur la base `track-the-smoke-demo`, affiche un bandeau orange permanent et n'interagit jamais avec la base personnelle. Les exports de démo sont marqués `demo: true` et signalés à l'import.
