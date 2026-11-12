# TRACK THE SMOKE

**Know your habits. Take back control.**

Application mobile personnelle (PWA installable sur iPhone, 100 % hors ligne, thème clair « Sable » ou sombre « Forêt ») pour **comprendre, quantifier, réduire puis arrêter** la consommation de tabac et de CBD : consommations, envies (résistées ou non), achats et budget, stocks, sommeil et bien-être, objectifs progressifs.

- Aucun compte, aucun serveur, aucune publicité, aucun traceur : les données restent sur l'appareil (IndexedDB).
- Jamais de culpabilisation : une consommation n'efface jamais les progrès, aucun compteur n'est remis à zéro.
- Aucune donnée inventée : une quantité ou un prix manquant est signalé, jamais remplacé.

## Démarrer

```bash
npm start          # serveur statique local → http://localhost:8080
npm test           # tests unitaires des calculs (node --test, aucune dépendance)
npm run e2e        # scénarios de validation dans Chromium (serveur lancé au préalable)
npm run icons      # régénère les icônes PNG depuis assets/icons/icon.svg
```

Aucune étape de build : le dossier peut être publié tel quel sur n'importe quel hébergement statique **HTTPS** (GitHub Pages, Netlify…). HTTPS est requis pour le service worker et Face ID.

### Installer sur iPhone

1. Ouvrir l'URL dans **Safari**.
2. Bouton **Partager** → **Sur l'écran d'accueil**.
3. L'application s'ouvre en plein écran, fonctionne hors ligne et respecte les zones de sécurité (Dynamic Island, barre gestuelle).

## Fonctionnalités

| Section | Contenu |
|---|---|
| **Accueil** | Dépenses jour / 7 j / mois, indicateurs par période (jour, 7 j, 30 j, mois, année) avec variations, raccourcis, timeline du jour modifiable, progression vs période précédente, parcours tabac/CBD, observations automatiques, rappels discrets. |
| **Journal** | Historique groupé par jour, recherche, filtres par catégorie, calendrier mensuel interactif (consommations, tabac, CBD, €, envies, sommeil), détail d'une journée, ajout à une date passée, modification, duplication, suppression avec annulation. |
| **Saisie** | Bouton + toujours visible ; catégories Joint tabac + CBD, Roulée, CBD seul, catégories personnalisées ; mode **pesée** ou **estimation** par composant ; dernière valeur / moyenne (n) ; heure automatique ; « Express » = enregistrement en un geste avec les dernières valeurs ; coût calculé en direct. |
| **Envies** | Intensité 0–10, produit, déclencheur, durée, situation, émotion ; issue résistée ou suivie d'une consommation (liée). |
| **Statistiques** | Synthèse, Tabac, CBD, Joints (moyennes avec nombre d'observations, histogrammes, part de CBD), Temps (heure, jour, période, carte de chaleur, semaines, mois), Envies, Sommeil (corrélations prudentes, calendrier des nuits), Finances, Simulateur, Habitudes. Filtre pesé / estimé. |
| **Objectifs** | Période d'observation 7–14 j, référence personnelle, objectifs (tabac, CBD, joints, roulées, budget, envies résistées, heure de première consommation) avec paliers libres et historique des révisions ; parcours **Arrêt du tabac** et **Arrêt du CBD** indépendants (jours sans, quantités et dépenses évitées). |
| **Apple Santé** | Import du sommeil mesuré par l'iPhone / l'Apple Watch : export complet de l'app Santé (`export.zip`) ou Raccourci iOS + presse-papiers pour l'import quotidien. Les saisies manuelles ne sont jamais écrasées. |
| **Profil** | Produits et prix, achats, accessoires, stocks, catégories, rappels, verrouillage (PIN / Face ID), export JSON / CSV, import (remplacer / fusionner), instantanés locaux, suppression définitive, mode démo séparé, informations santé. |

## Documentation technique

Voir [`docs/TECHNICAL.md`](docs/TECHNICAL.md).

> Cette application est un outil de suivi personnel. Elle ne fournit aucun diagnostic médical et ne remplace pas un professionnel de santé.
