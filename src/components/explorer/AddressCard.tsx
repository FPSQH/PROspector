'use client'

import { useState, useEffect } from 'react'

interface AddressDetail {
  adresse: any
  dpe: any[]
  dvf: any[]
  bdnb: any
  interactions: any[]
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

const TYPE_LABELS: Record<string, string> = {
  maison: 'Maison', appartement: 'Appartement', commerce: 'Commerce',
  logement_social: 'Log. social', inconnu: 'Inconnu',
}

const ACTION_LABELS: Record<string, string> = {
  flyer_depose: 'Flyer', courrier_depose: 'Courrier', rien: 'Passage sans dépôt',
}

const STATUT_LABELS: Record<string, string> = {
  jamais_vue: 'Jamais vue', visite: 'Visité', contact: 'Contact',
  rdv_pris: 'RDV pris', estimation: 'Estimation', mandat_signe: 'Mandat signé',
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
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', color: C.text,
        }}
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

export default function AddressCard({
  addressId, onClose,
}: { addressId: string; onClose: () => void }) {
  const [data, setData] = useState<AddressDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setData(null)
    fetch(`/api/explorer/address/${addressId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [addressId])

  const lastDpe         = data?.dpe?.[0]
  const lastDvf         = data?.dvf?.[0]
  const lastInteraction = data?.interactions?.[0]
  const adresse         = data?.adresse

  const adresseLabel = adresse
    ? `${adresse.numero ?? ''} ${adresse.nom_voie}, ${adresse.code_postal} ${adresse.commune}`.trim()
    : '…'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: C.bg, color: C.text, overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', gap: 12, alignItems: 'flex-start', flexShrink: 0,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, marginBottom: 6 }}>
            {adresseLabel}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {adresse?.type_bien && (
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                background: 'rgba(29,158,117,0.15)', color: C.primary,
              }}>
                {TYPE_LABELS[adresse.type_bien] ?? adresse.type_bien}
              </span>
            )}
            {adresse?.zones_prospection && (
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                background: adresse.zones_prospection.couleur + '33',
                color: adresse.zones_prospection.couleur,
              }}>
                {adresse.zones_prospection.nom}
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8,
          width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.mid} strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {loading && (
        <div style={{ padding: 32, textAlign: 'center', color: C.mid }}>Chargement…</div>
      )}

      {!loading && data && (
        <>
          {/* Résumé toujours visible */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1,
            borderBottom: `1px solid ${C.border}`, background: C.border,
          }}>
            {/* DPE */}
            <div style={{ background: C.bg, padding: '12px 16px' }}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>DPE</div>
              {lastDpe ? (
                <>
                  <div style={{
                    display: 'inline-block', fontSize: 20, fontWeight: 800, width: 32, height: 32,
                    borderRadius: 6, background: DPE_COLORS[lastDpe.classe_bilan_dpe] ?? '#64748b',
                    color: '#fff', textAlign: 'center', lineHeight: '32px',
                  }}>
                    {lastDpe.classe_bilan_dpe}
                  </div>
                  <div style={{ fontSize: 10, color: C.mid, marginTop: 4 }}>
                    {formatDate(lastDpe.date_etablissement)}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: C.muted }}>Aucun</div>
              )}
            </div>

            {/* DVF */}
            <div style={{ background: C.bg, padding: '12px 16px' }}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Dernière vente</div>
              {lastDvf ? (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa' }}>
                    {formatPrice(lastDvf.valeur_fonciere)}
                  </div>
                  <div style={{ fontSize: 10, color: C.mid, marginTop: 2 }}>
                    {formatDate(lastDvf.date_mutation)} · {lastDvf.distance_metres}m
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: C.muted }}>Aucune</div>
              )}
            </div>

            {/* Terrain */}
            <div style={{ background: C.bg, padding: '12px 16px' }}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Terrain</div>
              {lastInteraction ? (
                <>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                    {STATUT_LABELS[lastInteraction.statut_adresse] ?? lastInteraction.statut_adresse}
                  </div>
                  <div style={{ fontSize: 10, color: C.mid, marginTop: 2 }}>
                    {formatDate(lastInteraction.created_at)}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: C.muted }}>Jamais visitée</div>
              )}
            </div>
          </div>

          {/* Historique DPE */}
          <Section title={`DPE (${data.dpe.length})`} defaultOpen={data.dpe.length > 0}>
            {data.dpe.length === 0
              ? <p style={{ fontSize: 12, color: C.muted }}>Aucun DPE enregistré.</p>
              : data.dpe.map((d: any) => (
                <div key={d.id} style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 5, flexShrink: 0,
                    background: DPE_COLORS[d.classe_bilan_dpe] ?? '#64748b',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 14,
                  }}>
                    {d.classe_bilan_dpe}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{formatDate(d.date_etablissement)}</div>
                    <div style={{ fontSize: 11, color: C.mid }}>
                      {d.surface_habitable_logement ? `${d.surface_habitable_logement} m²` : ''}
                      {d.type_energie_principale_chauffage ? ` · ${d.type_energie_principale_chauffage}` : ''}
                    </div>
                  </div>
                  {d.numero_dpe && (
                    <div style={{ fontSize: 10, color: C.muted, fontFamily: 'monospace' }}>
                      #{d.numero_dpe?.slice(-6)}
                    </div>
                  )}
                </div>
              ))
            }
          </Section>

          {/* Historique DVF – groupé par id_mutation */}
          {(() => {
            const grouped = new Map<string, any>()
            for (const row of (data.dvf ?? [])) {
              const key = row.id_mutation ?? row.id
              if (!grouped.has(key)) {
                grouped.set(key, {
                  id_mutation: key,
                  date_mutation: row.date_mutation,
                  valeur_fonciere: row.valeur_fonciere,
                  via_parcelle: row.via_parcelle,
                  distance_metres: row.distance_metres,
                  locaux: [],
                })
              }
              grouped.get(key).locaux.push({
                type_local: row.type_local,
                surface_reelle_bati: row.surface_reelle_bati,
                surface_terrain: row.surface_terrain,
                nombre_pieces_principales: row.nombre_pieces,
              })
            }
            const mutations = Array.from(grouped.values())
            return (
              <Section title={`Transactions DVF (${mutations.length})`} defaultOpen={mutations.length > 0}>
                {mutations.length === 0
                  ? <p style={{ fontSize: 12, color: C.muted }}>Aucune transaction à proximité.</p>
                  : mutations.map((m: any) => (
                    <div key={m.id_mutation} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#60a5fa' }}>
                          {formatPrice(m.valeur_fonciere)}
                        </span>
                        <span style={{ fontSize: 11, color: C.mid }}>
                          {formatDate(m.date_mutation)}
                          {m.via_parcelle
                            ? <span title="Correspondance exacte par parcelle"> ✓</span>
                            : <span title={`à ${m.distance_metres}m`}> ~{m.distance_metres}m</span>}
                        </span>
                      </div>
                      {m.locaux.map((l: any, i: number) => (
                        <div key={i} style={{ fontSize: 11, color: C.mid, marginBottom: 2 }}>
                          {l.type_local ?? '—'}
                          {l.surface_reelle_bati ? ` · ${l.surface_reelle_bati} m²` : ''}
                          {l.surface_terrain ? ` · terrain ${l.surface_terrain} m²` : ''}
                          {l.nombre_pieces_principales ? ` · ${l.nombre_pieces_principales} p.` : ''}
                        </div>
                      ))}
                      {m.locaux.length > 1 && (
                        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.mid }}>
                          <span>{m.locaux.length} locaux</span>
                          <span style={{ fontWeight: 700, color: '#60a5fa' }}>Total : {formatPrice(m.valeur_fonciere)}</span>
                        </div>
                      )}
                    </div>
                  ))
                }
              </Section>
            )
          })()}

          {/* Terrain */}
          <Section title={`Passages terrain (${data.interactions.length})`} defaultOpen={data.interactions.length > 0}>
            {data.interactions.length === 0
              ? <p style={{ fontSize: 12, color: C.muted }}>Aucun passage enregistré.</p>
              : data.interactions.map((i: any) => (
                <div key={i.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>
                      {i.presence ? '✓ Présence' : '○ Absent'}
                      {i.action ? ` · ${ACTION_LABELS[i.action] ?? i.action}` : ''}
                    </span>
                    <span style={{ fontSize: 11, color: C.mid }}>{formatDate(i.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.mid }}>
                    {STATUT_LABELS[i.statut_adresse] ?? i.statut_adresse}
                    {i.sessions_prospection?.zones_prospection?.nom
                      ? ` · ${i.sessions_prospection.zones_prospection.nom}` : ''}
                  </div>
                </div>
              ))
            }
          </Section>

          {/* BDNB */}
          {data.bdnb && (
            <Section title="Bâtiment (BDNB)">
              {[
                ['Type', data.bdnb.type_batiment_dpe],
                ['Année construction', data.bdnb.annee_construction],
                ['Nb logements', data.bdnb.nb_log],
                ['Nb niveaux', data.bdnb.nb_niveau],
                ['Surface emprise', data.bdnb.surface_emprise_sol ? `${data.bdnb.surface_emprise_sol} m²` : null],
                ['Hauteur moyenne', data.bdnb.hauteur_mean ? `${data.bdnb.hauteur_mean} m` : null],
                ['Murs', data.bdnb.mat_mur_txt],
                ['Toiture', data.bdnb.mat_toit_txt],
                ['Conso énergie', data.bdnb.conso_5_usages_ep_m2 ? `${data.bdnb.conso_5_usages_ep_m2} kWh/m²/an` : null],
                ['Émissions GES', data.bdnb.emission_ges_5_usages_m2 ? `${data.bdnb.emission_ges_5_usages_m2} kgCO2/m²/an` : null],
              ].filter(([, v]) => v != null).map(([k, v]) => (
                <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: C.mid }}>{k}</span>
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{String(v)}</span>
                </div>
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  )
}
