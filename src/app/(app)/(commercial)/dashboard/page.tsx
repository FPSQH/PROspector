import DpeAlertsWidget from '@/components/dashboard/DpeAlertsWidget'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: commercial } = await supabase
    .from('commerciaux').select('*').eq('id', user.id).single()
  if (!commercial) redirect('/login')

  const { data: communes } = await supabase
    .from('communes').select('id, nom, code_insee, chargee_at').eq('commercial_id', commercial.id)
  if (!communes || communes.length === 0) redirect('/onboarding')

  const communesInsee = communes.map((c: any) => c.code_insee)
  const now          = new Date()
  const today        = now.toISOString().split('T')[0]
  const moisActuel   = now.getMonth() + 1
  const anneeActuel  = now.getFullYear()
  const nomMois      = now.toLocaleDateString('fr-FR', { month: 'long' })

  const [
    { count: nbAdresses },
    { data: zones },
    { data: prochaineSessions },
    { data: sessionStats },
    { data: sessionsMois },
    { data: activeSessionData },
  ] = await Promise.all([
    supabase.from('adresses').select('id', { count: 'exact', head: true })
      .in('code_insee', communesInsee.length > 0 ? communesInsee : ['__none__']),

    supabase.from('zones_prospection')
      .select('id, nom, numero, couleur, nb_prospectables, nb_adresses, capacite_theorique, statut')
      .eq('commercial_id', commercial.id).order('numero'),

    supabase.from('planning_sessions')
      .select('id, date_prevue, heure_debut, heure_fin, zone_id, zones_prospection(id, nom, couleur, numero, nb_prospectables)')
      .eq('commercial_id', commercial.id).eq('statut', 'planifiee')
      .gte('date_prevue', today).order('date_prevue', { ascending: true }).order('heure_debut', { ascending: true }).limit(1),

    supabase.from('planning_sessions')
      .select('zone_id, nb_adresses_visitees, nb_adresses_total, nb_contacts, nb_maisons_qualifiees, nb_immeubles_qualifies, nb_syndics_qualifies')
      .eq('commercial_id', commercial.id).eq('statut', 'realisee'),

    supabase.from('planning_sessions')
      .select('zone_id, statut, nb_adresses_visitees, nb_adresses_total, nb_contacts, nb_maisons_qualifiees, nb_immeubles_qualifies, nb_syndics_qualifies')
      .eq('commercial_id', commercial.id).eq('mois', moisActuel).eq('annee', anneeActuel),

    // Session terrain active
    supabase.from('sessions_prospection')
      .select('id, created_at, heure_debut_reel, date_session, zones_prospection(id, nom, couleur, numero)')
      .eq('commercial_id', commercial.id).eq('statut', 'en_cours')
      .order('created_at', { ascending: false }).limit(1),
  ])

  const { data: sessionsHistorique } = await supabase
    .from('sessions_prospection')
    .select('id, date_session, heure_debut_reel, heure_fin_reel, nb_portes, nb_boites, nb_contacts_saisis, nb_qualifications, rapport_json, zones_prospection(id, nom, couleur, numero)')
    .eq('commercial_id', commercial.id)
    .eq('statut', 'realisee')
    .order('date_session', { ascending: false })
    .limit(8)

  const nbZones            = zones?.length ?? 0
  const totalAdressesZones = (zones ?? []).reduce((s: number, z: any) => s + (z.nb_prospectables ?? 0), 0)
  const prochaineSession   = prochaineSessions?.[0] ?? null
  const activeTerrainSession = activeSessionData?.[0] ?? null

  // ── Formatage session active ──────────────────────────────────
  const activeDebutFr = activeTerrainSession
    ? (() => {
        const d = activeTerrainSession.heure_debut_reel ?? activeTerrainSession.created_at
        return d ? new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''
      })()
    : ''
  const activeDateFr = activeTerrainSession?.date_session
    ? new Date(activeTerrainSession.date_session + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    : ''

  // ── Cumul par zone ────────────────────────────────────────────
  type ZoneStat = { visitees: number; total: number; contacts: number; maisons: number; immeubles: number; syndics: number }
  const statsByZone = new Map<string, ZoneStat>()
  for (const s of (sessionStats ?? [])) {
    const curr = statsByZone.get(s.zone_id) ?? { visitees:0, total:0, contacts:0, maisons:0, immeubles:0, syndics:0 }
    statsByZone.set(s.zone_id, {
      visitees:  curr.visitees  + (s.nb_adresses_visitees  ?? 0),
      total:     curr.total     + (s.nb_adresses_total     ?? 0),
      contacts:  curr.contacts  + (s.nb_contacts           ?? 0),
      maisons:   curr.maisons   + (s.nb_maisons_qualifiees ?? 0),
      immeubles: curr.immeubles + (s.nb_immeubles_qualifies ?? 0),
      syndics:   curr.syndics   + (s.nb_syndics_qualifies  ?? 0),
    })
  }

  // ── Synthèse mensuelle ────────────────────────────────────────
  const moisReal = (sessionsMois ?? []).filter((s: any) => s.statut === 'realisee')
  const moisPlan = (sessionsMois ?? []).filter((s: any) => s.statut === 'planifiee')
  const mois = {
    nbRealisees:  moisReal.length,
    nbPlanifiees: moisPlan.length,
    visitees:     moisReal.reduce((s: number, x: any) => s + (x.nb_adresses_visitees   ?? 0), 0),
    total:        moisReal.reduce((s: number, x: any) => s + (x.nb_adresses_total      ?? 0), 0),
    contacts:     moisReal.reduce((s: number, x: any) => s + (x.nb_contacts            ?? 0), 0),
    maisons:      moisReal.reduce((s: number, x: any) => s + (x.nb_maisons_qualifiees  ?? 0), 0),
    immeubles:    moisReal.reduce((s: number, x: any) => s + (x.nb_immeubles_qualifies ?? 0), 0),
    syndics:      moisReal.reduce((s: number, x: any) => s + (x.nb_syndics_qualifies   ?? 0), 0),
  }
  const moisPct = mois.total > 0 ? Math.round(mois.visitees / mois.total * 100) : 0

  const prochaineZone   = (prochaineSession as any)?.zones_prospection ?? null
  const prochaineDateFr = prochaineSession
    ? new Date(prochaineSession.date_prevue + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
    : null
  const etape    = nbZones === 0 ? 'setup_zones' : 'pret'
  const isManager = commercial.role === 'manager'

  return (
    <div style={{ minHeight:'100dvh', background:'#f8f7f4' }}>

      {/* Header */}
      <div style={{ background:'#fff', borderBottom:'1px solid #e8e7e0', padding:'0 28px', height:52, display:'flex', alignItems:'center', justifyContent:'space-between' }} className="dash-header">
        <div>
          <span style={{ fontWeight:600, fontSize:'0.9375rem', color:'#1a1a18' }}>Bonjour {commercial?.prenom} 👋</span>
          <span style={{ marginLeft:12, fontSize:'0.8rem', color:'#9b9b96' }} className="dash-header-date">
            {now.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' })}
          </span>
        </div>
        <form action="/auth/signout" method="post">
          <button style={{ padding:'5px 12px', borderRadius:7, border:'1px solid #e8e7e0', background:'transparent', fontSize:'0.78rem', color:'#9b9b96', cursor:'pointer' }}>Déconnexion</button>
        </form>
      </div>

      <main style={{ maxWidth:1100, margin:'0 auto', padding:'24px 28px' }} className="dash-main">

        {/* ── Bannière session terrain active ── */}
        {activeTerrainSession && (
          <div style={{ background:'#fff', border:'1.5px solid #fed7aa', borderRadius:12, padding:'14px 20px', display:'flex', alignItems:'center', gap:16, marginBottom:20 }}>
            <div style={{ fontSize:'1.4rem', flexShrink:0 }}>⚡</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:700, fontSize:'0.9rem', color:'#92400e', marginBottom:2 }}>Session terrain en cours</div>
              <div style={{ fontSize:'0.8rem', color:'#b45309' }}>
                {(activeTerrainSession as any).zones_prospection?.nom ?? 'Zone'}
                {activeDateFr && ` · ${activeDateFr}`}
                {activeDebutFr && ` · démarrée à ${activeDebutFr}`}
              </div>
            </div>
            <div style={{ display:'flex', gap:8, flexShrink:0 }}>
              <Link href="/terrain" style={{ padding:'7px 14px', borderRadius:8, background:'#ea580c', color:'#fff', fontWeight:600, fontSize:'0.8rem', textDecoration:'none' }}>
                Reprendre →
              </Link>
              <Link href="/terrain" style={{ padding:'7px 12px', borderRadius:8, background:'#fff', color:'#92400e', fontWeight:600, fontSize:'0.8rem', textDecoration:'none', border:'1px solid #fed7aa' }}>
                Clôturer
              </Link>
            </div>
          </div>
        )}

        {/* Bannière manager */}
        {isManager && (
          <div style={{ background:'#fff', border:'1.5px solid #d1fae5', borderRadius:12, padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
            <div>
              <div style={{ fontWeight:600, fontSize:'0.9rem', color:'#1a1a18', marginBottom:3 }}>👥 Espace manager</div>
              <div style={{ fontSize:'0.8rem', color:'#5F5E5A' }}>Gérez les comptes et les accès de votre équipe commerciale.</div>
            </div>
            <Link href="/admin/users" style={{ padding:'9px 18px', borderRadius:8, background:'#1D9E75', color:'#fff', fontWeight:600, fontSize:'0.875rem', textDecoration:'none', flexShrink:0, marginLeft:20 }}>
              Gérer l&apos;équipe →
            </Link>
          </div>
        )}

        {/* Bannière setup zones */}
        {etape === 'setup_zones' && (
          <div style={{ background:'#fff', border:'1.5px solid #bbf7d0', borderRadius:12, padding:'20px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
            <div>
              <div style={{ fontWeight:600, fontSize:'0.95rem', color:'#1a1a18', marginBottom:4 }}>Configurez vos zones de prospection</div>
              <div style={{ fontSize:'0.82rem', color:'#5F5E5A' }}>
                {(nbAdresses ?? 0).toLocaleString('fr-FR')} adresses chargées sur {communes.length} commune{communes.length > 1 ? 's' : ''} — prêtes à être découpées.
              </div>
            </div>
            <Link href="/zones" style={{ padding:'9px 18px', borderRadius:8, background:'#1D9E75', color:'#fff', fontWeight:600, fontSize:'0.875rem', textDecoration:'none', flexShrink:0, marginLeft:20 }}>
              Générer les zones →
            </Link>
          </div>
        )}

        {/* KPIs */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(0, 1fr))', gap:12, marginBottom:24 }} className="dash-kpis">
          {[
            { label:'Communes',         value:communes.length,                             sub:'dans le secteur',  href:'/onboarding', color:'#2196F3' },
            { label:'Adresses',         value:(nbAdresses ?? 0).toLocaleString('fr-FR'),   sub:'chargées BAN',     href:null,          color:'#9b9b96' },
            { label:'Zones',            value:nbZones,                                     sub:nbZones === 0 ? 'à configurer' : `${totalAdressesZones.toLocaleString('fr-FR')} adresses`, href:'/zones', color:'#1D9E75', empty:nbZones === 0 },
            {
              label:'Prochaine session',
              value: prochaineSession ? prochaineDateFr : '—',
              sub:   prochaineSession ? `${prochaineSession.heure_debut}–${prochaineSession.heure_fin} · ${prochaineZone?.nom ?? ''}` : 'Aucune planifiée',
              href: prochaineSession ? `/terrain?zone_id=${prochaineSession.zone_id}` : '/planning',
              color:'#FF9800',
            },
          ].map((kpi: any) => (
            <div key={kpi.label} style={{ background:kpi.empty?'#fafaf8':'#fff', border:`1px solid ${kpi.empty?'#e8e7e0':'#f0efeb'}`, borderRadius:12, padding:'16px 18px' }}>
              <div style={{ fontSize:'0.72rem', fontWeight:500, color:'#9b9b96', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.04em' }}>{kpi.label}</div>
              <div style={{ fontSize:'1.4rem', fontWeight:700, color:kpi.empty?'#c9c8c2':'#1a1a18', lineHeight:1, marginBottom:4 }}>{kpi.value}</div>
              <div style={{ fontSize:'0.75rem', color:'#9b9b96' }}>{kpi.sub}</div>
              {kpi.href && (
                <Link href={kpi.href} style={{ display:'inline-block', marginTop:8, fontSize:'0.72rem', color:kpi.color, textDecoration:'none', fontWeight:500 }}>
                  {kpi.empty ? 'Configurer →' : 'Démarrer →'}
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* Synthèse mensuelle */}
        {(mois.nbRealisees > 0 || mois.nbPlanifiees > 0) && (
          <div style={{ background:'#fff', borderRadius:12, border:'1px solid #f0efeb', padding:'18px 24px', marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <h2 style={{ margin:0, fontSize:'0.9rem', fontWeight:600, color:'#1a1a18' }}>Synthèse {nomMois}</h2>
              <div style={{ display:'flex', gap:6 }}>
                <span style={{ fontSize:'0.72rem', fontWeight:600, padding:'2px 8px', borderRadius:20, background:'#d1fae5', color:'#065f46' }}>{mois.nbRealisees} réalisée{mois.nbRealisees>1?'s':''}</span>
                {mois.nbPlanifiees > 0 && <span style={{ fontSize:'0.72rem', fontWeight:600, padding:'2px 8px', borderRadius:20, background:'#e0f2fe', color:'#0369a1' }}>{mois.nbPlanifiees} planifiée{mois.nbPlanifiees>1?'s':''}</span>}
                <Link href="/planning" style={{ fontSize:'0.72rem', color:'#1D9E75', textDecoration:'none', padding:'2px 8px' }}>Voir planning →</Link>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:10 }}>
              {[
                { label:'Adresses visitées', value:mois.total>0?`${mois.visitees}/${mois.total}`:'—', sub:mois.total>0?`${moisPct}%`:'', color:'#1D9E75', bg:'#f0fdf4' },
                { label:'Contacts',   value:mois.contacts  ||'—', sub:'établis',    color:'#FF9800', bg:'#fff7ed' },
                { label:'Maisons',    value:mois.maisons   ||'—', sub:'qualifiées', color:'#2196F3', bg:'#eff6ff' },
                { label:'Immeubles',  value:mois.immeubles ||'—', sub:'qualifiés',  color:'#8b5cf6', bg:'#f5f3ff' },
                { label:'Syndics',    value:mois.syndics   ||'—', sub:'identifiés', color:'#6b7280', bg:'#f9fafb' },
                { label:'Couverture', value:mois.total>0?`${moisPct}%`:'—', sub:'du planning', color:moisPct>=80?'#065f46':moisPct>=50?'#92400e':'#dc2626', bg:moisPct>=80?'#f0fdf4':moisPct>=50?'#fffbeb':'#fef2f2' },
              ].map(k => (
                <div key={k.label} style={{ background:k.bg, borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
                  <div style={{ fontSize:'1.15rem', fontWeight:700, color:k.color, lineHeight:1, marginBottom:2 }}>{k.value}</div>
                  <div style={{ fontSize:'0.65rem', color:'#9b9b96', fontWeight:500, marginBottom:1 }}>{k.sub}</div>
                  <div style={{ fontSize:'0.6rem', color:'#c9c8c2', textTransform:'uppercase', letterSpacing:'0.04em' }}>{k.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Grille principale */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:16 }} className="dash-grid">
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

            {/* Prochaine tournée */}
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #f0efeb', padding:'20px 24px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <h2 style={{ margin:0, fontSize:'0.9rem', fontWeight:600, color:'#1a1a18' }}>Prochaine tournée</h2>
                {prochaineSession && (
                  <span style={{ background:'#f0fdf4', color:'#0F6E56', fontSize:'0.72rem', fontWeight:600, padding:'3px 8px', borderRadius:6 }}>
                    {prochaineDateFr} · {prochaineSession.heure_debut}–{prochaineSession.heure_fin}
                  </span>
                )}
              </div>
              {nbZones === 0 ? (
                <div style={{ textAlign:'center', padding:'32px 0', border:'1.5px dashed #e8e7e0', borderRadius:10 }}>
                  <div style={{ fontSize:'2rem', marginBottom:10 }}>🗺️</div>
                  <p style={{ fontSize:'0.875rem', color:'#5F5E5A', marginBottom:4 }}>Aucune zone configurée</p>
                  <Link href="/zones" style={{ padding:'8px 16px', borderRadius:8, background:'#1D9E75', color:'#fff', fontWeight:600, fontSize:'0.82rem', textDecoration:'none' }}>Générer les zones</Link>
                </div>
              ) : !prochaineSession ? (
                <div style={{ textAlign:'center', padding:'24px 0', border:'1.5px dashed #e8e7e0', borderRadius:10 }}>
                  <div style={{ fontSize:'1.8rem', marginBottom:8 }}>📅</div>
                  <p style={{ fontSize:'0.82rem', color:'#5F5E5A', marginBottom:12 }}>Aucune session planifiée à venir</p>
                  <Link href="/planning" style={{ padding:'7px 14px', borderRadius:8, background:'#1D9E75', color:'#fff', fontWeight:600, fontSize:'0.8rem', textDecoration:'none' }}>Générer le planning →</Link>
                </div>
              ) : (
                <div style={{ display:'flex', alignItems:'center', gap:16, padding:'14px 16px', background:'#f8fffe', borderRadius:10, border:'1px solid #e1f5ee' }}>
                  <div style={{ width:40, height:40, borderRadius:10, background:(prochaineZone?.couleur ?? '#1D9E75') + '20', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <div style={{ width:14, height:14, borderRadius:'50%', background:prochaineZone?.couleur ?? '#1D9E75' }}/>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600, fontSize:'0.9rem', color:'#1a1a18' }}>{prochaineZone?.nom ?? 'Zone'}</div>
                    <div style={{ fontSize:'0.78rem', color:'#5F5E5A', marginTop:2 }}>{prochaineZone?.nb_prospectables ?? '—'} adresses · {prochaineSession.heure_debut}–{prochaineSession.heure_fin}</div>
                  </div>
                  <Link href={`/terrain?zone_id=${prochaineSession.zone_id}`} style={{ padding:'8px 14px', borderRadius:8, background:'#1D9E75', color:'#fff', fontWeight:600, fontSize:'0.8rem', textDecoration:'none', flexShrink:0 }}>Démarrer →</Link>
                </div>
              )}
            </div>

            {/* Mes zones enrichies */}
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #f0efeb', padding:'20px 24px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <h2 style={{ margin:0, fontSize:'0.9rem', fontWeight:600, color:'#1a1a18' }}>Mes zones</h2>
                <Link href="/zones" style={{ fontSize:'0.78rem', color:'#1D9E75', textDecoration:'none' }}>Gérer →</Link>
              </div>
              {nbZones === 0 ? (
                <div style={{ textAlign:'center', padding:'24px 0', color:'#9b9b96', fontSize:'0.82rem' }}>
                  Aucune zone — <Link href="/zones" style={{ color:'#1D9E75' }}>générer maintenant</Link>
                </div>
              ) : (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'8px 70px 1fr 48px 52px 52px', gap:'0 10px', marginBottom:6, paddingBottom:4, borderBottom:'1px solid #f0efeb' }}>
                    <div/><div/>
                    <div style={{ fontSize:'0.65rem', color:'#9b9b96', fontWeight:600 }}>ADRESSES VISITÉES</div>
                    <div style={{ fontSize:'0.65rem', color:'#9b9b96', fontWeight:600, textAlign:'right' }}>%</div>
                    <div style={{ fontSize:'0.65rem', color:'#9b9b96', fontWeight:600, textAlign:'right' }}>CONTACTS</div>
                    <div style={{ fontSize:'0.65rem', color:'#9b9b96', fontWeight:600, textAlign:'right' }}>TOTAL</div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                    {(zones ?? []).slice(0, 10).map((z: any) => {
                      const stats    = statsByZone.get(z.id)
                      const visited  = stats?.visitees ?? 0
                      const total    = z.nb_prospectables ?? 0
                      const pct      = total > 0 ? Math.round(visited / total * 100) : 0
                      const contacts = stats?.contacts ?? 0
                      const barColor = pct >= 80 ? '#1D9E75' : pct >= 40 ? '#f59e0b' : '#e5e7eb'
                      return (
                        <div key={z.id} style={{ display:'grid', gridTemplateColumns:'8px 70px 1fr 48px 52px 52px', gap:'0 10px', alignItems:'center' }}>
                          <div style={{ width:8, height:8, borderRadius:'50%', background:z.couleur }}/>
                          <div style={{ fontSize:'0.78rem', color:'#1a1a18', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{z.nom}</div>
                          <div style={{ height:5, background:'#f0efeb', borderRadius:3, overflow:'hidden' }}>
                            <div style={{ width:`${Math.min(pct,100)}%`, height:'100%', background:barColor, borderRadius:3, transition:'width 0.3s' }}/>
                          </div>
                          <div style={{ fontSize:'0.72rem', fontWeight:600, color:pct>=80?'#065f46':pct>=40?'#92400e':'#9b9b96', textAlign:'right' }}>{visited > 0 ? `${pct}%` : '—'}</div>
                          <div style={{ fontSize:'0.72rem', color:contacts>0?'#FF9800':'#9b9b96', fontWeight:contacts>0?600:400, textAlign:'right' }}>{contacts > 0 ? contacts : '—'}</div>
                          <div style={{ fontSize:'0.72rem', color:'#9b9b96', textAlign:'right' }}>{total}</div>
                        </div>
                      )
                    })}
                  </div>
                  {nbZones > 10 && <div style={{ fontSize:'0.75rem', color:'#9b9b96', marginTop:8 }}>+{nbZones - 10} zones · <Link href="/zones" style={{ color:'#1D9E75' }}>voir tout</Link></div>}
                </>
              )}
            </div>
          </div>

          {/* Colonne droite */}
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #f0efeb', padding:'20px 24px' }}>
              <h2 style={{ margin:'0 0 14px', fontSize:'0.9rem', fontWeight:600, color:'#1a1a18' }}>Mon secteur</h2>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {communes.map((c: any) => (
                  <div key={c.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:'0.82rem' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                      <div style={{ width:7, height:7, borderRadius:'50%', background:c.chargee_at?'#1D9E75':'#f59e0b', flexShrink:0 }}/>
                      <span style={{ color:'#1a1a18' }}>{c.nom}</span>
                    </div>
                    <span style={{ color:'#9b9b96', fontSize:'0.72rem' }}>{c.chargee_at ? 'BAN chargé' : 'En cours…'}</span>
                  </div>
                ))}
              </div>
              <Link href="/onboarding" style={{ display:'block', marginTop:12, fontSize:'0.75rem', color:'#1D9E75', textDecoration:'none' }}>Gérer le secteur →</Link>
            </div>
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #f0efeb', padding:'20px 24px' }}>
              <h2 style={{ margin:'0 0 14px', fontSize:'0.9rem', fontWeight:600, color:'#1a1a18' }}>Actions rapides</h2>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {([
                  { href:'/terrain',    label:'Démarrer une tournée', icon:'🚶', active:nbZones > 0 },
                  { href:'/planning',   label:'Planning',             icon:'📅', active:true },
                  { href:'/contacts',   label:'Contacts',             icon:'🤝', active:true },
                  { href:'/courriers',  label:'Courriers DPE',        icon:'✉️', active:true },
                  { href:'/zones',      label:'Zones',                icon:'🗺️', active:true },
                  { href:'/onboarding', label:'Secteur',              icon:'🏘️', active:true },
                  ...(isManager ? [{ href:'/admin/users', label:'Équipe', icon:'👥', active:true }] : []),
                ] as { href:string; label:string; icon:string; active:boolean }[]).map((action) => (
                  action.active ? (
                    <Link key={action.href} href={action.href} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:8, background:'#f8f7f4', textDecoration:'none', fontSize:'0.82rem', color:'#1a1a18' }}>
                      <span style={{ fontSize:'14px' }}>{action.icon}</span>{action.label}
                      <span style={{ marginLeft:'auto', color:'#9b9b96' }}>→</span>
                    </Link>
                  ) : (
                    <div key={action.href} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:8, background:'#fafaf8', fontSize:'0.82rem', color:'#c9c8c2', cursor:'not-allowed' }}>
                      <span style={{ fontSize:'14px', opacity:0.4 }}>{action.icon}</span>{action.label}
                      <span style={{ marginLeft:'auto', fontSize:'0.68rem', color:'#d1d0c8' }}>bientôt</span>
                    </div>
                  )
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      <div style={{ maxWidth:1100, margin:'0 auto', padding:'0 28px 20px' }}>
        {sessionsHistorique && sessionsHistorique.length > 0 && (
          <div style={{ background:'#fff', borderRadius:12, border:'1px solid #f0efeb', padding:'20px 24px' }}>
            <h2 style={{ margin:'0 0 16px', fontSize:'0.9rem', fontWeight:600, color:'#1a1a18' }}>Historique des sessions</h2>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {(sessionsHistorique as any[]).map((s) => {
                const z = s.zones_prospection
                const rapport = s.rapport_json ?? {}
                const dateFr = s.date_session
                  ? new Date(s.date_session + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' })
                  : '—'
                const nbVisites  = rapport.nb_visites  ?? s.nb_portes ?? 0
                const nbContacts = rapport.nb_contacts ?? s.nb_contacts_saisis ?? 0
                const nbFlyers   = rapport.nb_flyers   ?? s.nb_boites ?? 0
                const nbQualifs  = rapport.nb_qualifications ?? s.nb_qualifications ?? 0
                const contacts   = rapport.contacts ?? []
                return (
                  <details key={s.id} style={{ borderRadius:8, border:'1px solid #f0efeb', overflow:'hidden' }}>
                    <summary style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', cursor:'pointer', listStyle:'none', background:'#fafaf8' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:7, flex:1, minWidth:0 }}>
                        {z && <div style={{ width:8, height:8, borderRadius:'50%', background:z.couleur, flexShrink:0 }}/>}
                        <span style={{ fontWeight:600, fontSize:'0.82rem', color:'#1a1a18' }}>{dateFr}</span>
                        <span style={{ fontSize:'0.78rem', color:'#6b7280' }}>{z?.nom ?? '—'}</span>
                      </div>
                      <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                        {nbVisites > 0 && <span style={{ fontSize:'0.72rem', fontWeight:600, padding:'1px 6px', borderRadius:10, background:'#f0fdf4', color:'#065f46' }}>🚶 {nbVisites}</span>}
                        {nbContacts > 0 && <span style={{ fontSize:'0.72rem', fontWeight:600, padding:'1px 6px', borderRadius:10, background:'#fff7ed', color:'#ea580c' }}>🤝 {nbContacts}</span>}
                        {nbFlyers > 0 && <span style={{ fontSize:'0.72rem', fontWeight:600, padding:'1px 6px', borderRadius:10, background:'#f5f3ff', color:'#7c3aed' }}>📄 {nbFlyers}</span>}
                        {nbQualifs > 0 && <span style={{ fontSize:'0.72rem', fontWeight:600, padding:'1px 6px', borderRadius:10, background:'#eff6ff', color:'#1d4ed8' }}>✓ {nbQualifs}</span>}
                      </div>
                      <span style={{ fontSize:'0.72rem', color:'#9b9b96', marginLeft:8 }}>▼</span>
                    </summary>
                    <div style={{ padding:'12px 14px', borderTop:'1px solid #f0efeb', background:'#fff' }}>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:12 }}>
                        {[
                          { label:'Visites',      value:nbVisites,  color:'#1D9E75', bg:'#f0fdf4' },
                          { label:'Contacts',     value:nbContacts, color:'#ea580c', bg:'#fff7ed' },
                          { label:'Flyers',       value:nbFlyers,   color:'#7c3aed', bg:'#f5f3ff' },
                          { label:'Qualifiées',   value:nbQualifs,  color:'#1d4ed8', bg:'#eff6ff' },
                        ].map(k => (
                          <div key={k.label} style={{ background:k.bg, borderRadius:8, padding:'8px 10px', textAlign:'center' }}>
                            <div style={{ fontSize:'1.1rem', fontWeight:700, color:k.color }}>{k.value || '—'}</div>
                            <div style={{ fontSize:'0.65rem', color:'#9b9b96' }}>{k.label}</div>
                          </div>
                        ))}
                      </div>
                      {rapport.nb_maisons > 0 || rapport.nb_immeubles > 0 ? (
                        <div style={{ fontSize:'0.75rem', color:'#6b7280', marginBottom:contacts.length ? 10 : 0 }}>
                          {rapport.nb_maisons > 0 && <span style={{ marginRight:12 }}>🏠 {rapport.nb_maisons} maison{rapport.nb_maisons>1?'s':''}</span>}
                          {rapport.nb_immeubles > 0 && <span>🏢 {rapport.nb_immeubles} immeuble{rapport.nb_immeubles>1?'s':''}</span>}
                        </div>
                      ) : null}
                      {contacts.length > 0 && (
                        <div>
                          <div style={{ fontSize:'0.7rem', fontWeight:700, color:'#9b9b96', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.04em' }}>Contacts ({contacts.length})</div>
                          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                            {contacts.map((c: any) => (
                              <div key={c.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 8px', borderRadius:6, background:'#f8f7f4' }}>
                                <div style={{ width:24, height:24, borderRadius:'50%', background:'#1D9E75', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                                  <span style={{ fontSize:'0.65rem', color:'#fff', fontWeight:700 }}>{(c.prenom?.[0] ?? c.nom?.[0] ?? '?').toUpperCase()}</span>
                                </div>
                                <span style={{ fontSize:'0.78rem', fontWeight:600, color:'#1a1a18' }}>{[c.prenom, c.nom].filter(Boolean).join(' ') || 'Contact'}</span>
                                {c.tel1 && <span style={{ fontSize:'0.72rem', color:'#9b9b96' }}>{c.tel1}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div style={{ maxWidth:900, margin:'0 auto', padding:'0 16px 32px' }}>
        <DpeAlertsWidget />
      </div>
    </div>
  )
}
