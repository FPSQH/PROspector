import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: commercial } = await supabase
    .from('commerciaux')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!commercial) redirect('/login')

  const { data: communes } = await supabase
    .from('communes')
    .select('id, nom, code_insee, chargee_at')
    .eq('commercial_id', commercial.id)

  if (!communes || communes.length === 0) redirect('/onboarding')

  const communesInsee = communes.map((c: any) => c.code_insee)

  const { count: nbAdresses } = await supabase
    .from('adresses')
    .select('id', { count: 'exact', head: true })
    .in('code_insee', communesInsee.length > 0 ? communesInsee : ['__none__'])

  const { data: zones } = await supabase
    .from('zones_prospection')
    .select('id, nom, numero, couleur, nb_prospectables, nb_adresses, capacite_theorique, statut')
    .eq('commercial_id', commercial.id)
    .order('numero')

  const nbZones = zones?.length ?? 0
  const totalAdressesZones = (zones ?? []).reduce((s: number, z: any) => s + (z.nb_prospectables ?? 0), 0)

  const now = new Date()
  const jourSemaine = now.getDay()
  const joursProspection = [2, 3, 5]
  const prochainJour = joursProspection.find((j) => j > jourSemaine) ?? joursProspection[0]
  const joursRestants = prochainJour > jourSemaine
    ? prochainJour - jourSemaine
    : 7 - jourSemaine + prochainJour
  const nomJours = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi']

  const zoneRecommandee = zones?.[0] ?? null
  const etape = nbZones === 0 ? 'setup_zones' : 'pret'
  const isManager = commercial.role === 'manager'

  return (
    <div style={{ minHeight: '100dvh', background: '#f8f7f4' }}>

      {/* ── Header ── */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #e8e7e0',
        padding: '0 28px', height: 52,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }} className="dash-header">
        <div>
          <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#1a1a18' }}>
            Bonjour {commercial?.prenom} 👋
          </span>
          <span style={{ marginLeft: 12, fontSize: '0.8rem', color: '#9b9b96' }} className="dash-header-date">
            {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
        </div>
        <form action="/auth/signout" method="post">
          <button style={{
            padding: '5px 12px', borderRadius: 7,
            border: '1px solid #e8e7e0', background: 'transparent',
            fontSize: '0.78rem', color: '#9b9b96', cursor: 'pointer',
          }}>
            Déconnexion
          </button>
        </form>
      </div>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 28px' }} className="dash-main">

        {/* ── Bannière manager ── */}
        {isManager && (
          <div style={{
            background: '#fff', border: '1.5px solid #d1fae5',
            borderRadius: 12, padding: '16px 20px',
            display: 'flex',
