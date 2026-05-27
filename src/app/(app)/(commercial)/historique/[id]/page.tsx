'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'

const HistoriqueMap = dynamic(() => import('@/components/historique/HistoriqueMap'), { ssr: false })

/* ── Design tokens ───────────────────────────────────────── */
const C = {
  bg:      '#0C0C0E',
  card:    '#141416',
  card2:   '#1A1A1E',
  border:  'rgba(255,255,255,0.06)',
  borderl: 'rgba(255,255,255,0.10)',
  text:    '#F0F0F2',
  mid:     '#9A9AA8',
  muted:   '#6B6B7B',
  dim:     '#4A4A58',
  primary: '#1D9E75',
  gold:    '#D97706',
  danger:  '#EF4444',
  info:    '#3B82F6',
  green:   '#4ADE80',
  amber:   '#FBBF24',
}

const STATUT_STYLE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  planifiee:    { label: 'Planifiée',    color: '#60A5FA', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.25)'  },
  preparee:     { label: 'Préparée',     color: '#C084FC', bg: 'rgba(192,132,252,0.12)', border: 'rgba(192,132,252,0.25)' },
  en_cours:     { label: 'En cours',     color: '#FBBF24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.25)'  },
  realisee:     { label: 'Réalisée',     color: '#4ADE80', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.25)'   },
  annulee:      { label: 'Annulée',      color: '#6B6B7B', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.10)' },
  non_realisee: { label: 'Non réalisée', color: '#FBBF24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.25)'  },
}

const TYPE_LABEL: Record<string, string> = {
  zone: 'Zone', dpe: 'Tournée DPE', hors_zone: 'Hors-zone', libre: 'Libre',
}

const RESULTAT_LABEL: Record<string, string> = {
  contact_etabli: 'Contact établi',
  contact:        'Contact',
  rien:           'Rien',
}

const ACTION_LABEL: Record<string, string> = {
  flyer_depose:   'Flyer déposé',
  courrier_depose: 'Courrier déposé',
  boite:          'Boitage',
  rien:           'Rien',
}

const PIPELINE_LABEL: Record<string, string> = {
  prospect:      'Prospect',
  qualification: 'Qualification',
  estimation:    'Estimation',
  mandat:        'Mandat',
  perdu:         'Perdu',
}

const PIPELINE_COLOR: Record<string, string> = {
  prospect:      '#9A9AA8',
  qualification: '#60A5FA',
  estimation:    '#FBBF24',
  mandat:        '#4ADE80',
  perdu:         '#F87171',
}

interface Interaction {
  id: string
  adresse_id?: string
  resultat?: string | null
  action?: string | null
  type_contact?: string | null
  type_habitat?: string | null
  statut_adresse?: string | null
  note?: string | null
  adresse?: { numero?: string; nom_voie?: string; commune?: string; lat?: number; lon?: number } | null
}

interface Contact {
  id: string
  nom?: string | null
  prenom?: string | null
  tel1?: string | null
  statut_pipeline?: string | null
  type_contact?: string | null
  created_at?: string
}

interface Session {
  id: string
  zone_id?: string | null
  date_session: string
  heure_debut?: string | null
  heure_fin?: string | null
  heure_debut_reel?: string | null
  heure_fin_reel?: string | null
  statut: string
  type_session?: string | null
  commune_nom?: string | null
  commune_code_insee?: string | null
  nom_tournee?: string | null
  nb_portes?: number | null
  nb_boites?: number | null
  notes?: string | null
  rapport_json?: {
    nb_visites?: number; nb_contacts?: number; nb_boitage?: number
    nb_maisons?: number; nb_collectif?: number; nb_syndics?: number
    nb_commerces?: number; nb_contacts_terrain?: number; nb_contacts_crm?: number
  } | null
  zones_prospection?: { nom: string; couleur: string; numero: number } | null
}

function fmtDate(s: string): string {
  return new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtDuree(debut?: string | null, fin?: string | null): string {
  if (!debut || !fin) return '—'
  const d = new Date(debut), f = new Date(fin)
  const diff = Math.round((f.getTime() - d.getTime()) / 60000)
  if (diff <= 0) return '—'
  const h = Math.floor(diff / 60), m = diff % 60
  return h > 0 ? `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}` : `${m} min`
}

function fmtHeure(s?: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function getInteractionColor(inter: Interaction): string {
  const r = inter.resultat, a = inter.action
  if (r === 'contact_etabli' || r === 'contact') return C.green
  if (a === 'flyer_depose' || a === 'courrier_depose' || a === 'boite') return C.amber
  return C.dim
}

function KpiCard({ value, label, sub }: { value: string | number; label: string; sub?: string }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: '16px 20px', flex: 1, minWidth: 100,
    }}>
      <div style={{ fontSize: '1.6rem', fontWeight: 700, color: C.text, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export default function HistoriqueDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id     = params.id as string

  const [session,      setSession]      = useState<Session | null>(null)
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [contacts,     setContacts]     = useState<Contact[]>([])
  const [loading,      setLoading]      = useState(true)
  const [reprogrammer, setReprogrammer] = useState(false)

  useEffect(() => {
    fetch(`/api/historique/${id}`)
      .then(r => r.json())
      .then(d => {
        setSession(d.session ?? null)
        setInteractions(d.interactions ?? [])
        setContacts(d.contacts ?? [])
      })
      .finally(() => setLoading(false))
  }, [id])

  async function handleReprogrammer() {
    if (!session || reprogrammer) return
    setReprogrammer(true)
    try {
      const body: any = { type_session: session.type_session ?? 'zone' }
      if (session.zone_id) body.zone_id = session.zone_id
      if (session.commune_code_insee) {
        body.commune_code_insee = session.commune_code_insee
        body.commune_nom        = session.commune_nom
      }
      const res = await fetch('/api/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (res.ok) {
        router.push('/terrain')
      } else {
        setReprogrammer(false)
      }
    } catch {
      setReprogrammer(false)
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100dvh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      Chargement…
    </div>
  )

  if (!session) return (
    <div style={{ minHeight: '100dvh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.danger, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      Session introuvable.
    </div>
  )

  const st        = STATUT_STYLE[session.statut] ?? STATUT_STYLE.planifiee
  const rj        = session.rapport_json
  const dureeReel = fmtDuree(session.heure_debut_reel, session.heure_fin_reel)
  const nbPortes  = rj?.nb_visites  ?? session.nb_portes ?? 0
  const nbContact = rj?.nb_contacts ?? 0
  const nbBoitage = rj?.nb_boitage  ?? session.nb_boites ?? 0
  const tauxCont  = nbPortes > 0 ? Math.round(nbContact / nbPortes * 100) : 0

  const mapAdresses = interactions
    .filter(i => i.adresse?.lat && i.adresse?.lon)
    .map(i => ({
      id:      i.id,
      lat:     i.adresse!.lat!,
      lon:     i.adresse!.lon!,
      resultat: i.resultat,
      action:   i.action,
    }))

  const sessionLabel = session.zones_prospection
    ? `Zone ${session.zones_prospection.numero} — ${session.zones_prospection.nom}`
    : session.nom_tournee ?? session.commune_nom ?? 'Session libre'

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, color: C.text, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: 80 }}>

      {/* ── Header ── */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '16px 24px' }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 0, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Historique
        </button>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{sessionLabel}</h1>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                color: st.color, background: st.bg, border: `1px solid ${st.border}`,
              }}>
                {st.label}
              </span>
              {session.type_session && (
                <span style={{ fontSize: 11, color: C.muted }}>
                  {TYPE_LABEL[session.type_session] ?? session.type_session}
                </span>
              )}
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: C.muted }}>
              {fmtDate(session.date_session)}
              {session.heure_debut_reel && ` · ${fmtHeure(session.heure_debut_reel)} → ${fmtHeure(session.heure_fin_reel)}`}
            </p>
          </div>

          {session.zone_id && (
            <button
              onClick={handleReprogrammer}
              disabled={reprogrammer}
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: C.primary, color: '#fff', border: 'none',
                opacity: reprogrammer ? 0.6 : 1,
              }}
            >
              {reprogrammer ? 'Création…' : '↻ Relancer une session'}
            </button>
          )}
        </div>

        {session.notes && (
          <p style={{ margin: '12px 0 0', fontSize: 13, color: C.mid, fontStyle: 'italic' }}>
            {session.notes}
          </p>
        )}
      </div>

      <div style={{ padding: '20px 24px', maxWidth: 900 }}>

        {/* ── KPIs ── */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <KpiCard value={nbPortes}       label="Portes visitées"    />
          <KpiCard value={nbContact}      label="Contacts"           sub={tauxCont > 0 ? `${tauxCont}% de taux` : undefined} />
          <KpiCard value={nbBoitage}      label="Boîtages / flyers"  />
          <KpiCard value={dureeReel}      label="Durée réelle"       />
          {rj?.nb_maisons  != null && rj.nb_maisons  > 0 && <KpiCard value={rj.nb_maisons}  label="Maisons qual." />}
          {rj?.nb_collectif != null && rj.nb_collectif > 0 && <KpiCard value={rj.nb_collectif} label="Collectifs qual." />}
        </div>

        {/* ── Carte ── */}
        {mapAdresses.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: C.mid, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Carte des visites
            </h2>
            <div style={{ height: 320, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
              <HistoriqueMap adresses={mapAdresses} />
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
              {[
                { color: C.green, label: 'Contact établi' },
                { color: C.amber, label: 'Boitage / flyer' },
                { color: C.dim,   label: 'Visite sans contact' },
              ].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.muted }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: l.color }} />
                  {l.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Interactions ── */}
        {interactions.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: C.mid, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Adresses visitées ({interactions.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {interactions.map(inter => {
                const adresse  = inter.adresse
                const adrLabel = adresse
                  ? [adresse.numero, adresse.nom_voie, adresse.commune].filter(Boolean).join(' ')
                  : inter.adresse_id ?? '—'
                const dot = getInteractionColor(inter)
                return (
                  <div key={inter.id} style={{
                    background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
                    padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {adrLabel}
                      </div>
                      <div style={{ display: 'flex', gap: 12, marginTop: 3, flexWrap: 'wrap' }}>
                        {inter.resultat && inter.resultat !== 'rien' && (
                          <span style={{ fontSize: 11, color: C.mid }}>
                            {RESULTAT_LABEL[inter.resultat] ?? inter.resultat}
                          </span>
                        )}
                        {inter.action && inter.action !== 'rien' && (
                          <span style={{ fontSize: 11, color: C.mid }}>
                            {ACTION_LABEL[inter.action] ?? inter.action}
                          </span>
                        )}
                        {inter.type_habitat && (
                          <span style={{ fontSize: 11, color: C.dim, textTransform: 'capitalize' }}>
                            {inter.type_habitat}
                          </span>
                        )}
                      </div>
                      {inter.note && (
                        <p style={{ margin: '4px 0 0', fontSize: 11, color: C.muted, fontStyle: 'italic' }}>{inter.note}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Contacts ── */}
        {contacts.length > 0 && (
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: C.mid, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Contacts créés ({contacts.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {contacts.map(ct => {
                const pipeColor = PIPELINE_COLOR[ct.statut_pipeline ?? 'prospect'] ?? C.dim
                const initials  = [ct.prenom?.[0], ct.nom?.[0]].filter(Boolean).join('').toUpperCase() || '?'
                return (
                  <div
                    key={ct.id}
                    onClick={() => router.push(`/contacts?id=${ct.id}`)}
                    style={{
                      background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
                      padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                      transition: 'border-color 0.12s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = C.borderl)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: `${pipeColor}22`, border: `1.5px solid ${pipeColor}55`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, color: pipeColor,
                    }}>
                      {initials}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                        {[ct.prenom, ct.nom].filter(Boolean).join(' ') || 'Contact sans nom'}
                      </div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
                        {ct.tel1 && <span style={{ fontSize: 12, color: C.muted }}>{ct.tel1}</span>}
                        {ct.statut_pipeline && (
                          <span style={{ fontSize: 11, color: pipeColor }}>
                            {PIPELINE_LABEL[ct.statut_pipeline] ?? ct.statut_pipeline}
                          </span>
                        )}
                      </div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: C.dim }}>
                      <path d="M5 2L10 7L5 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {interactions.length === 0 && contacts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted, fontSize: 14 }}>
            Aucune interaction enregistrée pour cette session.
          </div>
        )}
      </div>
    </div>
  )
}
