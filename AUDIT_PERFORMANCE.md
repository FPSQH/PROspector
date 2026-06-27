# Audit Performance — PROspector

> Généré le 2026-06-27. À utiliser comme checklist avant/après corrections.

---

## Comment utiliser ce fichier

Pour chaque problème :
1. Lire le fichier ciblé aux lignes indiquées
2. Appliquer la correction proposée
3. Vérifier l'impact (critères listés sous chaque item)
4. Cocher la case `[ ]` → `[x]`

---

## 🔴 Critiques

### C1 — Import MapLibre statique dans `courriers/page.tsx`

- **Fichier** : `src/app/(app)/(commercial)/courriers/page.tsx`, lignes 6–8
- **Problème** : `import maplibregl from 'maplibre-gl'` au niveau module dans un composant `'use client'`. MapLibre pèse ~800 Ko gzippé. La page courriers charge ce bundle même quand aucune carte n'est affichée.
- **Référence** : `terrain/page.tsx` fait correctement `dynamic(() => import(...), { ssr: false })`.

**Correction à appliquer :**
```ts
// AVANT
import maplibregl from 'maplibre-gl'

// APRÈS — import dynamique, ne charge le bundle que si la carte est rendue
const MapComponent = dynamic(() => import('@/components/map/MonComposantCarte'), { ssr: false })
```

**Vérification d'impact :**
- [ ] `next build` → inspecter la taille du chunk JS de la page `/courriers` (doit diminuer de ~800 Ko)
- [ ] La carte s'affiche toujours correctement sur `/courriers`
- [ ] Aucune erreur SSR (`window is not defined`, etc.)

---

### C2 — Boucles `while(true)` séquentielles dans `dashboard/page.tsx`

- **Fichier** : `src/app/(app)/(commercial)/dashboard/page.tsx`, lignes 644–665 et 680–695
- **Problème** : Deux boucles de pagination séquentielles sur `dpe_logement` dans un Server Component. Chaque itération attend la précédente. Pour un secteur dense (5 000+ DPE), cela génère 5+ roundtrips DB avant que la page ne s'affiche.

**Correction à appliquer :**
Remplacer les boucles par une RPC SQL qui fait le `COUNT` / agrégat directement en base :
```sql
-- Exemple de RPC à créer dans Supabase
create or replace function count_dpe_par_classe(commercial_id uuid)
returns table(classe text, count bigint) ...
```
Ou séparer ces blocs en routes API distinctes appelées avec `Suspense` + skeleton UI côté client.

**Vérification d'impact :**
- [ ] Time to First Byte (TTFB) de `/dashboard` diminue (mesurer avec DevTools → Network)
- [ ] Le dashboard s'affiche sans attendre la fin des calculs DPE
- [ ] Les KPIs DPE affichent les mêmes valeurs qu'avant

---

### C3 — Aucune pagination sur `GET /api/contacts`

- **Fichier** : `src/app/api/contacts/route.ts`, ligne ~55
- **Problème** : La requête Supabase n'a aucun `.limit()`. Un commercial avec 500+ contacts charge tout en mémoire sur chaque appel. La page contacts filtre côté client mais transfère inutilement toutes les lignes.

**Correction à appliquer :**
```ts
// AVANT
const { data } = await supabase.from('contacts').select(...)

// APRÈS
const limit = parseInt(searchParams.get('limit') ?? '50')
const offset = parseInt(searchParams.get('offset') ?? '0')
const { data } = await supabase
  .from('contacts')
  .select(...)
  .range(offset, offset + limit - 1)
```
Côté client (`contacts/page.tsx`) : implémenter une pagination infinie (bouton "Charger plus" ou scroll infini).

**Vérification d'impact :**
- [ ] La réponse de `/api/contacts` retourne au maximum 50 items par défaut
- [ ] La page contacts affiche les premiers contacts sans délai perceptible
- [ ] Le filtre texte fonctionne toujours (adapter pour filtrer via query param si nécessaire)
- [ ] Aucune régression sur le compteur de contacts dans le dashboard

---

## 🟠 Importants

### I1 — Pagination séquentielle dans `adresses/secteur/route.ts`

- **Fichier** : `src/app/api/adresses/secteur/route.ts`, lignes 27–41
- **Problème** : Boucle `while(true)` avec pagination interne traitée commune par commune, en séquentiel. 10 communes = 10+ roundtrips séquentiels.

**Correction à appliquer :**
```ts
// AVANT — séquentiel
for (const commune of communes) {
  let page = 0
  while (true) {
    const { data } = await supabase.from('adresses').select(...).eq('code_insee', commune).range(page*500, ...)
    if (!data?.length) break
    page++
  }
}

// APRÈS — parallel par commune
const results = await Promise.all(
  communes.map(commune => fetchAllAdressesForCommune(commune))
)
```

**Vérification d'impact :**
- [ ] Temps de réponse de `/api/adresses/secteur` diminue (mesurer avec 5+ communes)
- [ ] Le nombre total d'adresses retournées est identique
- [ ] Pas de timeout Vercel (limite 10s sur le plan hobby)

---

### I2 — `dpe_logement` sans `.limit()` dans `zones/[id]/adresses/route.ts`

- **Fichier** : `src/app/api/zones/[id]/adresses/route.ts`, ligne ~92
- **Problème** : Requête `dpe_logement` filtrée par `adresse_id IN (...)` sans limite. Une zone de 500 adresses avec 10 DPE historiques chacune → 5 000 lignes retournées.

**Correction à appliquer :**
```ts
// Option A — ne garder que le DPE le plus récent par adresse via RPC
// Option B — ajouter une limite explicite
const { data: dpeData } = await supabase
  .from('dpe_logement')
  .select('adresse_id, classe_energie, date_etablissement_dpe')
  .in('adresse_id', adresseIds)
  .order('date_etablissement_dpe', { ascending: false })
  // Filtrer côté JS pour garder 1 DPE par adresse_id (le plus récent)
```

**Vérification d'impact :**
- [ ] Le volume de données retourné par `/api/zones/[id]/adresses` est proportionnel au nombre d'adresses (pas aux DPE historiques)
- [ ] L'affichage du DPE par adresse est correct (classe la plus récente)

---

### I3 — Sessions sans `.limit()` dans `zones/stats/route.ts`

- **Fichier** : `src/app/api/zones/stats/route.ts`, lignes 42–50 et 100–112
- **Problème 1** : Récupère TOUTES les sessions pour trouver la dernière par zone. Pour un commercial actif (200+ sessions), transfère inutilement toutes les lignes.
- **Problème 2** : Boucle séquentielle sur batches d'IDs pour compter les DPE.

**Correction à appliquer :**
```ts
// Problème 1 — limiter au nombre de zones (1 session suffit par zone)
const { data: lastSessRes } = await supabase
  .from('sessions')
  .select('zone_id, created_at')
  .in('zone_id', zoneIds)
  .order('created_at', { ascending: false })
  .limit(zoneIds.length)  // ← ajouter

// Problème 2 — remplacer la boucle par une RPC SQL COUNT
```

**Vérification d'impact :**
- [ ] Les stats de zone affichent la bonne "dernière session"
- [ ] Temps de réponse de `/api/zones/stats` diminue sur un compte avec 100+ sessions

---

## 🟡 Modérés

### M1 — Marqueurs contacts recréés en DOM à chaque render (`TerrainMap.tsx`)

- **Fichier** : `src/components/terrain/TerrainMap.tsx`, lignes 324–341
- **Problème** : À chaque changement de `contacts`, `showContacts` ou `mapLoaded`, tous les marqueurs DOM sont supprimés et recréés. Pour 50+ contacts, chaque update force 50 suppressions + 50 créations d'éléments DOM.

**Correction à appliquer :**
Remplacer les marqueurs DOM individuels par une source GeoJSON + layer MapLibre (comme les adresses) :
```ts
map.addSource('contacts-source', { type: 'geojson', data: contactsGeoJSON })
map.addLayer({ id: 'contacts-layer', type: 'circle', source: 'contacts-source', ... })
// Mise à jour : map.getSource('contacts-source').setData(newGeoJSON)
```

**Vérification d'impact :**
- [ ] Les contacts s'affichent correctement sur la carte terrain
- [ ] Pas de lag perceptible lors du toggle "Afficher contacts"
- [ ] Les popups contacts fonctionnent toujours au clic

---

### M2 — `SELECT *` dans les hooks

- **Fichiers** :
  - `src/hooks/useCommercial.ts`, ligne ~20
  - `src/hooks/useCommunes.ts`, ligne ~16
  - `src/app/(app)/(commercial)/dashboard/page.tsx`, ligne ~383
  - `src/app/api/projets/route.ts`, ligne ~17

- **Problème** : `.select('*')` transfère toutes les colonnes y compris des champs potentiellement lourds (métadonnées, blobs) inutiles pour l'usage cible.

**Correction à appliquer :**
```ts
// AVANT
supabase.from('commerciaux').select('*')

// APRÈS — ne sélectionner que ce qui est utilisé
supabase.from('commerciaux').select('id, nom, prenom, role, must_change_password, manager_id')
```

**Vérification d'impact :**
- [ ] Les colonnes sélectionnées couvrent tous les usages dans le composant
- [ ] Aucune erreur TypeScript sur les champs manquants (adapter le type si nécessaire)

---

### M3 — Aucun `Cache-Control` sur les routes GET stables

- **Fichiers** :
  - `src/app/api/communes/route.ts`
  - `src/app/api/zones/route.ts`
  - `src/app/api/zones/stats/route.ts`

- **Problème** : Next.js 14+ met toutes les routes en `no-store` par défaut. Ces données changent rarement (communes = quasi-statique, zones = change seulement après régénération).

**Correction à appliquer :**
```ts
// Dans le handler GET
return NextResponse.json(data, {
  headers: {
    'Cache-Control': 'private, max-age=60, stale-while-revalidate=120'
  }
})
```

**Vérification d'impact :**
- [ ] Les headers de réponse incluent `Cache-Control` (vérifier dans DevTools → Network)
- [ ] Les données sont toujours à jour après une modification (ex: ajout d'une commune)
- [ ] Pas de données d'un autre utilisateur servies par erreur (vérifier `private` vs `public`)

---

## 🟢 Mineurs

### Mi1 — Fonction `() => {}` inline dans `terrain/page.tsx`

- **Fichier** : `src/app/(app)/(commercial)/terrain/page.tsx`, lignes 722 et 773
- **Problème** : `onAdresseClick={() => {}}` crée une nouvelle référence à chaque render, déclenchant inutilement un `useEffect` dans `TerrainMap` (ligne 111).

**Correction :**
```ts
const noop = useCallback(() => {}, [])
// ...
<TerrainMap onAdresseClick={noop} ... />
```

**Vérification d'impact :**
- [ ] Pas de re-render visible sur la carte terrain lors d'interactions non liées aux adresses

---

### Mi2 — `ignoreBuildErrors` dans `next.config.js`

- **Fichier** : `next.config.js`, lignes 11–17
- **Problème** : TypeScript et ESLint silencés au build. Masque des problèmes potentiellement détectés et empêche certaines optimisations Next.js.

**Correction :** Activer progressivement, corriger les erreurs TypeScript/ESLint remontées, puis retirer ces flags.

**Vérification d'impact :**
- [ ] `next build` passe sans erreurs TypeScript
- [ ] `next build` passe sans erreurs ESLint
- [ ] Aucune régression fonctionnelle

---

## Récapitulatif

| ID | Priorité | Statut | Fichier principal |
|----|----------|--------|-------------------|
| C1 | 🔴 Critique | [x] | `courriers/page.tsx:6` |
| C2 | 🔴 Critique | [x] | `dashboard/page.tsx:644` |
| C3 | 🔴 Critique | [x] | `api/contacts/route.ts:55` |
| I1 | 🟠 Important | [x] | `api/adresses/secteur/route.ts:27` |
| I2 | 🟠 Important | [x] | `api/zones/[id]/adresses/route.ts:92` |
| I3 | 🟠 Important | [x] | `api/zones/stats/route.ts:42` |
| M1 | 🟡 Modéré | [ ] | `TerrainMap.tsx:324` |
| M2 | 🟡 Modéré | [ ] | `useCommercial.ts:20`, `useCommunes.ts:16` |
| M3 | 🟡 Modéré | [x] | routes GET (communes, zones, stats) |
| Mi1 | 🟢 Mineur | [x] | `terrain/page.tsx:722` |
| Mi2 | 🟢 Mineur | [ ] | `next.config.js:11` |
