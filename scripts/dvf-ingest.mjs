#!/usr/bin/env node
// ============================================================
// DVF Ingestion Script
//
// Télécharge les fichiers annuels DVF géolocalisés (Etalab),
// filtre par département(s) et upsert dans Supabase.
//
// Variables d'environnement :
//   SUPABASE_URL              URL du projet Supabase
//   SUPABASE_SERVICE_ROLE_KEY Clé service role
//   DEPARTEMENTS              Codes dept séparés par virgule, ou "all"
//   ANNEES                    Années séparées par virgule, ou "all"
//
// Usage :
//   node scripts/dvf-ingest.mjs
//   DEPARTEMENTS=22,56 ANNEES=2023,2024 node scripts/dvf-ingest.mjs
// ============================================================

import { createGunzip } from 'node:zlib'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis')
  process.exit(1)
}

const CURRENT_YEAR = new Date().getFullYear()
const DEFAULT_YEARS = ['2019','2020','2021','2022','2023','2024', String(CURRENT_YEAR)]
  .filter((y, i, arr) => arr.indexOf(y) === i)

const envAnnees = process.env.ANNEES
const envDepts  = process.env.DEPARTEMENTS

const ANNEES       = (envAnnees && envAnnees !== 'all') ? envAnnees.split(',').map(s => s.trim()) : DEFAULT_YEARS
const FILTER_DEPTS = (envDepts  && envDepts  !== 'all') ? new Set(envDepts.split(',').map(s => s.trim())) : null

// ── Helpers ───────────────────────────────────────────────────

function getDept(codeCommune) {
  return codeCommune.startsWith('97') ? codeCommune.slice(0, 3) : codeCommune.slice(0, 2)
}

function parseLine(headers, line) {
  const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, '') || null)
  const obj = {}
  headers.forEach((h, i) => { obj[h] = values[i] ?? null })
  return obj
}

function normalizeRow(obj) {
  const num  = v => (v !== null && v !== '') ? parseFloat(v)   : null
  const int  = v => (v !== null && v !== '') ? parseInt(v, 10) : null
  return {
    id_mutation:               obj.id_mutation?.trim()               || null,
    date_mutation:             obj.date_mutation?.trim()             || null,
    nature_mutation:           obj.nature_mutation?.trim()           || null,
    valeur_fonciere:           num(obj.valeur_fonciere),
    adresse_numero:            obj.adresse_numero?.trim()            || null,
    adresse_suffixe:           obj.adresse_suffixe?.trim()           || null,
    adresse_nom_voie:          obj.adresse_nom_voie?.trim()          || null,
    code_postal:               obj.code_postal?.trim()               || null,
    code_commune:              obj.code_commune?.trim()              || '',
    nom_commune:               obj.nom_commune?.trim()               || null,
    code_departement:          obj.code_departement?.trim()          || null,
    id_parcelle:               obj.id_parcelle?.trim()               || null,
    type_local:                obj.type_local?.trim()                || null,
    surface_reelle_bati:       num(obj.surface_reelle_bati),
    nombre_pieces_principales: int(obj.nombre_pieces_principales),
    surface_terrain:           num(obj.surface_terrain),
    longitude:                 num(obj.longitude),
    latitude:                  num(obj.latitude),
  }
}

// ── Supabase helpers ──────────────────────────────────────────

const HEADERS_BASE = {
  apikey:        SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
}

async function sbFetch(path, opts = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: { ...HEADERS_BASE, ...opts.headers },
  })
}

async function getRequiredDepts() {
  if (FILTER_DEPTS) return FILTER_DEPTS

  console.log('Récupération des départements depuis Supabase...')
  const resp = await sbFetch('/communes?select=code_insee')
  if (!resp.ok) throw new Error(`Supabase communes: HTTP ${resp.status}`)

  const communes = await resp.json()
  const depts = new Set(communes.map(c => getDept(c.code_insee)))
  console.log(`Départements détectés : ${[...depts].sort().join(', ')}`)
  return depts
}

async function upsertBatch(rows) {
  // Dédupliquer par clé composite — le CSV DVF peut avoir des doublons
  // dans un même batch, ce que PostgreSQL ON CONFLICT DO UPDATE rejette
  const seen = new Set()
  const deduped = rows.filter(r => {
    const key = `${r.id_mutation}|${r.type_local ?? ''}|${r.id_parcelle ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const resp = await sbFetch(
    '/dvf_mutations?on_conflict=id_mutation,type_local,id_parcelle',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(deduped),
    }
  )
  if (!resp.ok) {
    const text = await resp.text()
    console.error(`  Upsert error ${resp.status}: ${text.slice(0, 300)}`)
  }
}

async function updateCommuneStats(depts) {
  console.log('\nMise à jour des stats communes...')

  const deptFilter = [...depts].map(d => `code_insee.like.${d}%`).join(',')
  const resp = await sbFetch(`/communes?or=(${deptFilter})&select=code_insee`)
  if (!resp.ok) return

  const communes = await resp.json()
  let updated = 0

  for (const { code_insee } of communes) {
    const countResp = await sbFetch(
      `/dvf_mutations?code_commune=eq.${code_insee}&select=id`,
      { headers: { Prefer: 'count=exact', Range: '0-0' } }
    )
    const contentRange = countResp.headers.get('content-range') ?? '0-0/0'
    const total = parseInt(contentRange.split('/')[1] ?? '0', 10)

    await sbFetch(`/communes?code_insee=eq.${code_insee}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ derniere_verif_dvf: new Date().toISOString(), nb_dvf: total }),
    })
    updated++
  }

  console.log(`${updated} communes mises à jour`)
}

// ── Ingestion par année ───────────────────────────────────────

async function ingestYear(year, depts) {
  const url = `https://files.data.gouv.fr/geo-dvf/latest/csv/${year}/full.csv.gz`
  console.log(`\n[${year}] Téléchargement : ${url}`)

  let resp
  try {
    resp = await fetch(url, {
      headers: { Accept: 'application/gzip,*/*' },
      signal: AbortSignal.timeout(600_000), // 10 min
    })
  } catch (err) {
    console.error(`[${year}] Erreur réseau : ${err.message}`)
    return { processed: 0, upserted: 0 }
  }

  if (resp.status === 404) {
    console.log(`[${year}] Fichier non disponible (404) — ignoré`)
    return { processed: 0, upserted: 0 }
  }

  if (!resp.ok) {
    console.error(`[${year}] HTTP ${resp.status} — ignoré`)
    return { processed: 0, upserted: 0 }
  }

  const source     = Readable.fromWeb(resp.body)
  const gunzip     = createGunzip()
  source.pipe(gunzip)
  const rl         = createInterface({ input: gunzip, crlfDelay: Infinity })

  // .pipe() ne propage pas les erreurs. On capture l'erreur dans une variable,
  // on ferme rl proprement (rl.close() termine le for-await sans throw),
  // puis on throw après la boucle pour activer le retry.
  let streamError = null
  source.on('error', err => { streamError = err; rl.close() })
  gunzip.on('error', err => { streamError = err; rl.close() })
  rl.on('error', () => {}) // éviter "Unhandled 'error' event" si rl.destroy est appelé ailleurs

  let headers   = null
  let batch     = []
  let processed = 0
  let upserted  = 0
  let lineNum   = 0

  for await (const line of rl) {
    lineNum++

    if (lineNum === 1) {
      headers = line.split(',').map(h => h.trim().replace(/^"|"$/g, ''))
      continue
    }

    if (!line.trim()) continue

    const obj = parseLine(headers, line)
    if (!obj.id_mutation || !obj.date_mutation || !obj.code_commune) continue

    if (depts && !depts.has(getDept(obj.code_commune))) continue

    const row = normalizeRow(obj)
    if (!row.id_mutation || !row.code_commune || !row.date_mutation) continue

    batch.push(row)
    processed++

    if (batch.length >= 500) {
      await upsertBatch(batch)
      upserted += batch.length
      batch = []
      if (upserted % 10_000 === 0) {
        console.log(`[${year}] ${upserted.toLocaleString()} lignes upsertées...`)
      }
    }
  }

  if (streamError) throw streamError  // active le retry dans la boucle principale

  if (batch.length > 0) {
    await upsertBatch(batch)
    upserted += batch.length
  }

  console.log(`[${year}] ✓ ${processed.toLocaleString()} filtrées, ${upserted.toLocaleString()} upsertées`)
  return { processed, upserted }
}

// ── Qualification type_bien ───────────────────────────────────

async function enrichTypesBiens(depts) {
  console.log('\nQualification type_bien des adresses...')

  const deptFilter = [...depts].map(d => `code_insee.like.${d}%`).join(',')
  const resp = await sbFetch(`/communes?or=(${deptFilter})&select=code_insee`)
  if (!resp.ok) {
    console.error('Impossible de récupérer les communes pour enrichissement')
    return
  }

  const communes = await resp.json()
  const codes = communes.map(c => c.code_insee)

  const rpcResp = await sbFetch('/rpc/enrich_adresses_type_bien', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_codes_insee: codes }),
  })

  if (rpcResp.ok) {
    const updated = await rpcResp.json()
    console.log(`${updated} adresses qualifiées`)
  } else {
    const text = await rpcResp.text()
    console.error(`Erreur enrichissement type_bien: ${rpcResp.status} ${text.slice(0, 200)}`)
  }
}

// ── Main ──────────────────────────────────────────────────────

const depts = await getRequiredDepts()
console.log(`\nAnnées : ${ANNEES.join(', ')}`)
console.log(`Départements : ${[...depts].sort().join(', ')}`)
console.log('─'.repeat(60))

let totalProcessed = 0
let totalUpserted  = 0

for (const year of ANNEES) {
  let processed = 0
  let upserted  = 0
  let attempt   = 0
  const maxAttempts = 4
  while (attempt < maxAttempts) {
    attempt++
    try {
      ;({ processed, upserted } = await ingestYear(year, depts))
      break
    } catch (err) {
      // Retenter toutes les erreurs réseau (terminated, socket closed, etc.)
      // Les erreurs 404/HTTP sont gérées dans ingestYear et ne throw pas
      if (attempt < maxAttempts) {
        const delay = 2 ** attempt * 1000
        console.warn(`[${year}] Erreur réseau (tentative ${attempt}/${maxAttempts}) : ${err.message} — retry dans ${delay / 1000}s`)
        await new Promise(r => setTimeout(r, delay))
      } else {
        console.error(`[${year}] Échec définitif après ${attempt} tentative(s) : ${err.message}`)
        break
      }
    }
  }
  totalProcessed += processed
  totalUpserted  += upserted
}

await updateCommuneStats(depts)
await enrichTypesBiens(depts)

console.log('\n' + '─'.repeat(60))
console.log(`✓ Import terminé`)
console.log(`  Lignes filtrées : ${totalProcessed.toLocaleString()}`)
console.log(`  Lignes upsertées : ${totalUpserted.toLocaleString()}`)
