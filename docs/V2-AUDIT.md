# TRACK THE SMOKE — Audit de la V1 et plan de migration V2

## 1. Ce qui fonctionne (conservé)

| Domaine | Modules | État |
|---|---|---|
| Stockage local, base démo séparée, sauvegardes JSON/CSV, instantanés, suppression | `core/db.js`, `core/store.js`, `domain/backup.js` | Fiable |
| Journal, calendrier, recherche | `views/journal.js` | Fiable, filtres figés sur 3 catégories |
| Coûts datés (prix du dernier achat), accessoires sans double comptage | `domain/costs.js` | Fiable pour tabac / CBD / accessoires |
| Quantités « auto » calibrées sur les paquets | `domain/autoqty.js` | Fiable, mais une seule valeur par catégorie |
| Stocks recalculés depuis un registre | `domain/stock.js` | Fiable, sans « pertes » ni ajustements relatifs |
| Envies, sommeil, Apple Santé, corrélations prudentes | `domain/cravings.js`, `domain/sleep.js`, `domain/health.js` | Fiable |
| Référence, objectifs, parcours tabac / CBD | `domain/goals.js` | Fiable, parcours limités à 2 substances |
| Avant l'app, projets, IA d'estimation | `domain/before.js`, `domain/projects.js`, `core/ai.js` | Fiable |
| Verrouillage PIN / Face ID, rappels, mode démo | `core/lock.js`, `app-reminders.js` | Fiable |

## 2. Problèmes identifiés

1. **Méthodes figées** : seules 3 catégories système (joint, roulée, CBD seul). Pas de cigarette industrielle, vape, puff, cigare, pipe, chicha.
2. **Joint présumé « tabac + CBD »** : la catégorie impose les deux ingrédients (contraire à « ne jamais considérer automatiquement qu'un joint contient du tabac ou du CBD »).
3. **Molécules confondues dans les totaux** : les grammes de 10-OH (et d'un éventuel THC) sont additionnés au « CBD ».
4. **Valeur unique par catégorie** pour l'estimation automatique (une roulée slim = une roulée classique ; un joint pur = un joint mélangé).
5. **Deux systèmes parallèles** pour la même réalité physique : « Mes paquets » (calibration) et « Stocks » (inventaires) ne s'alimentent pas.
6. **Projets** : chaque projet compte les économies de réduction indépendamment → une même économie peut être comptée deux fois.
7. **Trois notions d'économie** (avant l'app, référence d'observation, simulateur) présentées à des endroits différents, sans distinction claire « réalisé / évité / potentiel ».
8. **Pas de sessions** (début / fin, durée, intervalles), pas de consommation partielle.
9. **Envies** limitées à tabac / CBD / les deux.
10. **Mode sombre** retiré lors de la refonte blanc & vert.

## 3. Architecture V2 (évolution, pas réécriture)

- **Catalogue de méthodes** (`domain/methods.js`) : cigarette industrielle, roulée, joint, CBD / cannabinoïde seul, vape, puff, cigare, cigarillo, pipe, chicha, autre ; plus les catégories personnalisées existantes. Chaque méthode décrit sa mécanique (tabac, ingrédients cannabinoïdes, liquide, unités, bouffées, quantité libre).
- **Habitudes** (`settings.habits`) : méthodes activées, méthode principale déclarée, mode par méthode (libre / réduction / arrêt + date).
- **Consommation** : `categoryId` = méthode ; composants indépendants `tobacco`, `cbd` (premier ingrédient cannabinoïde, molécule explicite), `extra[]` (ingrédients supplémentaires), `liquid` (ml), `units` (cigarettes, cigares…, fractionnables), `puffs` (bouffées) ; `endAt` / `status` (sessions) ; `completion` (terminée, partielle, interrompue, abandonnée) ; `exceptional`.
- **Normalisation unique** `components(entry)` utilisée par coûts, stocks, quantités automatiques et statistiques : un seul moteur de calcul.
- **Produits** : nouveaux types `cigarettes`, `liquid`, `puff`, `cigars`, `device`, `other` ; même système d'achats datés, de prix et de stock.
- **Fiabilité** : PESÉE, CALCULÉE (paquets / stocks), ESTIMÉE, INCONNUE, et « provisoire » pour une valeur de départ non encore calibrée.

## 4. Plan de migration des données (schéma 1 → 2)

1. Instantané local automatique **avant** migration (`backup_premigration_v2`), restaurable depuis Réglages › Données.
2. Migration pure et testée (`domain/migrations.js`) :
   - réglages : `habits` déduites de l'historique (méthodes réellement utilisées, la plus utilisée devient principale), modes déduits des parcours tabac / CBD ;
   - joints existants : `composition` déduite des ingrédients présents, rien n'est modifié dans les quantités ;
   - toutes les consommations : `status: 'done'` ; aucune quantité, date, coût ou note réécrit ;
   - catégories : ajout des méthodes du catalogue, la catégorie « Joint tabac + CBD » devient « Joint » si son nom n'a pas été personnalisé ;
   - projets, achats, stocks, nuits, objectifs : inchangés.
3. Les champs absents sont interprétés comme « non applicable », jamais comme zéro.
4. Les sauvegardes V1 restent importables (migration appliquée à l'import).
