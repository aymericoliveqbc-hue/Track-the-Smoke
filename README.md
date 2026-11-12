# TRACK THE SMOKE

**Know your habits. Take back control.**

Application mobile personnelle (PWA installable sur iPhone, 100 % hors ligne) au design « nature premium » — vert forêt et sauge sur ivoire, mode sombre vert-noir, illustrations dédiées à chaque méthode — pour **comprendre, quantifier, réduire ou arrêter** sa consommation — cigarettes, roulées, joints, CBD et autres cannabinoïdes, vape, puff, cigare, cigarillo, pipe, chicha ou méthode personnalisée : consommations et sessions, envies, achats et budget, stocks, sommeil, objectifs par méthode.

- Aucun compte, aucun serveur, aucune publicité, aucun traceur : les données restent sur l'appareil (IndexedDB). L'assistant IA est facultatif et n'envoie rien sans accord explicite.
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

## Fonctionnalités (V2)

Navigation : **Accueil · Journal · ＋ · Progrès · Réglages**.

| Écran | Contenu |
|---|---|
| **Configuration guidée** | Méthodes utilisées (catalogue de 10 + personnalisées) → produits et prix → méthode principale → mode par méthode (suivi libre, réduction, arrêt). Modifiable à tout moment dans Réglages › Mes habitudes. |
| **Accueil** | Sessions en cours, la journée en un coup d'œil (quantités par méthode, coût), gestes rapides des méthodes actives (principale mise en avant), paquets en cours, projet, 7 derniers jours. |
| **＋ / gestes** | Un geste par méthode : joint, roulée, cigarette enregistrés immédiatement (« Modifier » juste après) ; vape, chicha, pipe, cigare démarrent une **session** ; puff : pavé de bouffées (+1, +3…). « Autre consommation » pour une méthode inhabituelle (exceptionnelle, sans toucher aux raccourcis). Saisie détaillée : composition du joint, ingrédients multiples, liquide, unités, consommation partielle, heure de fin. |
| **Sessions** | Début / fin, fin à une heure passée en cas d'oubli, sessions à travers minuit, garde-fou contre les doublons, rappel facultatif si une session reste ouverte. |
| **Journal** | Historique, recherche, filtres selon les méthodes réellement utilisées (y compris retirées), calendrier, détail d'une journée, achats, badges de fiabilité. |
| **Progrès** | 7 onglets — Conso, Argent, Sessions, Envies, Sommeil, Objectifs, Produits — sur 7 j / 30 j / 90 j / 6 mois / 1 an / période libre. |
| **Argent** | Trois économies distinctes : **réalisées** (par rapport à « avant l'app »), **évitées** depuis un arrêt (estimation), **potentielles** (simulateur : arrêt d'une ou plusieurs méthodes, réduction). Coût par méthode et par produit, achats payés vs valeur consommée (jamais additionnés). |
| **Quantités** | Fiabilité affichée partout : **pesée**, **calculée** (paquets terminés, comptages de stock), **estimée**, **provisoire**, **inconnue**. Moyennes adaptatives par méthode et par produit, avec historique (Réglages › Mes moyennes). |
| **Produits & stocks** | Tabac, cannabinoïdes, cigarettes, cigares, e-liquides, puffs, appareils, accessoires : achats datés, stock = initial + achats ± corrections − consommations − pertes. |
| **Projets d'épargne** | Projets génériques (voyage, épargne, achat, logement, loisirs…) ; répartition des économies entre projets plafonnée à 100 % (aucun double comptage). |
| **Assistant IA** (facultatif) | Clé API personnelle. Estimation du budget d'un projet (seule sa description est envoyée) ; analyse d'une période **sur accord explicite**, avec aperçu exact des agrégats envoyés, chiffres non vérifiables signalés, sans diagnostic. |
| **Apple Santé** | Import du sommeil (export complet ou Raccourci iOS). |
| **Réglages** | Habitudes, produits, achats, stocks, moyennes, rappels, apparence (Clair / Sombre / Auto), verrouillage PIN / Face ID, export / import, mode démo. |

Les données d'une version précédente sont **migrées automatiquement** (instantané conservé avant migration) ; rien n'est supprimé ni réécrit.

## Documentation

- Technique : [`docs/TECHNICAL.md`](docs/TECHNICAL.md)
- Système de design (couleurs, typographie, illustrations, composants, mouvement) : [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md)

> Cette application est un outil de suivi personnel. Elle ne fournit aucun diagnostic médical et ne remplace pas un professionnel de santé.
