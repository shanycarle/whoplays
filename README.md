# WhoPlays

WhoPlays est une application web/mobile de recherche de joueurs et de matchs sportifs, conçue pour offrir une expérience rapide et simple sur mobile, puis sur le web via une PWA.

## ⚠️ Version de test — mock data

Cette version actuelle est un premier prototype de test. Elle utilise des données simulées (mock data) pour valider le parcours utilisateur, l’interface et le rendu web/PWA.

- Les résultats affichés sont des données de démonstration.
- La géolocalisation et les matchs en temps réel peuvent être limités ou remplacés par des valeurs de test.
- L’objectif est de valider l’expérience avant de brancher les données réelles.

## 📱 Fonctionnalités

- Recherche de joueur par numéro
- Affichage de matchs et d’équipes
- Vue terrain et calendrier
- Historique de recherches
- Compatible web et mobile
- Expérience PWA avec installation possible depuis le navigateur

## 🛠️ Stack technique

- Expo / React Native
- React Native Web
- TypeScript
- AsyncStorage
- Expo Location
- GitHub Pages pour le déploiement web

## ▶️ Démarrage local

Prérequis :
- Node.js 20+
- npm

Installation :

```bash
cd mobile
npm install
npm run web
```

Build web :

```bash
cd mobile
npm run build:web
```

## 🌐 Déploiement GitHub Pages

Le projet est préparé pour être publié sur GitHub Pages via GitHub Actions.

Étapes :
1. Pousser le code sur GitHub
2. Ouvrir les paramètres du dépôt
3. Aller dans Pages
4. Choisir la branche `gh-pages`

## 📦 Structure du projet

```text
mobile/
  App.tsx
  app.config.js
  public/
  src/
  .github/workflows/deploy.yml
```

## ℹ️ Notes

Cette application est actuellement pensée comme une preuve de concept web/mobile en environnement de test. Les données utilisées peuvent évoluer au fil des intégrations réelles.
