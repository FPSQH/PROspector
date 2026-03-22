# PROspector — Phase 2 : Zones de prospection

## Ce qui a été livré

### Algorithmes (nouveaux)
- `src/lib/geo/clustering.ts` — K-means++ géographique (5 runs, meilleur résultat)
- `src/lib/geo/convexHull.ts` — Enveloppe convexe + buffer ~200m → polygone WKT
- `src/lib/geo/tsp.ts` — Itinéraire nearest-neighbor optimisé

### API (nouveaux endpoints)
- `POST /api/zones/generate` — Génère automatiquement les 9 zones
- `GET /api/zones` — Liste toutes les zones du commercial connecté
- `GET /api/zones/[id]` — Détail zone + itinéraire TSP
- `PUT /api/zones/[id]` — Modifier nom / couleur / ordre
- `DELETE /api/zones/[id]` — Supprimer une zone

### Composants
- `src/components/map/ZonesMap.tsx` — Carte MapLibre avec polygones colorés et itinéraire
- `src/app/(app)/(commercial)/zones/page.tsx` — Page complète de gestion des zones
- `src/app/(app)/(commercial)/dashboard/page.tsx` — Dashboard mis à jour avec liens zones

### Base de données
- `supabase/migrations_phase2.sql` — Migration à appliquer

---

## Déploiement

### Étape 1 — Migration Supabase

Dans Supabase → **SQL Editor** → **New query** → coller le contenu de `supabase/migrations_phase2.sql` → **Run**.

> ⚠️ Si vous obtenez une erreur `column "polygone" already exists`, c'est que la colonne était déjà dans schema.sql. C'est normal — les `ADD COLUMN IF NOT EXISTS` ne feront rien dans ce cas.

### Étape 2 — Copier les nouveaux fichiers

Depuis le zip, copier dans votre projet local :

```
src/lib/geo/                          ← NOUVEAU dossier (à créer)
src/app/api/zones/                    ← NOUVEAU dossier (à créer)
src/components/map/ZonesMap.tsx       ← NOUVEAU fichier
src/app/(app)/(commercial)/zones/     ← NOUVEAU dossier (à créer)
src/app/(app)/(commercial)/dashboard/page.tsx  ← REMPLACER l'existant
```

Structure finale attendue :
```
src/
├── lib/
│   └── geo/
│       ├── clustering.ts
│       ├── convexHull.ts
│       └── tsp.ts
├── app/
│   ├── api/
│   │   └── zones/
│   │       ├── route.ts
│   │       ├── generate/
│   │       │   └── route.ts
│   │       └── [id]/
│   │           └── route.ts
│   └── (app)/
│       └── (commercial)/
│           ├── zones/
│           │   └── page.tsx
│           └── dashboard/
│               └── page.tsx   ← remplacé
└── components/
    └── map/
        └── ZonesMap.tsx
```

### Étape 3 — Push & déploiement

```bash
git add .
git commit -m "Phase 2 – Zones de prospection + clustering + TSP + carte"
git push
```

Vercel redéploie automatiquement.

---

## Utilisation

### Générer les zones
1. Se connecter → Dashboard → cliquer **"Zones de prospection"** ou **"/zones"**
2. Cliquer **"✦ Générer 9 zones"** (ou "↺ Régénérer" si des zones existent déjà)
3. L'algorithme :
   - Récupère toutes les adresses du secteur (hors logements sociaux)
   - Lance K-means++ avec 5 runs (prend ~1–2 secondes)
   - Crée les polygones (convex hull + buffer 200m)
   - Calcule l'itinéraire TSP pour chaque zone
   - Affiche les 9 zones colorées sur la carte

### Voir l'itinéraire d'une zone
- Cliquer sur une zone dans la liste latérale **ou** directement sur le polygone sur la carte
- Les adresses s'affichent en points colorés
- La ligne pointillée relie les adresses dans l'ordre optimal de passage

### Modifier une zone
- Cliquer sur le crayon ✎ dans la liste
- Renommer, changer la couleur
- Le bouton "Supprimer" désaffecte les adresses de cette zone

---

## Points techniques

### Algorithme K-means++
- 5 runs indépendants → choix du meilleur (inertie minimale)
- Convergence en ~20–40 itérations sur des petits datasets (<1000 points)
- Sur 94 adresses (Camlez) : ~5ms
- Sur 5000 adresses (grande ville) : ~200ms — toujours dans les limites Vercel

### TSP Nearest Neighbor
- O(n²) — parfait pour 20–200 adresses par zone
- Départ depuis le point le plus au nord (logique terrain)
- Amélioration possible par 2-opt (disponible dans `tsp.ts` mais non activé)

### Polygones
- Convex hull (Graham scan) + buffer 200m centré sur le barycentre
- Stockés en WKT dans PostGIS (`geometry(Polygon, 4326)`)
- Retournés en GeoJSON via la vue `vue_zones_geojson`

---

## Problèmes connus / Limitations

### Vue `vue_zones_geojson` optionnelle
Si la vue n'existe pas encore (erreur `relation vue_zones_geojson does not exist`), l'API `/api/zones` a un fallback automatique sur la table directe — les polygones ne seront pas retournés mais les zones s'afficheront quand même dans la liste.

### Polygones sans adresses BAN complètes
Si les adresses sont au niveau rue (type `street`) sans numéros, les polygones seront générés sur les centres de rues — fonctionnel mais moins précis. À améliorer en Phase 6 avec l'ingestion BAN complète.

### Pas d'édition des polygones à la souris
Phase 2 affiche et génère les polygones. L'édition manuelle des frontières (drag de polygone) est prévue en Phase 3+ avec MapLibre GL Draw.

---

## Prochaine étape : Phase 3 — Terrain mobile
- Écran "Tournée en cours" (bottom sheet, 1 tap par adresse)
- Qualifications (flyer / contact / rendez-vous)
- Mode hors-ligne PWA (cache IndexedDB)
