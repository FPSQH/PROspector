import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Formate une date JS en format iCal : YYYYMMDDTHHMMSS
function toIcalDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

// Échappe les caractères spéciaux iCal
function icalEscape(str: string): string {
  return (str ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

// Découpe les lignes longues selon la RFC 5545 (max 75 octets)
function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  let result = ''
  let pos = 0
  while (pos < line.length) {
    const chunk = line.slice(pos, pos + 73)
    result += (pos === 0 ? '' : '\r\n ') + chunk
    pos += 73
  }
  return result
}

export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Non autorisé', { status: 401 })

  const { searchParams } = new URL(request.url)
  const rdvId = searchParams.get('id')
  if (!rdvId) return new Response('id requis', { status: 400 })

  // Récupérer le RDV avec adresse et contact
  const { data: rdv } = await supabase
    .from('rendez_vous')
    .select('*, adresse:adresses(numero, nom_voie, code_postal, commune), contact:contacts(prenom)')
    .eq('id', rdvId)
    .eq('commercial_id', user.id)
    .single()

  if (!rdv) return new Response('RDV non trouvé', { status: 404 })

  const { data: commercial } = await supabase
    .from('commerciaux').select('prenom, nom, email').eq('id', user.id).single()

  // Construire les données de l'événement
  const debut = new Date(rdv.date_rdv)
  const fin = new Date(debut.getTime() + (rdv.duree_minutes ?? 60) * 60 * 1000)

  const adresseLabel = rdv.adresse
    ? `${rdv.adresse.numero ?? ''} ${rdv.adresse.nom_voie}, ${rdv.adresse.code_postal} ${rdv.adresse.commune}`.trim()
    : rdv.lieu ?? ''

  const typeLabels: Record<string, string> = {
    estimation: 'Estimation',
    signature_mandat: 'Signature mandat',
    prospection: 'Prospection',
    autre: 'RDV',
  }

  const sujet = rdv.contact?.prenom
    ? `${typeLabels[rdv.type_rdv] ?? 'RDV'} – ${rdv.contact.prenom}${adresseLabel ? ' · ' + adresseLabel : ''}`
    : `${typeLabels[rdv.type_rdv] ?? 'RDV'}${adresseLabel ? ' – ' + adresseLabel : ''}`

  // Générer le fichier ICS (RFC 5545)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PROspector//Square Habitat//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    foldLine(`UID:${rdv.ics_uid}`),
    `DTSTAMP:${toIcalDate(new Date())}`,
    `DTSTART:${toIcalDate(debut)}`,
    `DTEND:${toIcalDate(fin)}`,
    foldLine(`SUMMARY:${icalEscape(sujet)}`),
    adresseLabel ? foldLine(`LOCATION:${icalEscape(adresseLabel)}`) : '',
    rdv.notes ? foldLine(`DESCRIPTION:${icalEscape(rdv.notes)}`) : '',
    commercial ? foldLine(`ORGANIZER;CN="${icalEscape(`${commercial.prenom} ${commercial.nom}`)}":mailto:${commercial.email}`) : '',
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')

  // Marquer le RDV comme ayant généré un ICS
  await supabase.from('rendez_vous')
    .update({ ics_genere_at: new Date().toISOString() })
    .eq('id', rdvId)

  const filename = `rdv-${rdv.type_rdv}-${debut.toISOString().split('T')[0]}.ics`

  return new Response(lines, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache',
    },
  })
}

// Génération ICS pour une session de prospection
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Non autorisé', { status: 401 })

  const { session_id } = await request.json()

  const { data: session } = await supabase
    .from('sessions_prospection')
    .select('*, zone:zones_prospection(nom, nb_adresses)')
    .eq('id', session_id)
    .eq('commercial_id', user.id)
    .single()

  if (!session) return new Response('Session non trouvée', { status: 404 })

  const debut = new Date(`${session.date_session}T${session.heure_debut}:00`)
  const fin   = new Date(`${session.date_session}T${session.heure_fin}:00`)

  const sujet = `Prospection – ${session.zone?.nom ?? 'Zone'}`
  const description = session.zone
    ? `Zone : ${session.zone.nom} · ${session.zone.nb_adresses ?? '?'} adresses`
    : ''

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PROspector//Square Habitat//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:session-${session_id}@prospector`,
    `DTSTAMP:${toIcalDate(new Date())}`,
    `DTSTART:${toIcalDate(debut)}`,
    `DTEND:${toIcalDate(fin)}`,
    foldLine(`SUMMARY:${icalEscape(sujet)}`),
    description ? foldLine(`DESCRIPTION:${icalEscape(description)}`) : '',
    'STATUS:CONFIRMED',
    'TRANSP:TRANSPARENT',  // Non bloquant dans Outlook
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')

  const filename = `prospection-${session.zone?.nom?.replace(/\s+/g, '-').toLowerCase() ?? 'zone'}-${session.date_session}.ics`

  return new Response(lines, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache',
    },
  })
}
