# BAKA – Draft (étape 3 : hub et rooms)

## Lancer en local
VS Code → extension **Live Server** → clic droit sur `docs/index.html` → *Open with Live Server*.
(Les modules ES ne marchent pas en `file://`.)

## Configurer Firebase (gratuit, plan Spark, sans carte bancaire)
1. https://console.firebase.google.com → **Ajouter un projet** (désactive Google Analytics).
2. **Build → Authentication → Commencer** → onglet *Sign-in method* : active **Anonyme** et **Google** (choisis ton e-mail d'assistance).
3. Authentication → **Settings → Authorized domains** : ajoute `127.0.0.1` et `TONPSEUDO.github.io`. (`localhost` est déjà présent.)
4. **Build → Realtime Database → Créer** : choisis la région Europe, mode **verrouillé**. Onglet **Règles** : colle le contenu de `firebase/database.rules.json` puis **Publier**.
5. **Paramètres du projet (roue dentée) → Vos applications → </> Web** : enregistre l'app, copie l'objet `firebaseConfig` dans `docs/js/config/firebase-config.js`. Vérifie que `databaseURL` est présent (sinon copie l'URL affichée en haut de Realtime Database).

## Déployer sur GitHub Pages
Repo GitHub → pousse le dossier → **Settings → Pages → Branch: main, dossier /docs**.
