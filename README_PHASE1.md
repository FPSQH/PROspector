# PROspector – Phase 1 : Onboarding & Données

## Ce que cette phase ajoute
- Flux d'onboarding commercial (saisie des communes du secteur)
- Autocomplétion des communes via API geo.api.gouv.fr (INSEE)
- Ingestion automatique des adresses BAN à l'activation d'une commune
- Carte MapLibre du secteur avec toutes les adresses colorées par type
- Dashboard principal avec stats de base
- Déconnexion

---

## Étape 1 – Appliquer la migration SQL

Dans Supabase > SQL Editor :
→ Coller le contenu de `supabase/migrations_phase1.sql` > Run

---

## Étape 2 – Pousser le code sur GitHub

```bash
git add .
git commit -m "Phase 1 – Onboarding communes + ingestion BAN + carte secteur"
git push
```

Vercel redéploie automatiquement.

---

## Étape 3 – Tester le flux complet

### Onboarding
1. Se connecter → redirigé vers `/onboarding` (pas de communes configurées)
2. Taper le nom d'une commune → suggestions apparaissent avec population
3. Cliquer sur une commune → elle s'ajoute, le badge "BAN…" apparaît
4. Attendre ~10–30 secondes → le badge devient "X adresses" en vert
5. La carte se met à jour avec les points d'adresses

### Carte
- Zoom < 14 : clusters de points (chiffre = nombre d'adresses)
- Zoom > 14 : points individuels colorés par type
  - 🟢 Vert = maison
  - 🔵 Bleu = appartement
  - 🟡 Jaune = commerce
  - ⚫ Gris = logement social
  - Gris clair = inconnu
- Clic sur un point = popup avec adresse + type

### Dashboard
- Accéder à `/dashboard` après onboarding
- Les stats affichent le nombre de communes et d'adresses
- "Modifier le secteur" revient à la page onboarding

---

## Architecture de l'ingestion BAN

```
Utilisateur ajoute commune
        ↓
POST /api/communes          → insère en DB + déclenche ingestion
        ↓ (fire & forget)
POST /api/ingestion/ban     → fetch BAN API + upsert adresses (lots 500)
        ↓
UPDATE communes.chargee_at  → marque la commune comme chargée
        ↓
Polling GET /api/communes/statut (toutes les 3s) → UI met à jour
```

L'ingestion se fait en arrière-plan. L'utilisateur peut continuer
à naviguer pendant le chargement.

---

## Nouveaux fichiers Phase 1

```
src/
├── app/
│   ├── (app)/(commercial)/
│   │   ├── onboarding/page.tsx    ← Saisie communes + carte
│   │   └── dashboard/page.tsx     ← Dashboard principal
│   ├── api/
│   │   ├── communes/
│   │   │   ├── route.ts           ← POST/DELETE commune
│   │   │   ├── search/route.ts    ← GET autocomplétion
│   │   │   └── statut/route.ts    ← GET statut ingestion
│   │   └── ingestion/ban/route.ts ← POST ingestion BAN
│   └── auth/signout/route.ts      ← Déconnexion
├── components/
│   ├── map/SecteurMap.tsx         ← Carte MapLibre
│   └── onboarding/
│       ├── SearchCommune.tsx      ← Autocomplétion
│       └── CommuneCard.tsx        ← Carte commune + statut
├── hooks/
│   ├── useCommercial.ts
│   └── useCommunes.ts
└── lib/ban/index.ts               ← Client API BAN
supabase/migrations_phase1.sql
```

---

## Prochaine étape : Phase 2
Algorithme de découpage automatique en 9 zones + interface d'édition des polygones
