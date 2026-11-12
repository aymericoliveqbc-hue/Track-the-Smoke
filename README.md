# TRACK THE SMOKE

**Know your habits. Take back control.**

Application mobile personnelle (PWA installable sur iPhone, 100 % hors ligne, interface épurée blanc & vert) pour **comprendre, quantifier, réduire puis arrêter** la consommation de tabac et de CBD : consommations, envies (résistées ou non), achats et budget, stocks, sommeil et bien-être, objectifs progressifs.

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

Navigation : **Accueil · Journal · ＋ · Progrès · Réglages**.

| Écran | Contenu |
|---|---|
| **Accueil** | La journée en un coup d'œil (consommations, joints, roulées, envies résistées, grammes, coût), quatre gestes (Joint, Roulée, Envie, Autre), paquets en cours, 7 derniers jours, timeline du jour. |
| **＋ / gestes** | Joint ou roulée enregistrés **en un geste** avec quantités calculées automatiquement ; « Modifier » juste après si besoin. Saisie détaillée disponible (heure, quantités, contexte). |
| **Journal** | Historique par jour, recherche, filtres, calendrier mensuel, détail d'une journée, modification, duplication, suppression avec annulation. |
| **Progrès** | Conso, Argent (dont « Et si… je réduisais »), Envies, Sommeil, Objectifs — en phrases simples ; analyses détaillées à un geste. |
| **Mes paquets** | Sans balance : paquets neufs ou entamés, « il en reste… » à l'œil, paquet terminé → grammes réels par joint et par roulée, de plus en plus précis. |
| **Apple Santé** | Import du sommeil (export complet ou Raccourci iOS). |
| **Réglages** | Produits et prix, achats, stocks, catégories, rappels, verrouillage PIN / Face ID, export / import, mode démo, informations santé. |

## Documentation technique

Voir [`docs/TECHNICAL.md`](docs/TECHNICAL.md).

> Cette application est un outil de suivi personnel. Elle ne fournit aucun diagnostic médical et ne remplace pas un professionnel de santé.
