import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import EquipeMap, { type EquipeMembre } from '@/components/map/EquipeMap'

export default async function ManagerCartePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: equipe } = await supabase
    .from('commerciaux')
    .select('id, nom, prenom')
    .eq('manager_id', user.id)
    .order('nom')

  const teamIds = (equipe ?? []).map(c => c.id)

  const { data: zones } = teamIds.length > 0
    ? await supabase
        .from('zones_prospection')
        .select('id, commercial_id, nom, numero, polygone_geojson, centroide_geojson, nb_adresses')
        .in('commercial_id', teamIds)
        .eq('statut', 'active')
    : { data: [] }

  // Regrouper les zones par commercial
  const membres: EquipeMembre[] = (equipe ?? []).map(c => ({
    id:     c.id,
    nom:    c.nom,
    prenom: c.prenom,
    zones:  (zones ?? []).filter(z => z.commercial_id === c.id),
  })).filter(m => m.zones.length > 0)

  const nbZones = zones?.length ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', color: '#F0F0F2' }}>
      <div style={{ padding: '20px 28px 12px', flexShrink: 0 }}>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>Carte équipe</h1>
        <p style={{ color: '#6B6B7B', marginTop: 3, fontSize: '0.84rem' }}>
          {membres.length} commercial{membres.length > 1 ? 'aux' : ''} · {nbZones} zone{nbZones > 1 ? 's' : ''} active{nbZones > 1 ? 's' : ''}
        </p>
      </div>

      {membres.length === 0 ? (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#4A4A58', fontSize: '0.9rem',
        }}>
          Aucune zone active dans votre équipe.
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0 }}>
          <EquipeMap equipe={membres} />
        </div>
      )}
    </div>
  )
}
