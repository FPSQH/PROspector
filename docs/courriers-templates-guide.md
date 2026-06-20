# Guide de génération de templates — Courriers DPE (PROspector)

> **Objectif de ce document** : permettre à une IA de générer des templates de courriers DPE prêts à l'emploi, que ce soit en mode **Sections** ou en mode **Texte unique**, avec une compréhension complète du système de variables, de conditions et de la structure attendue.

---

## 1. Vue d'ensemble du système

PROspector génère des courriers personnalisés destinés aux propriétaires d'un bien ayant fait l'objet d'un DPE (Diagnostic de Performance Énergétique). Ces courriers sont envoyés par un agent immobilier.

Il existe deux modes de template, exclusifs l'un de l'autre :

| Mode | Quand l'utiliser |
|------|-----------------|
| **Sections** | Courrier structuré en blocs thématiques, avec du contenu adapté automatiquement selon le DPE et le type de bien. Recommandé pour des courriers riches et différenciés. |
| **Texte unique** | Un seul corps de lettre pour tous les biens, avec des variables dynamiques. Recommandé pour un style personnel et homogène. |

---

## 2. Les variables disponibles

Les variables s'écrivent toujours avec des accolades : `{nomVariable}`.

Elles sont disponibles dans les deux modes (Sections et Texte unique), ainsi que dans l'en-tête et le pied de page.

### 2.1 Variables liées au bien

| Variable | Description | Exemple de rendu |
|----------|-------------|-----------------|
| `{typeBien}` | Type de bien, formulé de façon naturelle | `votre appartement` / `votre maison` / `votre local commercial` |
| `{adresse}` | Adresse complète du bien (rue uniquement, sans CP ni ville) | `12 Rue de la Paix` |
| `{ville}` | Commune du bien | `Bordeaux` |
| `{ctx}` | Formulation géographique contextuelle | `sur le secteur de Bordeaux` |
| `{dpe}` | Étiquette DPE (lettre seule) | `F` |
| `{conso}` | Consommation énergétique primaire | `320 kWhep/m²/an` |
| `{cout}` | Coût annuel d'énergie estimé | `2 800 €` |
| `{ges}` | Émissions de gaz à effet de serre | `62 kgeqCO₂/m²/an` |
| `{energie}` | Énergie principale du logement | `Électricité` / `Gaz naturel` |

### 2.2 Variables liées à l'agent immobilier

| Variable | Description | Exemple de rendu |
|----------|-------------|-----------------|
| `{agentNom}` | Prénom et nom du conseiller | `Jean Dupont` |
| `{agentTitre}` | Titre / fonction du conseiller | `Conseillère Immobilier` |
| `{agenceNom}` | Nom de l'agence | `Square Habitat Bordeaux` |
| `{agenceAdresse}` | Adresse complète de l'agence | `12 Rue du Commerce, 33000 Bordeaux` |
| `{agenceTel}` | Téléphone de l'agence | `05 56 00 00 00` |
| `{agenceEmail}` | Email de l'agence | `contact@squarehabitat.fr` |

### 2.3 Variable spéciale (en-tête / pied de page uniquement)

| Variable | Description |
|----------|-------------|
| `{logo}` | Insère le logo de l'agence à cet endroit (uniquement dans l'en-tête ou le pied de page) |

### 2.4 Règles d'utilisation des variables

- Les variables **non renseignées** dans le profil de l'agent restent affichées telles quelles (ex : `{agenceEmail}` si l'email n'est pas configuré).
- `{typeBien}` commence toujours par `votre` (ex : `votre appartement`). Ne pas réécrire `votre {typeBien}`.
- `{ctx}` commence toujours par `sur le secteur de` ou `à` selon la commune. L'utiliser directement dans une phrase (ex : `les propriétaires {ctx}`).
- `{adresse}` ne contient **pas** le code postal ni la ville. Pour une adresse complète, écrire `{adresse}, {ville}`.

---

## 3. Mode Texte unique

### 3.1 Principe

Un seul texte HTML est rédigé. Il sera utilisé pour **tous** les biens, quelle que soit leur note DPE ou leur type. La personnalisation se fait uniquement via les variables.

### 3.2 Structure du champ

Le texte est stocké dans le champ `unique_text` du template. C'est du **HTML simplifié** (balises `<strong>`, `<em>`, `<u>`, `<br>`, `<p>`, styles inline). Les retours à la ligne simples sont des `<br>`.

### 3.3 Exemple complet — Template Nadège

```html
Madame, Monsieur,

Je me permets de vous adresser ce courrier après avoir consulté les données récentes publiées par l'ADEME, indiquant la réalisation d'un Diagnostic de Performance Énergétique (DPE {dpe}) concernant {typeBien} situé {adresse}.

Cette démarche est souvent liée à une réflexion ou à un projet de mise en vente. Dans ce contexte, je serais ravi(e) de pouvoir échanger avec vous et de vous proposer mon accompagnement dans les différentes étapes de votre projet immobilier.

En tant que {agentTitre} au sein de {agenceNom}, je mets à votre disposition mon expertise du marché local {ctx}, ainsi que les atouts d'un réseau reconnu pour la qualité de son accompagnement et la confiance de ses clients.

Qu'il s'agisse d'une simple estimation ou d'un accompagnement complet jusqu'à la vente, je reste à votre écoute pour vous conseiller au mieux.

N'hésitez pas à me contacter pour toute question ou pour convenir d'un rendez-vous. Ce serait un plaisir d'échanger avec vous.

Dans cette attente, je vous adresse mes salutations les plus sincères.

{agentNom}
{agentTitre} – Transaction Vente
{agenceNom}
📞 {agenceTel}
✉ {agenceEmail}
```

### 3.4 Conseils pour ce mode

- Garder un ton neutre qui fonctionne pour DPE A comme DPE G, puisque la lettre ne s'adapte pas.
- Utiliser `{dpe}` pour mentionner la note, mais sans faire de jugement de valeur (car le même texte sera utilisé pour un DPE A et un DPE G).
- Placer la signature à la fin avec `{agentNom}`, `{agentTitre}`, `{agenceNom}`, `{agenceTel}`, `{agenceEmail}`.

---

## 4. Mode Sections

### 4.1 Principe

Le courrier est composé d'une **liste ordonnée de sections** (blocs). Chaque section peut être :
- **active ou inactive** (`enabled: true/false`)
- **conditionnelle** (s'affiche seulement si la note DPE, le type de bien, ou la présence d'un audit correspond)
- **avec un contenu personnalisé** (HTML rédigé) ou **automatique** (généré par le moteur selon le DPE)

Les sections sont traitées dans l'ordre de la liste. L'ordre est important : il détermine l'ordre d'apparition dans la lettre.

### 4.2 Sections fixes disponibles

Il existe 8 sections fixes (`type: 'fixed'`), identifiées par leur `id` :

| id | Titre par défaut | Condition par défaut | Contenu par défaut |
|----|-----------------|---------------------|--------------------|
| `intro` | Introduction | aucune (toujours affichée) | Paragraphe d'accroche adapté au DPE et au contexte géographique |
| `dpe` | Situation énergétique de votre bien | aucune (toujours affichée) | Description de la note DPE, consommation, réglementation en vigueur |
| `audit` | Audit énergétique & rénovation | DPE E, F ou G **ET** audit disponible | Présentation des scénarios de rénovation de l'audit |
| `estimation` | Estimation gratuite de votre bien | aucune (toujours affichée) | Proposition d'estimation gratuite et sans engagement |
| `vente` | Vous envisagez de vendre ? | aucune (toujours affichée) | Accompagnement à la vente, adapté selon l'urgence DPE |
| `gestion_locative` | Notre service de gestion locative | DPE A, B, C ou D | Présentation du service de gestion locative |
| `renovation` | Bloc rénovation | DPE E, F ou G | Présentation du financement des travaux de rénovation |
| `politesse` | Formules de politesse | aucune (toujours affichée) | Formule de clôture et signature |

> **Note importante** : `gestion_locative` et `renovation` sont mutuellement exclusives par leurs conditions : l'une s'affiche pour les bons DPE (A/B/C/D), l'autre pour les mauvais (E/F/G). Il ne faut jamais les avoir toutes les deux sans condition différenciatrice.

### 4.3 Contenu automatique vs personnalisé

Pour chaque section fixe, le champ `bodyHtml` peut être :

- **`null`** → le moteur génère automatiquement le contenu selon le DPE, le type de bien, et les données disponibles. C'est le comportement par défaut et recommandé pour `dpe`, `audit`, `renovation`.
- **Une chaîne HTML** → le contenu personnalisé est utilisé à la place du contenu automatique. Les variables `{xxx}` sont remplacées dynamiquement.

Pour les sections `custom` (`type: 'custom'`), `bodyHtml` est toujours une chaîne HTML (jamais `null`).

### 4.4 Structure d'une section

```json
{
  "id": "intro",
  "type": "fixed",
  "enabled": true,
  "title": "Introduction",
  "showTitle": false,
  "titleColor": "#009597",
  "titleSize": 14,
  "titleBold": true,
  "titleUnderline": false,
  "bodyHtml": null,
  "condition": null
}
```

**Champs obligatoires :**

| Champ | Type | Description |
|-------|------|-------------|
| `id` | string | `FixedSectionId` pour les sections fixes, UUID pour les sections custom ou dupliquées |
| `type` | `'fixed'` \| `'custom'` | Type de section |
| `enabled` | boolean | `true` = la section est incluse dans la lettre |
| `title` | string | Titre affiché si `showTitle: true` |
| `showTitle` | boolean | Afficher l'en-tête de section ? |
| `titleColor` | string | Couleur hex du titre (ex: `#009597`) |
| `titleSize` | number | Taille du titre en points (10–24, recommandé : 14) |
| `titleBold` | boolean | Titre en gras |
| `titleUnderline` | boolean | Titre souligné |
| `bodyHtml` | string \| null | Contenu HTML de la section. `null` = auto-généré (sections fixes uniquement) |

**Champ optionnel `condition` :**

```json
{
  "condition": {
    "dpe": ["E", "F", "G"],
    "types": ["appartement", "maison"],
    "requireAudit": true
  }
}
```

| Sous-champ | Type | Description |
|-----------|------|-------------|
| `dpe` | `string[]` | Lettres DPE pour lesquelles la section s'affiche. Absent ou `[]` = toutes les notes. |
| `types` | `string[]` | Types de bien : `"appartement"`, `"maison"`, `"local commercial"`. Absent ou `[]` = tous. |
| `requireAudit` | boolean | `true` = la section ne s'affiche que si un audit énergétique est disponible pour le bien. |

> **Logique** : tous les critères présents dans `condition` doivent être satisfaits simultanément (logique ET). Une section sans `condition` (ou `condition: undefined`) s'affiche toujours.

### 4.5 Variables disponibles dans les sections

Toutes les variables listées en section 2 sont disponibles dans le `bodyHtml` de n'importe quelle section. Les plus utiles par section :

| Section | Variables recommandées |
|---------|----------------------|
| `intro` | `{typeBien}`, `{ctx}`, `{dpe}`, `{ville}`, `{adresse}`, `{agentNom}` |
| `dpe` | `{typeBien}`, `{dpe}`, `{conso}`, `{cout}`, `{ges}`, `{energie}` |
| `audit` | `{typeBien}`, `{dpe}` |
| `estimation` | `{typeBien}`, `{ctx}`, `{agentNom}` |
| `vente` | `{typeBien}`, `{dpe}`, `{agentNom}` |
| `gestion_locative` | `{typeBien}` |
| `renovation` | aucune (texte institutionnel fixe) |
| `politesse` | `{agentNom}`, `{agenceNom}` |
| sections custom | toutes |

### 4.6 Sections dupliquées

Une section fixe peut être **dupliquée** pour créer des variantes avec des conditions différentes. Dans ce cas :
- L'`id` du duplicata est un UUID généré.
- Le champ `fixedId` conserve l'`id` de la section d'origine (ex : `"fixedId": "dpe"`).
- Cela permet d'avoir, par exemple, deux blocs `dpe` : un pour DPE A/B avec un texte valorisant, un autre pour DPE E/F/G avec un texte plus urgent.

**Règle anti-conflit** : deux sections du même type (même `id` ou même `fixedId`) avec des conditions identiques sont en conflit et exclues du document généré. Les conditions doivent être différenciatrices.

### 4.7 Sections personnalisées (custom)

On peut ajouter des sections entièrement libres :

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "custom",
  "enabled": true,
  "title": "Notre engagement qualité",
  "showTitle": true,
  "titleColor": "#2563EB",
  "titleSize": 13,
  "titleBold": true,
  "titleUnderline": false,
  "bodyHtml": "<p>Chez {agenceNom}, nous nous engageons à vous accompagner avec transparence et professionnalisme. {agentNom} est à votre disposition pour répondre à toutes vos questions.</p>"
}
```

---

## 5. En-tête et pied de page

L'en-tête et le pied de page sont **communs aux deux modes** (Sections et Texte unique). Ils apparaissent sur chaque page du document.

### 5.1 En-tête (`header_html`)

- `header_html: null` → en-tête automatique : tableau 3 colonnes (logo · agence · conseiller)
- `header_html: "<html string>"` → HTML personnalisé

Variables disponibles : `{logo}`, `{agentNom}`, `{agentTitre}`, `{agenceNom}`, `{agenceAdresse}`, `{agenceTel}`, `{agenceEmail}`

Exemple :
```html
{logo}<br><strong style="color:#009597;">{agenceNom}</strong><br>
<span style="color:#5F5E5A;">📞 {agenceTel}</span><br>
<strong>{agentNom}</strong> — <span style="color:#5F5E5A;">{agentTitre}</span><br>
<span style="color:#5F5E5A;">✉ {agenceEmail}</span>
```

### 5.2 Pied de page / signature (`footer_html`)

- `footer_html: null` → signature automatique : nom, titre, agence, téléphone, email
- `footer_html: "<html string>"` → HTML personnalisé

Variables disponibles : mêmes que l'en-tête.

Exemple :
```html
<strong>{agentNom}</strong><br>
<span style="color:#5F5E5A;">{agentTitre} — {agenceNom}</span><br>
<span style="color:#5F5E5A;">📞 {agenceTel}</span><br>
<span style="color:#5F5E5A;">✉ {agenceEmail}</span>
```

---

## 6. Structure complète d'un template (TemplateV2)

```typescript
{
  // ── Identité ──────────────────────────────────────────────────────────
  id:               string          // UUID généré par Supabase
  commercial_id:    string          // UUID de l'agent (géré automatiquement)
  name:             string          // Nom affiché dans la liste
  is_default:       boolean         // true = template sélectionné par défaut dans /courriers
  is_locked:        boolean         // true = template système, non supprimable

  // ── Mode ──────────────────────────────────────────────────────────────
  mode:             'sections' | 'unique'

  // ── Mode Texte unique ─────────────────────────────────────────────────
  unique_text:      string | null   // HTML du corps de lettre (mode 'unique')

  // ── Mode Sections ─────────────────────────────────────────────────────
  sections_config:  TemplateSection[] | null  // null = sections par défaut

  // ── Logo ──────────────────────────────────────────────────────────────
  logo_data:        string | null   // base64 de l'image (géré via UI)
  logo_mime:        string | null   // 'image/png' | 'image/jpeg'
  logo_scale_pct:   number          // échelle % (10–200, défaut 100)
  logo_position:    'header' | 'footer'  // emplacement du logo dans le document

  // ── Enveloppe ─────────────────────────────────────────────────────────
  envelope_enabled: boolean         // true = insérer un pavé adresse destinataire
  envelope_line1:   string          // ex: "Monsieur Madame le Propriétaire"
  envelope_line2:   string          // complément optionnel (ex: "Apt 3B")

  // ── En-tête ───────────────────────────────────────────────────────────
  header_enabled:   boolean         // true par défaut
  header_html:      string | null   // null = auto-généré
  header_height_mm: number          // hauteur minimale en mm (10–80, défaut 30)

  // ── Pied de page ──────────────────────────────────────────────────────
  footer_enabled:   boolean         // true par défaut
  footer_html:      string | null   // null = auto-généré
  footer_height_mm: number          // hauteur minimale en mm (10–80, défaut 20)
}
```

---

## 7. Exemples de templates à générer

### 7.1 Template Sections — Approche urgente pour DPE F/G

**Concept** : courrier percutant pour les biens énergivores, avec une intro alarmiste sur les contraintes légales, un focus fort sur la vente, et aucun bloc gestion locative.

```json
{
  "name": "Urgence DPE F/G",
  "mode": "sections",
  "sections_config": [
    {
      "id": "intro",
      "type": "fixed",
      "enabled": true,
      "title": "Introduction",
      "showTitle": false,
      "titleColor": "#CC1016",
      "titleSize": 14,
      "titleBold": true,
      "titleUnderline": false,
      "bodyHtml": "<p>Madame, Monsieur,</p><p>Votre bien, classé DPE <strong>{dpe}</strong>, est concerné par des réglementations qui renforcent chaque année les contraintes pour les propriétaires. En tant que conseiller immobilier {ctx}, je me permets de vous contacter afin d'évoquer les options qui s'offrent à vous.</p>"
    },
    {
      "id": "dpe",
      "type": "fixed",
      "enabled": true,
      "title": "Situation énergétique de votre bien",
      "showTitle": true,
      "titleColor": "#CC1016",
      "titleSize": 14,
      "titleBold": true,
      "titleUnderline": false,
      "bodyHtml": null
    },
    {
      "id": "audit",
      "type": "fixed",
      "enabled": true,
      "title": "Audit énergétique & rénovation",
      "showTitle": true,
      "titleColor": "#CC1016",
      "titleSize": 14,
      "titleBold": true,
      "titleUnderline": false,
      "bodyHtml": null,
      "condition": { "dpe": ["E", "F", "G"], "requireAudit": true }
    },
    {
      "id": "vente",
      "type": "fixed",
      "enabled": true,
      "title": "Vous envisagez de vendre ?",
      "showTitle": true,
      "titleColor": "#CC1016",
      "titleSize": 14,
      "titleBold": true,
      "titleUnderline": false,
      "bodyHtml": null
    },
    {
      "id": "renovation",
      "type": "fixed",
      "enabled": true,
      "title": "Financement de vos travaux",
      "showTitle": true,
      "titleColor": "#CC1016",
      "titleSize": 14,
      "titleBold": true,
      "titleUnderline": false,
      "bodyHtml": null,
      "condition": { "dpe": ["E", "F", "G"] }
    },
    {
      "id": "estimation",
      "type": "fixed",
      "enabled": true,
      "title": "Estimation gratuite de votre bien",
      "showTitle": true,
      "titleColor": "#CC1016",
      "titleSize": 14,
      "titleBold": true,
      "titleUnderline": false,
      "bodyHtml": null
    },
    {
      "id": "politesse",
      "type": "fixed",
      "enabled": true,
      "title": "Formules de politesse",
      "showTitle": false,
      "titleColor": "#CC1016",
      "titleSize": 14,
      "titleBold": true,
      "titleUnderline": false,
      "bodyHtml": null
    }
  ]
}
```

### 7.2 Template Sections — Approche valorisante pour DPE A/B/C

**Concept** : ton positif, mise en valeur de la performance énergétique comme atout de vente ou de location.

```json
{
  "name": "Atout énergétique A/B/C",
  "mode": "sections",
  "sections_config": [
    {
      "id": "intro",
      "type": "fixed",
      "enabled": true,
      "title": "Introduction",
      "showTitle": false,
      "titleColor": "#319834",
      "titleSize": 14,
      "titleBold": true,
      "titleUnderline": false,
      "bodyHtml": "<p>Madame, Monsieur,</p><p>C'est avec plaisir que je vous contacte au sujet de {typeBien} situé {adresse}, à {ville}. Votre bien bénéficie d'une excellente performance énergétique (DPE <strong>{dpe}</strong>), ce qui représente un atout considérable sur le marché immobilier actuel.</p>"
    },
    {
      "id": "dpe",
      "type": "fixed",
      "enabled": true,
      "title": "Un bien performant sur le marché",
      "showTitle": true,
      "titleColor": "#319834",
      "titleSize": 14,
      "titleBold": true,
      "titleUnderline": false,
      "bodyHtml": null
    },
    {
      "id": "gestion_locative",
      "type": "fixed",
      "enabled": true,
      "title": "Une opportunité locative à saisir",
      "showTitle": true,
      "titleColor": "#319834",
      "titleSize": 14,
      "titleBold": true,
      "titleUnderline": false,
      "bodyHtml": null,
      "condition": { "dpe": ["A", "B", "C", "D"] }
    },
    {
      "id": "vente",
      "type": "fixed",
      "enabled": true,
      "title": "Valoriser votre bien à la vente",
      "showTitle": true,
      "titleColor": "#319834",
      "titleSize": 14,
      "titleBold": true,
      "titleUnderline": false,
      "bodyHtml": null
    },
    {
      "id": "estimation",
      "type": "fixed",
      "enabled": true,
      "title": "Estimation gratuite de votre bien",
      "showTitle": true,
      "titleColor": "#319834",
      "titleSize": 14,
      "titleBold": true,
      "titleUnderline": false,
      "bodyHtml": null
    },
    {
      "id": "politesse",
      "type": "fixed",
      "enabled": true,
      "title": "Formules de politesse",
      "showTitle": false,
      "titleColor": "#319834",
      "titleSize": 14,
      "titleBold": true,
      "titleUnderline": false,
      "bodyHtml": null
    }
  ]
}
```

### 7.3 Template Texte unique — Style professionnel sobre

```html
Madame, Monsieur,

À la suite de la publication du Diagnostic de Performance Énergétique (DPE <strong>{dpe}</strong>) de {typeBien} situé {adresse}, à {ville}, je me permets de vous adresser ce courrier.

En qualité de {agentTitre} au sein de {agenceNom}, je suis régulièrement attentif aux opportunités du marché immobilier {ctx}. Ce DPE constitue souvent le signe d'un projet en cours de réflexion — qu'il s'agisse d'une mise en vente, d'une mise en location ou d'un projet de rénovation.

Je serais heureux(se) de vous rencontrer afin d'échanger sur votre situation et de vous présenter les services que nous pouvons vous proposer : estimation de votre bien, accompagnement à la vente, ou encore gestion locative.

Je reste à votre entière disposition pour tout renseignement complémentaire.

Dans l'attente de vous lire ou de vous rencontrer, veuillez agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

<strong>{agentNom}</strong>
{agentTitre}
{agenceNom}
📞 {agenceTel} — ✉ {agenceEmail}
```

---

## 8. Règles et bonnes pratiques

### 8.1 Règles absolues

- **Ne jamais mettre `gestion_locative` et `renovation` sans conditions** : elles seraient affichées ensemble pour tous les biens, ce qui est contradictoire (la gestion locative est réservée aux biens loués légalement, la rénovation aux passoires thermiques).
- **Ne jamais dupliquer deux sections identiques sans conditions différenciatrices** : le moteur détecte les conflits et exclut les deux sections du document.
- **Ne pas réécrire `votre` devant `{typeBien}`** : la variable inclut déjà `votre` (ex : `votre appartement`).
- **Ne pas écrire `de {ville}`** : écrire directement `{ctx}` qui formule la localisation de façon naturelle.

### 8.2 Logique DPE et affichage

| Groupe DPE | Gestion locative | Rénovation | Commentaire |
|-----------|-----------------|-----------|-------------|
| A, B | ✅ Oui | ❌ Non | Biens performants, location sans contrainte |
| C, D (appartement) | ✅ Oui | ❌ Non | Encore loués légalement |
| C, D (maison) | ❌ Non | ❌ Non | Pas de GL par défaut, pas encore de contrainte rénovation |
| E | ❌ Non | ✅ Oui | Gel des loyers, interdiction de location en approche |
| F, G | ❌ Non | ✅ Oui | Passoires thermiques, location interdite depuis 2025 (G) |

### 8.3 Format du bodyHtml

- HTML simplifié : `<p>`, `<strong>`, `<em>`, `<u>`, `<br>`, styles inline (`color`, `font-size`).
- Pas de balises de structure (`<div>`, `<table>`, etc.) dans les sections.
- Les paragraphes sont recommandés (`<p>`) plutôt que les sauts de ligne simples.
- Les variables `{xxx}` sont remplacées **après** le rendu HTML : elles peuvent être placées n'importe où dans le texte, y compris à l'intérieur de balises.

### 8.4 Couleurs de titre recommandées

| Couleur | Hex | Usage suggéré |
|---------|-----|--------------|
| Vert agence (défaut) | `#009597` | Ton neutre et professionnel |
| Vert foncé | `#1D9E75` | Biens performants (DPE A/B/C) |
| Bleu | `#2563EB` | Ton informatif et institutionnel |
| Orange | `#EA580C` | Ton d'alerte modérée (DPE D/E) |
| Rouge | `#CC1016` | Ton d'urgence (DPE F/G) |
| Violet | `#7C3AED` | Ton haut de gamme / prestige |

---

## 9. Champs non nécessaires pour la génération IA

Les champs suivants sont gérés par l'interface utilisateur et **ne doivent pas être générés par l'IA** :

- `id`, `commercial_id`, `created_at`, `updated_at` — générés par Supabase
- `logo_data`, `logo_mime`, `logo_scale_pct`, `logo_position` — uploadés via UI
- `envelope_enabled`, `envelope_line1`, `envelope_line2` — configurés via UI
- `image_data`, `image_mime` (dans les sections) — uploadées via UI
- `is_default`, `is_locked` — gérés par l'application

**Pour générer un template, l'IA doit produire uniquement :**

```json
{
  "name": "Nom du template",
  "mode": "sections" | "unique",
  "unique_text": "...",              // si mode 'unique', sinon null
  "sections_config": [ ... ],        // si mode 'sections', sinon null
  "header_html": "..." | null,       // null = auto-généré
  "footer_html": "..." | null        // null = auto-généré
}
```
