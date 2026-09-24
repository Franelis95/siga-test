# SIGA Test · versions Android, Windows et Web sur serveur gratuit

Version de **test** de SIGA (Système Intégré de Gestion Administrative, DGREH), reliée à un serveur en ligne gratuit (Supabase) pour que plusieurs testeurs travaillent sur les mêmes dossiers, depuis un téléphone Android, un PC Windows ou un navigateur.

Le serveur définitif de la DGREH (schéma V1 à V7 sur PostgreSQL, installé en interne) viendra après les tests et le recueil des éléments manquants. Les applications seront alors pointées vers lui.

------

## Contenu du dossier

| Élément | Rôle |
|---|---|
| `supabase/schema.sql` | Base du serveur de test, à exécuter une fois dans Supabase |
| `src/app/` | Application SIGA (mêmes modules que la maquette) |
| `src/server.js`, `src/server.css` | Connexion, synchronisation, temps réel, hors connexion, comptes de test |
| `tools/build-web.mjs` | Assemble l'application en un seul fichier `www/index.html` |
| `tools/icons.mjs` | Icônes Android et Windows à partir du logo |
| `android/` | Projet Android (Capacitor) |
| `electron/main.js` | Application Windows (Electron) |
| `.github/workflows/build.yml` | Construction automatique de l'APK, des .exe et de la version web sur GitHub |
| `supabase/test_schema.sql`, `resultats_*.txt` | Tests du serveur et de l'application, avec leurs résultats |

------

## Étape 1 · Créer le serveur de test (10 minutes, gratuit)

1. Créez un compte sur **supabase.com**, puis **New project** :
   - nom : `siga-test` ;
   - région : **West EU (Ireland)** ou **Central EU (Frankfurt)**, les plus proches ;
   - mot de passe de la base : notez-le, il ne sert qu'en cas de dépannage.
2. Menu **SQL Editor** › **New query** : collez tout le contenu de `supabase/schema.sql`, puis **Run**. Le message attendu est « Success. No rows returned ». Le script peut être relancé sans dommage.
3. Menu **Authentication** › **Sign In / Providers** › **Email** : **désactivez « Allow new users to sign up »**. Seuls les comptes que vous créez pourront entrer.
4. Menu **Authentication** › **Users** › **Add user** › **Create new user** : créez votre compte administrateur (e-mail, mot de passe) en cochant **Auto Confirm User**.
5. De retour dans **SQL Editor**, exécutez, avec votre adresse :
   ```sql
   select siga_bootstrap_admin('votre.adresse@exemple.bf');
   ```
6. Menu **Project Settings** › **API Keys** (ou **Data API**), relevez :
   - la **Project URL**, de la forme `https://xxxx.supabase.co` ;
   - la **clé publique** : `anon` (commence par `eyJ…`) ou `publishable` (commence par `sb_publishable_…`).

   Ces deux valeurs ne sont pas secrètes : la protection vient des comptes et des règles d'accès de la base. Ne communiquez **jamais** la clé `service_role` ou `secret`.

------

## Étape 2 · Premier essai immédiat, sans GitHub

- **Windows** : lancez `SIGA-Test-0.9.0-installation.exe` (fourni à part). Au premier démarrage, dépliez « Serveur à configurer », collez l'adresse et la clé publique, puis connectez-vous.
- **Navigateur, sur PC ou sur téléphone Android** : ouvrez `SIGA-Test-web.html` dans Chrome ou Edge. Même écran de connexion.

L'adresse du serveur est retenue sur l'appareil. La session, elle, ne l'est pas : il faut se reconnecter à chaque ouverture.

------

## Étape 3 · Créer les comptes des testeurs

1. Dans Supabase, **Authentication** › **Users** › **Add user** pour chaque testeur, avec **Auto Confirm User** coché.
2. Dans SIGA, connecté en administrateur : **Système** › **Comptes de test**.
   - Saisissez l'e-mail, choisissez l'agent dans la liste du personnel, puis **Rattacher**.
   - Le testeur agit avec les droits de cet agent : DG, directeur, chef de service, secrétariat, RH, BCMS, etc.
   - Ne cochez **« Voir en tant que »** que pour les testeurs pilotes qui doivent parcourir SIGA avec d'autres profils.
3. Toujours dans **Comptes de test** :
   - **Charger les exemples** met en place des dossiers de démonstration, tous marqués « Exemple ». Ce choix est facultatif.
   - **Vider la base de test** remet tout à zéro. Les comptes sont conservés.

Chaque testeur peut changer son mot de passe depuis son nom, en haut à droite, puis **Mon compte**.

------

## Étape 4 · Construire l'APK Android et les versions à jour (GitHub, gratuit)

L'APK Android ne peut être fabriqué que par la chaîne de construction GitHub, qui fournit les outils Android.

1. Créez un compte sur **github.com**, puis **New repository** :
   - nom : `siga-test` ;
   - **Public** si vous voulez aussi la version web en ligne (GitHub Pages) ;
   - **Private** convient pour l'APK et les .exe.
2. Dans le dépôt vide, choisissez **uploading an existing file**. Glissez **tout le contenu** du dossier décompressé (85 fichiers, y compris `.github` et `.gitignore`), puis **Commit changes**.
3. **Settings** › **Secrets and variables** › **Actions** › **New repository secret**, deux fois :
   - `SIGA_SUPABASE_URL` : l'adresse du projet ;
   - `SIGA_SUPABASE_ANON_KEY` : la clé publique.

   Les applications construites seront alors déjà réglées sur votre serveur.
4. Pour la version web (facultatif, dépôt public) : **Settings** › **Pages** › **Source : GitHub Actions**.
5. Onglet **Actions** › **Construire SIGA Test** › **Run workflow**. Comptez environ 10 minutes. Chaque nouvel envoi de fichiers relance la construction.
6. Onglet **Releases** › **SIGA Test (dernière construction)**. Vous y trouvez :
   - `SIGA-Test.apk` pour Android ;
   - `SIGA-Test-0.9.0-installation.exe` pour installer sous Windows ;
   - `SIGA-Test-0.9.0-portable.exe` pour lancer sans installer.

   La version web est à l'adresse indiquée dans **Settings** › **Pages**.

------

## Étape 5 · Installer sur les appareils des testeurs

**Android, version 7 ou plus**
1. Envoyez l'APK sur le téléphone : lien de la page Releases, WhatsApp ou câble.
2. Ouvrez-le et autorisez **« Installer des applications inconnues »** pour l'application qui l'ouvre (Chrome, Fichiers, WhatsApp).
3. Si **Play Protect** avertit, choisissez **Plus de détails** › **Installer quand même**. L'application n'est pas publiée sur le Play Store, d'où l'avertissement.

Les mises à jour s'installent par-dessus l'ancienne version, sans perte.

**Windows 10 ou 11**
1. Si SmartScreen affiche « Windows a protégé votre ordinateur », cliquez **Informations complémentaires** › **Exécuter quand même**. L'application n'est pas signée par un éditeur reconnu, d'où l'avertissement.
2. L'installation se fait dans le profil de l'utilisateur, sans droits d'administrateur, avec un raccourci sur le bureau.

------

## Ce que fait le serveur de test

- **Dossiers partagés** : ce qu'un testeur enregistre apparaît chez les autres en temps réel.
- **Numéros officiels attribués par le serveur**, sans trou ni doublon, même quand deux testeurs enregistrent en même temps :
  - arrivée ;
  - départ ;
  - bordereau ;
  - ordre de mission ;
  - note de service ;
  - demandes.

  Tant qu'un numéro n'est pas attribué, il s'affiche « ··· ».
- **Journal d'audit chaîné**, calculé par le serveur. Une ligne ne peut être ni modifiée ni supprimée, et la vérification se fait depuis **Comptes de test**.
- **Deux modifications simultanées du même dossier** : la seconde est refusée. Son auteur voit la version à jour et refait son action. Aucune modification n'est écrasée en silence.
- **Hors connexion** : la consultation et les brouillons restent possibles, et ils partent au retour du réseau. Les **décisions** ne sont pas possibles hors connexion : avis, validations, signatures, imputations, transmissions (règle ADR-15). Le bandeau en haut indique l'état : « En ligne · à jour », « Enregistrement… » ou « Hors connexion · N modifications en attente ».
- **Séparation des droits** :
  - chaque compte ne voit que les données de son organisation ;
  - personne ne peut supprimer un dossier ;
  - un compte non rattaché ne peut pas entrer.

## Limites connues de cette version de test

- **Pièces jointes** : les fichiers scannés (décision de congé, OM signé) ne sont pas encore conservés, seule leur mention l'est.
- **Contrôle des règles métier** : elles sont contrôlées par l'application. Le serveur définitif de la DGREH les contrôlera aussi en base (V1 à V7).
- **Mise en veille du projet gratuit** : Supabase le met en pause après 7 jours sans activité. Il suffit de cliquer **Restore project** dans le tableau de bord.
- **Données fictives** : ne saisissez pas de données personnelles sensibles réelles, par exemple le motif « Maladie » d'une vraie absence. Ce serveur n'est pas hébergé à la DGREH.
- **Clé de signature Android** : celle du dépôt sert uniquement aux tests. La version définitive aura une clé conservée par la DGREH.
- **Fenêtre applicative** : les applications Android et Windows affichent SIGA dans une fenêtre applicative (WebView ou Electron), et le principe reste :
  - elles n'ouvrent que l'application embarquée, jamais une page extérieure ;
  - la page n'a aucun accès au système ;
  - les liens externes partent dans le navigateur.

------

## Pour les développeurs

```bash
npm ci                      # dépendances
npm run build:web           # www/index.html (SIGA_SUPABASE_URL et SIGA_SUPABASE_ANON_KEY facultatifs)
npm run start:desktop       # lancer la version Windows/Linux
npm run android:sync        # puis ouvrir android/ dans Android Studio
npm run win                 # installateur Windows (sous Windows)
npm run icons               # régénérer les icônes depuis build/logo.webp
```

**Vérifications effectuées avant livraison**

- **Base de test** (`supabase/resultats_tests_schema.txt`) : 36 tests, 0 échec. Ils couvrent :
  - la numérotation ;
  - la chaîne d'audit ;
  - le contrôle de version ;
  - l'isolation entre organisations ;
  - les droits des fonctions.
- **Intégration** (`supabase/resultats_test_integration.txt`) : 38 tests, 0 échec, avec un vrai navigateur, une vraie API PostgREST et deux testeurs simultanés, l'administrateur et le DG. Ils couvrent :
  - la connexion ;
  - le rattachement de compte ;
  - le chargement des exemples ;
  - la numérotation ;
  - le journal ;
  - les 18 modules ;
  - les conflits ;
  - la coupure et le retour du réseau ;
  - la remise à zéro.
- **Application Windows** : lancée et connectée avec succès. Aucune erreur, et la page n'a aucun accès au système.
