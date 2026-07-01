'use client'

import { useState } from 'react'

interface DvfAdresse {
  numero: string; nom_voie: string
}

interface ParcelData {
  id_parcelle:  string
  dvf_adresse:  DvfAdresse | null
  mutations:    Mutation[]
  adresses:     AdresseInfo[]
  dpe:          DpeInfo[]
  bdnb:         BdnbInfo[]
}

interface Mutation {
  id_mutation:     string
  date_mutation:   string
  valeur_fonciere: number
  parcelles:       string[]
  locaux:          Local[]
}

interface Local {
  type_local:                string
  surface_reelle_bati:       number | null
  surface_terrain:           number | null
  nombre_pieces_principales: number | null
}

interface AdresseInfo {
  id: string; numero: string; nom_voie: string; code_postal: string; commune: string; type_bien: string
}

interface DpeInfo {
  id: string; adresse_id: string; date_etablissement: string; classe_bilan_dpe: string
  surface_habitable_logement: number | null; type_energie_principale_chauffage: string | null
  numero_dpe: string | null; conso_ep_m2: number | null; cout_annuel: number | null
}

interface BdnbInfo {
  batiment_groupe_id: string; type_batiment_dpe: string; annee_construction: number
  nb_log: number; nb_niveau: number; surface_emprise_sol: number
  hauteur_mean: number; mat_mur_txt: string; mat_toit_txt: string
  conso_5_usages_ep_m2: number; emission_ges_5_usages_m2: number
  classe_bilan_dpe: string
}

const C = {
  bg:     '#141416',
  border: 'rgba(255,255,255,0.08)',
  text:   '#F0F0F2',
  mid:    '#9A9AA8',
  muted:  '#6B6B7B',
  card:   '#1A1A1E',
  primary:'#1D9E75',
}

const DPE_COLORS: Record<string, string> = {
  A: '#16a34a', B: '#4ade80', C: '#84cc16',
  D: '#facc15', E: '#f97316', F: '#ef4444', G: '#b91c1c',
}

function formatPrice(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', color: C.text }}
      >
        <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.mid} strokeWidth="2"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && <div style={{ padding: '0 16px 16px' }}>{children}</div>}
    </div>
  )
}

export default function ParcelCard({
  data, onClose,
}: { data: ParcelData; onClose: () => void }) {
  const { id_parcelle, dvf_adresse, mutations, adresses, dpe, bdnb } = data

  const totalVentes = mutations.length
  const lastMutation = mutations[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg, color: C.text, overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ padding: '16px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 12, alignItems: 'flex-start', flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Parcelle cadastrale</div>
          <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#60a5fa', marginBottom: 6 }}>
            {id_parcelle}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {adresses.map(a => {
              const isPrimary = dvf_adresse ? a.numero === dvf_adresse.numero : false
              return (
                <span key={a.id} style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 20,
                  background: isPrimary ? 'rgba(29,158,117,0.2)' : 'rgba(255,255,255,0.06)',
                  color: isPrimary ? C.primary : C.mid,
                  border: isPrimary ? `1px solid rgba(29,158,117,0.3)` : '1px solid transparent',
                }}>
                  {a.numero} {a.nom_voie}
                  {isPrimary && <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.8 }}>✓</span>}
                </span>
              )
            })}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.mid} strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Résumé rapide */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, borderBottom: `1px solid ${C.border}`, background: C.border }}>
        <div style={{ background: C.bg, padding: '12px 16px' }}>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, textTransform: 'uppercase' }}>Ventes (10 ans)</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#60a5fa' }}>{totalVentes}</div>
        </div>
        <div style={{ background: C.bg, padding: '12px 16px' }}>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, textTransform: 'uppercase' }}>Dernière vente</div>
          {lastMutation ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa' }}>{formatPrice(lastMutation.valeur_fonciere)}</div>
              <div style={{ fontSize: 10, color: C.mid }}>{formatDate(lastMutation.date_mutation)}</div>
            </>
          ) : <div style={{ fontSize: 12, color: C.muted }}>Aucune</div>}
        </div>
      </div>

      {/* Mutations DVF */}
      <Section title={`Transactions DVF (${totalVentes})`} defaultOpen={totalVentes > 0}>
        {mutations.length === 0
          ? <p style={{ fontSize: 12, color: C.muted }}>Aucune transaction enregistrée.</p>
          : mutations.map(m => (
            <div key={m.id_mutation} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
              {/* En-tête mutation */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#60a5fa' }}>{formatPrice(m.valeur_fonciere)}</span>
                <span style={{ fontSize: 11, color: C.mid }}>{formatDate(m.date_mutation)}</span>
              </div>

              {/* Locaux */}
              {(m.locaux ?? []).map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.07)', color: C.mid }}>
                    {l.type_local ?? '—'}
                  </span>
                  <span style={{ fontSize: 11, color: C.mid }}>
                    {l.surface_reelle_bati ? `${l.surface_reelle_bati} m² bâti` : ''}
                    {l.surface_terrain ? ` · ${l.surface_terrain} m² terrain` : ''}
                    {l.nombre_pieces_principales ? ` · ${l.nombre_pieces_principales} pièces` : ''}
                  </span>
                </div>
              ))}

              {/* Parcelles de la mutation */}
              {m.parcelles?.length > 1 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Parcelles concernées :</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {m.parcelles.map(p => (
                      <span key={p} style={{ fontFamily: 'monospace', fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}>
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Total si plusieurs locaux */}
              {(m.locaux ?? []).length > 1 && (
                <div style={{ marginTop: 8, paddingTop: 6, borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: C.mid }}>Total mutation</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa' }}>{formatPrice(m.valeur_fonciere)}</span>
                </div>
              )}
            </div>
          ))
        }
      </Section>

      {/* DPE */}
      <Section title={`DPE (${dpe.length})`} defaultOpen={dpe.length > 0}>
        {dpe.length === 0
          ? <p style={{ fontSize: 12, color: C.muted }}>Aucun DPE enregistré pour les adresses de cette parcelle.</p>
          : dpe.map(d => (
            <div key={d.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 6, flexShrink: 0, background: DPE_COLORS[d.classe_bilan_dpe] ?? '#64748b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16 }}>
                {d.classe_bilan_dpe}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{formatDate(d.date_etablissement)}</div>
                <div style={{ fontSize: 11, color: C.mid }}>
                  {d.surface_habitable_logement ? `${d.surface_habitable_logement} m²` : ''}
                  {d.type_energie_principale_chauffage ? ` · ${d.type_energie_principale_chauffage}` : ''}
                  {d.conso_ep_m2 ? ` · ${d.conso_ep_m2} kWh/m²/an` : ''}
                  {d.cout_annuel ? ` · ~${Math.round(d.cout_annuel)}€/an` : ''}
                </div>
              </div>
            </div>
          ))
        }
      </Section>

      {/* BDNB */}
      {bdnb.length > 0 && (
        <Section title="Bâtiment (BDNB)">
          {bdnb.map(b => (
            <div key={b.batiment_groupe_id}>
              {[
                ['Type', b.type_batiment_dpe],
                ['Année construction', b.annee_construction],
                ['Nb logements', b.nb_log],
                ['Nb niveaux', b.nb_niveau],
                ['Surface emprise', b.surface_emprise_sol ? `${b.surface_emprise_sol} m²` : null],
                ['Hauteur moyenne', b.hauteur_mean ? `${b.hauteur_mean} m` : null],
                ['Murs', b.mat_mur_txt],
                ['Toiture', b.mat_toit_txt],
                ['Conso énergie', b.conso_5_usages_ep_m2 ? `${b.conso_5_usages_ep_m2} kWh/m²/an` : null],
                ['Émissions GES', b.emission_ges_5_usages_m2 ? `${b.emission_ges_5_usages_m2} kgCO2/m²/an` : null],
                ['Classe DPE bâtiment', b.classe_bilan_dpe],
              ].filter(([, v]) => v != null).map(([k, v]) => (
                <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: C.mid }}>{k}</span>
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{String(v)}</span>
                </div>
              ))}
            </div>
          ))}
        </Section>
      )}
    </div>
  )
}
