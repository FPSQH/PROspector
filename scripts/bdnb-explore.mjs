/**
 * Script d'exploration BDNB Open API
 * Lance avec : node scripts/bdnb-explore.mjs
 *
 * Interroge l'API BDNB Open (sans clé) pour une adresse donnée et affiche
 * toutes les données disponibles, formatées pour évaluer l'intégration PROspector.
 */

const BASE_URL = "https://api-open.bdnb.io/v2";

// ─── Configuration : modifier ici l'adresse à tester ──────────────────────────
const ADRESSE_TEST = "20 rue de la Paix, 75002 Paris";
const CODE_INSEE_TEST = "75102"; // arrondissement Paris 2e
// ──────────────────────────────────────────────────────────────────────────────

async function fetchBDNB(endpoint, params = {}) {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} – ${res.statusText} – ${url}`);
  }
  return res.json();
}

function hr(title = "") {
  const line = "─".repeat(70);
  if (title) {
    const pad = Math.max(0, Math.floor((70 - title.length - 2) / 2));
    console.log(`${"─".repeat(pad)} ${title} ${"─".repeat(pad)}`);
  } else {
    console.log(line);
  }
}

function afficherBatiment(b, index = 0) {
  hr(`Bâtiment #${index + 1}`);

  // Identité
  console.log("\n📍 IDENTITÉ");
  console.log(`  ID BDNB            : ${b.batiment_groupe_id ?? "—"}`);
  console.log(`  Adresse principale : ${b.libelle_adr_principale_ban ?? "—"}`);
  console.log(`  Code INSEE commune : ${b.code_commune_insee ?? "—"}`);
  console.log(`  Clé interop BAN    : ${JSON.stringify(b.l_cle_interop_adr ?? [])}`);
  console.log(`  Réf. cadastrale    : ${b.ref_id_bdnb ?? b.code_departement_insee ?? "—"}`);

  // Caractéristiques physiques
  console.log("\n🏗️  CARACTÉRISTIQUES PHYSIQUES");
  console.log(`  Usage principal    : ${b.usage_niveau_1_txt ?? "—"}`);
  console.log(`  Usage secondaire   : ${b.usage_niveau_2_txt ?? "—"}`);
  console.log(`  Type bâtiment      : ${b.type_batiment_txt ?? "—"}`);
  console.log(`  Année construction : ${b.annee_construction ?? "—"}`);
  console.log(`  Nb logements       : ${b.nb_logements ?? "—"}`);
  console.log(`  Surface (SHON)     : ${b.surface_shon_bat ?? "—"} m²`);
  console.log(`  Hauteur bâtiment   : ${b.hauteur_mean ?? "—"} m`);
  console.log(`  Nb étages          : ${b.nb_niveau ?? "—"}`);

  // Énergie / DPE
  console.log("\n⚡ ÉNERGIE & DPE");
  console.log(`  DPE représentatif  : ${b.dpe_mix_arrete_2021_etiquette_dpe ?? "—"}`);
  console.log(`  GES représentatif  : ${b.dpe_mix_arrete_2021_etiquette_ges ?? "—"}`);
  console.log(`  Conso estimée      : ${b.conso_ener_estim_inc ?? "—"} kWh/m²/an`);
  console.log(`  Nb DPE reliés      : ${b.nb_dpe_bati ?? "—"}`);
  console.log(`  Passoire (F/G)     : ${b.dpe_mix_arrete_2021_etiquette_dpe && ["F","G"].includes(b.dpe_mix_arrete_2021_etiquette_dpe) ? "⚠️  OUI" : "Non"}`);

  // Matériaux / équipements
  console.log("\n🔧 MATÉRIAUX & ÉQUIPEMENTS");
  console.log(`  Matériaux murs     : ${b.mat_mur_txt ?? "—"}`);
  console.log(`  Matériaux toiture  : ${b.mat_toit_txt ?? "—"}`);
  console.log(`  Type chauffage     : ${b.type_chauffage_agregat ?? "—"}`);
  console.log(`  Énergie chauffage  : ${b.energie_chauffage_agregat ?? "—"}`);

  // Indicateurs sociaux/fonciers
  console.log("\n🏘️  INDICATEURS SOCIAUX & FONCIER");
  console.log(`  Logement social    : ${b.indicateur_lib_bpi_reglementaire ?? b.lib_type_rapport_bpi ?? "—"}`);
  console.log(`  Parc privé         : ${b.parc_prive ?? "—"}`);
  console.log(`  Ref. BDTopo        : ${b.ref_bdtopo_bat ?? "—"}`);

  // Géométrie
  if (b.geom_groupe) {
    const geom = typeof b.geom_groupe === "string"
      ? JSON.parse(b.geom_groupe)
      : b.geom_groupe;
    console.log("\n🗺️  GÉOMÉTRIE");
    console.log(`  Type géom          : ${geom.type ?? "—"}`);
    if (geom.coordinates) {
      const coords = geom.coordinates[0]?.[0] ?? geom.coordinates[0] ?? [];
      console.log(`  Nb points polygone : ${coords.length}`);
      const lons = coords.map((c) => c[0]);
      const lats = coords.map((c) => c[1]);
      console.log(`  BBox               : [${Math.min(...lons).toFixed(5)}, ${Math.min(...lats).toFixed(5)}, ${Math.max(...lons).toFixed(5)}, ${Math.max(...lats).toFixed(5)}]`);
    }
  }

  // Données brutes complètes
  console.log("\n📋 TOUS LES CHAMPS BRUTS");
  Object.entries(b)
    .filter(([k]) => !["geom_groupe", "geom_point"].includes(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([k, v]) => {
      const val = Array.isArray(v) ? JSON.stringify(v) : v;
      console.log(`  ${k.padEnd(40)} : ${val ?? "null"}`);
    });
}

async function main() {
  console.log("\n");
  hr("EXPLORATION BDNB OPEN API");
  console.log(`\nAdresse de test : ${ADRESSE_TEST}`);
  console.log(`Code INSEE      : ${CODE_INSEE_TEST}\n`);

  // ── 1. Requête par code commune ──────────────────────────────────────────
  hr("1 — Bâtiments de la commune (5 premiers)");
  try {
    const data = await fetchBDNB("batiment_groupe", {
      "code_commune_insee": `eq.${CODE_INSEE_TEST}`,
      "limit": "5",
      "select": "*",
    });
    console.log(`\n→ ${data.length} résultat(s) retourné(s)\n`);
    data.forEach((b, i) => afficherBatiment(b, i));
  } catch (err) {
    console.error("Erreur requête commune :", err.message);
  }

  // ── 2. Requête par adresse (libellé) ────────────────────────────────────
  hr("2 — Recherche par libellé d'adresse (ilike)");
  try {
    const data = await fetchBDNB("batiment_groupe", {
      "libelle_adr_principale_ban": `ilike.*Paix*`,
      "code_commune_insee": `eq.${CODE_INSEE_TEST}`,
      "limit": "3",
      "select": "*",
    });
    console.log(`\n→ ${data.length} résultat(s) retourné(s)\n`);
    data.forEach((b, i) => afficherBatiment(b, i));
  } catch (err) {
    console.error("Erreur requête adresse :", err.message);
  }

  // ── 3. Champs disponibles (introspection schema) ─────────────────────────
  hr("3 — Liste des endpoints disponibles");
  try {
    const res = await fetch(BASE_URL, { headers: { Accept: "application/openapi+json" } });
    if (res.ok) {
      const schema = await res.json();
      const tables = Object.keys(schema?.paths ?? {}).filter(p => !p.includes("{"));
      console.log("\nEndpoints disponibles :");
      tables.forEach(t => console.log(`  ${t}`));
    }
  } catch (err) {
    console.error("Erreur schema :", err.message);
  }

  hr("FIN");
  console.log("\n✅ Script terminé. Les données ci-dessus représentent ce que BDNB");
  console.log("   apporterait pour chaque adresse dans PROspector.\n");
}

main().catch(console.error);
