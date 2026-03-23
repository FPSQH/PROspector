import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type Params = { params: { id: string } }

// POST /api/zones/[id]/restaurer
// Body : { version: number }
// Restaure le polygone et le nom d'une version précédente
export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const version: number = body.version

  if (!version) return NextResponse.json({ error: 'version requis' }, { status: 400 })

  // Récupérer la version demandée
  const { data: hist, error: errHist } = await supabase
    .from('zones_historique')
    .select('nom, polygone, nb_adresses')
    .eq('zone_id', params.id)
    .eq('version', version)
    .single()

  if (errHist || !hist) return NextResponse.json({ error: 'Version non trouvée' }, { status: 404 })

  // Sauvegarder l'état actuel avant restauration
  await supabase.rpc('save_zone_version', {
    p_zone_id:     params.id,
    p_type_modif:  'restauration',
    p_modifie_par: user.id,
  })

  // Appliquer la version choisie
  const { error: errUpdate } = await supabase
    .from('zones_prospection')
    .update({
      nom:         hist.nom,
      polygone:    hist.polygone,
      nb_adresses: hist.nb_adresses,
    })
    .eq('id', params.id)

  if (errUpdate) return NextResponse.json({ error: errUpdate.message }, { status: 500 })

  return NextResponse.json({ ok: true, version_restauree: version })
}
