# PROspector – Phase 0 : Installation & Configuration

## Ce que cette phase met en place
- Projet Next.js 14 avec TypeScript
- Base de données Supabase (PostgreSQL + PostGIS + Auth + RLS)
- Authentification Microsoft 365 (SSO)
- Déploiement automatique sur Vercel via GitHub

---

## Étape 1 – Configurer Supabase

### 1.1 Activer PostGIS
Dans le Dashboard Supabase :
→ Database > Extensions > Rechercher "postgis" > Activer

### 1.2 Créer le schéma
→ SQL Editor > New Query > Coller le contenu de `supabase/schema.sql` > Run

Vérifier dans Table Editor que les tables suivantes existent :
- commerciaux, communes, adresses, zones_prospection
- sessions_prospection, interactions, contacts, rendez_vous

### 1.3 Configurer Microsoft SSO
→ Authentication > Providers > Azure > Activer

Dans le **portail Azure** (portal.azure.com) :
1. Azure Active Directory > App registrations > New registration
   - Nom : PROspector
   - Redirect URI : `https://VOTRE_REF.supabase.co/auth/v1/callback`
2. Certificates & Secrets > New client secret → copier la valeur
3. API permissions > Add > Microsoft Graph > User.Read (delegated)

Retour dans Supabase :
- Azure Application (client) ID → coller dans "Client ID"
- Secret créé ci-dessus → coller dans "Client Secret"
- Sauvegarder

### 1.4 Récupérer les clés API
→ Settings > API
- Copier `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- Copier `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Copier `service_role` → `SUPABASE_SERVICE_ROLE_KEY`

---

## Étape 2 – Configurer le projet local

```bash
# Cloner / initialiser le repo
git clone https://github.com/VOTRE_COMPTE/prospector.git
cd prospector

# Installer les dépendances
npm install

# Configurer les variables d'environnement
cp .env.local.example .env.local
# Éditer .env.local avec les valeurs Supabase de l'étape 1.4
```

### Tester en local
```bash
npm run dev
```
→ Ouvrir http://localhost:3000
→ Cliquer "Se connecter avec Microsoft 365"
→ Vous devez être redirigé vers /dashboard après connexion

---

## Étape 3 – Déployer sur Vercel

1. Aller sur vercel.com > Add New Project
2. Importer le repo GitHub `prospector`
3. Framework : Next.js (détecté automatiquement)
4. Environment Variables → ajouter les 3 variables de .env.local
5. Deploy

### Mettre à jour la Redirect URI Azure
Après le déploiement Vercel, vous avez une URL du type `https://prospector.vercel.app`

Dans le portail Azure > App registration > Authentication :
- Ajouter Redirect URI : `https://prospector.vercel.app/auth/callback`

Dans Supabase > Authentication > URL Configuration :
- Site URL : `https://prospector.vercel.app`
- Redirect URLs : `https://prospector.vercel.app/**`

---

## Étape 4 – Créer le premier utilisateur manager

Après connexion SSO, le compte est créé avec le rôle `commercial` par défaut.

Pour promouvoir en manager :
→ Supabase > Table Editor > commerciaux
→ Trouver votre ligne > Éditer > role = `manager` > Save

---

## Vérification finale

| Test | Attendu |
|------|---------|
| `https://prospector.vercel.app` | Redirige vers /login |
| Clic "Se connecter avec Microsoft 365" | Ouvre fenêtre OAuth Microsoft |
| Après auth | Redirige vers /dashboard |
| Déconnexion | Redirige vers /login |

---

## Structure du projet

```
prospector/
├── src/
│   ├── app/
│   │   ├── (auth)/login/     ← Page de connexion
│   │   ├── auth/callback/    ← Callback OAuth
│   │   ├── (app)/dashboard/  ← App principale (Phase 1+)
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── lib/supabase/
│   │   ├── client.ts         ← Client navigateur
│   │   └── server.ts         ← Client serveur
│   ├── types/database.ts     ← Types TypeScript
│   └── middleware.ts         ← Protection des routes
├── supabase/
│   └── schema.sql            ← Schéma complet à exécuter
├── public/manifest.json      ← Config PWA
└── .env.local.example        ← Modèle variables d'env
```

---

## Prochaine étape : Phase 1
Onboarding commercial → saisie des communes → ingestion BAN → carte secteur
