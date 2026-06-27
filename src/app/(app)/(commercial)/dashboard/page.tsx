import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import PeriodeSelector    from './PeriodeSelector'
import DpePeriodeSelector from './DpePeriodeSelector'
import { CollapsibleSection } from '@/components/dashboard/CollapsibleSection'

// ── Design tokens ─────────────────────────────────────────────────────────
const C = {
  bg:        '#0C0C0E',
  card:      '#141416',
  border:    'rgba(255,255,255,0.06)',
  borderL:   'rgba(255,255,255,0.10)',
  borderSub: 'rgba(255,255,255,0.03)',
  text:      '#F0F0F2',
  mid:       '#9A9AA8',
  muted:     '#6B6B7B',
  dim:       '#4A4A58',
  gold:      '#D97706',
  goldLight: '#F59E0B',
  success:   '#22C55E',
  danger:    '#EF4444',
  info:      '#3B82F6',
  purple:    '#8B5CF6',
  orange:    '#F97316',
  teal:      '#14B8A6',
}

const ZONE_COLORS = [
  '#22C55E','#3B82F6','#F59E0B','#EF4444','#8B5CF6',
  '#EC4899','#14B8A6','#F97316','#6366F1','#0EA5E9',
  '#84CC16','#A855F7',
]

const DPE_LETTERS = ['A','B','C','D','E','F','G'] as const
const DPE_COLORS: Record<string, string> = {
  A: '#059669', B: '#22C55E', C: '#84CC16',
  D: '#EAB308', E: '#F97316', F: '#EF4444', G: '#DC2626',
}

const FONT = "var(--font-outfit, 'Outfit'), -apple-system, sans-serif"

// ── Sub-components ────────────────────────────────────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null
  const max = Math.max(...data, 1)
  const W = 100; const H = 36
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * W,
    y: H - 4 - ((v / max) * (H - 14)),
  }))
  const line = pts.map(p => `${p.x},${p.y}`).join(' ')
  const area = line + ` ${W},${H} 0,${H}`
  const gid  = `g${color.replace('#', '')}`
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`}/>
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  )
}

function TrendBadge({ trend }: { trend: string }) {
  const up  = trend.startsWith('+')
  const col = up ? C.success : C.danger
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '2px 7px', borderRadius: 12,
      background: col + '12', border: `1px solid ${col}20`,
      fontSize: 10, fontWeight: 600, color: col,
    }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d={up ? 'M1.5 7.5L4 4.5L6 6.5L8.5 2.5' : 'M1.5 2.5L4 5.5L6 3.5L8.5 7.5'}
          stroke={col} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      {trend}
    </span>
  )
}

function KpiCard({ label, value, sub, trend, color, variant = 'default', sparkData }: {
  label: string; value: string; sub?: string; trend?: string
  color: string; variant?: 'hero' | 'accent' | 'default'; sparkData?: number[]
}) {
  const isHero   = variant === 'hero'
  const isAccent = variant === 'accent'
  return (
    <div style={{
      background: isHero ? `linear-gradient(135deg, ${C.card}, rgba(217,119,6,0.06))` : C.card,
      border: `1px solid ${isHero ? 'rgba(217,119,6,0.2)' : C.border}`,
      borderTop: isAccent ? `2px solid ${color}` : isHero ? '2px solid rgba(217,119,6,0.5)' : undefined,
      borderRadius: 12, padding: 16,
      boxShadow: isHero ? '0 0 24px rgba(217,119,6,0.1),0 2px 8px rgba(0,0,0,0.3)' : '0 1px 2px rgba(0,0,0,0.3)',
      display: 'flex', flexDirection: 'column', gap: 5, fontFamily: FONT,
    }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: isHero ? 32 : 26, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</span>
        {trend && <TrendBadge trend={trend} />}
      </div>
      {sub && <span style={{ fontSize: 11, color: C.dim }}>{sub}</span>}
      {sparkData && sparkData.length >= 2 && (
        <div style={{ marginTop: 4 }}><Sparkline data={sparkData} color={color} /></div>
      )}
    </div>
  )
}

function HBar({ fill, color, h = 6, w = '100%' }: { fill: number; color: string; h?: number; w?: string | number }) {
  return (
    <div style={{ width: w, height: h, borderRadius: h, background: 'rgba(255,255,255,0.04)', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{
        width: `${Math.max(Math.min(fill * 100, 100), fill > 0 ? 2 : 0)}%`, height: '100%', borderRadius: h,
        background: `linear-gradient(90deg, ${color}cc, ${color})`,
      }} />
    </div>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, boxShadow: '0 1px 2px rgba(0,0,0,0.3)', ...style }}>
      {children}
    </div>
  )
}

function SectionTitle({ title, badge, action, actionHref, right }: {
  title: string; badge?: string; action?: string; actionHref?: string; right?: React.ReactNode
}) {
  const chevron = (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M3 1.5L7 5L3 8.5" stroke={C.gold} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text, letterSpacing: '-0.01em' }}>{title}</span>
        {badge && (
          <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, fontSize: 10, fontWeight: 500, color: C.dim }}>
            {badge}
          </span>
        )}
      </div>
      {right ?? (action && (
        actionHref
          ? <Link href={actionHref} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, color: C.gold, fontWeight: 600 }}>{action}</span>{chevron}
            </Link>
          : <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, color: C.gold, fontWeight: 600 }}>{action}</span>{chevron}
            </div>
      ))}
    </div>
  )
}

function WeeklyHistogram({ weeks }: { weeks: { label: string; sessions: number; portes: number; flyers: number }[] }) {
  const maxP = Math.max(...weeks.map(w => w.portes), ...weeks.map(w => w.contacts ?? 0), 1)
  const maxS = Math.max(...weeks.map(w => w.sessions), 1)
  return (
    <div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
        {([['Sessions', C.gold], ['Portes frappées', C.info], ['Contacts', C.success], ['Flyers déposés', C.purple]] as [string,string][]).map(([lbl, col]) => (
          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: col, opacity: 0.85 }} />
            <span style={{ fontSize: 10, color: C.dim, fontWeight: 500 }}>{lbl}</span>
          </div>
        ))}
      </div>
      <div style={{ position: 'relative', height: 100, marginBottom: 4 }}>
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
          {[0, 0.33, 0.66, 1].map((p, i) => (
            <line key={i} x1="0" y1={`${p * 100}%`} x2="100%" y2={`${p * 100}%`} stroke={C.border} strokeWidth="0.5"/>
          ))}
        </svg>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', height: '100%', position: 'relative', zIndex: 1, padding: '0 4px' }}>
          {weeks.map((w, wi) => (
            <div key={wi} style={{ flex: 1, display: 'flex', gap: 2, alignItems: 'flex-end', height: '100%' }}>
              {[
                { val: w.sessions,  max: maxS, color: C.gold },
                { val: w.portes,    max: maxP, color: C.info },
                { val: w.contacts,  max: maxP, color: C.success },
                { val: w.flyers,    max: maxP, color: C.purple },
              ].map((bar, bi) => (
                <div key={bi} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                  <span style={{ fontSize: 8, color: C.dim, fontWeight: 600, marginBottom: 2 }}>{bar.val}</span>
                  <div style={{
                    width: '100%', maxWidth: 18,
                    height: bar.val === 0 ? 3 : `${Math.max((bar.val / bar.max) * 78, 4)}%`,
                    borderRadius: '3px 3px 1px 1px',
                    background: `linear-gradient(180deg, ${bar.color}, ${bar.color}99)`,
                    opacity: bar.val === 0 ? 0.15 : 1,
                  }} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, padding: '0 4px' }}>
        {weeks.map((w, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center' }}>
            <span style={{ fontSize: 10, color: C.muted, fontWeight: 500 }}>{w.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ConversionFunnel({ steps }: { steps: { label: string; value: number; color: string }[] }) {
  const maxVal = Math.max(steps[0]?.value ?? 1, 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {steps.map((step, i) => {
        const widthPct = Math.max((step.value / maxVal) * 100, 14)
        const prevPct  = i > 0 && steps[i - 1].value > 0
          ? Math.round((step.value / steps[i - 1].value) * 100) : null
        return (
          <div key={i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: C.muted, fontWeight: 500, width: 80, textAlign: 'right', flexShrink: 0 }}>
                {step.label}
              </span>
              <div style={{ flex: 1, position: 'relative', height: 28 }}>
                <div style={{
                  width: `${widthPct}%`, height: '100%',
                  background: `linear-gradient(90deg, ${step.color}20, ${step.color}10)`,
                  border: `1px solid ${step.color}30`, borderRadius: 6,
                  display: 'flex', alignItems: 'center', paddingLeft: 10,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: step.color }}>{step.value}</span>
                </div>
              </div>
              <div style={{ width: 36, flexShrink: 0, textAlign: 'right' }}>
                {prevPct !== null && <span style={{ fontSize: 10, color: C.dim, fontWeight: 500 }}>{prevPct}%</span>}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ marginLeft: 90, height: 4 }}>
                <div style={{ width: 1, height: 4, background: C.border, marginLeft: 8 }} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function DPEHistogram({ distribution }: { distribution: { letter: string; count: number; color: string }[] }) {
  const maxCount = Math.max(...distribution.map(d => d.count), 1)
  return (
    <div>
      <div style={{ position: 'relative', height: 90 }}>
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
          {[0, 0.33, 0.66, 1].map((p, i) => (
            <line key={i} x1="0" y1={`${p * 100}%`} x2="100%" y2={`${p * 100}%`} stroke={C.border} strokeWidth="0.5"/>
          ))}
        </svg>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: '100%', position: 'relative', zIndex: 1 }}>
          {distribution.map((d, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              <span style={{ fontSize: 9, color: C.dim, fontWeight: 600, marginBottom: 2 }}>{d.count}</span>
              <div style={{
                width: '100%', maxWidth: 30,
                height: d.count === 0 ? 3 : `${(d.count / maxCount) * 78}%`, minHeight: 4,
                borderRadius: '4px 4px 1px 1px',
                background: `linear-gradient(180deg, ${d.color}, ${d.color}88)`,
                opacity: d.count === 0 ? 0.15 : 1,
              }} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        {distribution.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', background: d.color + '15', borderRadius: 4, padding: '3px 0', border: `1px solid ${d.color}20` }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: d.color }}>{d.letter}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── DPE detail row : label + maison/appart/total inline ────────────────────
function DpeDetailRow({ label, maison, appart, total, color }: {
  label: string; maison: number; appart: number; total: number; color: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: color + '08', border: `1px solid ${color}15` }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 11, color, fontWeight: 500, flex: 1, minWidth: 0 }}>{label}</span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: C.muted }}>
          🏠 <span style={{ fontWeight: 600, color }}>{maison}</span>
        </span>
        <span style={{ fontSize: 10, color: C.dim }}>·</span>
        <span style={{ fontSize: 10, color: C.muted }}>
          🏢 <span style={{ fontWeight: 600, color }}>{appart}</span>
        </span>
        <span style={{ fontSize: 10, color: C.dim }}>·</span>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{total}</span>
      </div>
    </div>
  )
}

function ZoneStackedBar({ visited, remaining, excluded, total }: {
  visited: number; remaining: number; excluded: number; total: number
}) {
  const t = Math.max(total, 1)
  return (
    <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'rgba(255,255,255,0.03)' }}>
      {visited   > 0 && <div style={{ width: `${(visited   / t) * 100}%`, background: `linear-gradient(90deg, ${C.success}cc, ${C.success})` }} />}
      {remaining > 0 && <div style={{ width: `${(remaining / t) * 100}%`, background: C.info + '35' }} />}
      {excluded  > 0 && <div style={{ width: `${(excluded  / t) * 100}%`, background: 'rgba(255,255,255,0.06)' }} />}
    </div>
  )
}

function MiniKPI({ label, value, color, sub, href }: { label: string; value: string; color: string; sub?: string; href?: string }) {
  const inner = (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', textAlign: 'center', ...(href ? { cursor: 'pointer', transition: 'border-color 0.15s' } : {}) }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 700, color, marginTop: 5, display: 'block' }}>{value}</span>
      {sub && <span style={{ fontSize: 9, color: C.dim, display: 'block', marginTop: 2 }}>{sub}</span>}
    </div>
  )
  return href ? <Link href={href} style={{ textDecoration: 'none' }}>{inner}</Link> : inner
}

function RatioTile({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', borderLeft: `3px solid ${color}` }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 700, color, marginTop: 5, display: 'block' }}>{value}</span>
      {sub && <span style={{ fontSize: 10, color: C.dim, display: 'block', marginTop: 2 }}>{sub}</span>}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────
function getWeek(d: string): number {
  return Math.min(Math.ceil(parseInt(d.split('-')[2] ?? '1', 10) / 7), 4)
}
function fmtPct(n: number, d: number): string {
  if (d === 0) return '0 %'
  return (n / d * 100).toFixed(2) + ' %'
}
function trendPct(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? `+${current}` : '='
  const pct = Math.round(((current - previous) / previous) * 100)
  return (pct >= 0 ? '+' : '') + pct + '%'
}

// ── Main page ─────────────────────────────────────────────────────────────
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { periode?: string; dpe_periode?: string }
}) {
  const supabase = await createClient()
  const adminDb  = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: commercial } = await supabase
    .from('commerciaux').select('*').eq('id', user.id).single()
  if (!commercial) redirect('/login')

  const { data: communes } = await supabase
    .from('communes').select('id, nom, code_insee, chargee_at')
    .eq('commercial_id', commercial.id)
  if (!communes || communes.length === 0) redirect('/onboarding')

  const communesInsee = communes.map((c: any) => String(c.code_insee))
  const uid = user.id

  // ── Sélecteur période CRM ──────────────────────────────────────────────
  const PERIODES_VALIDES = ['mois', 'annee', 'tout']
  const periode = PERIODES_VALIDES.includes(searchParams.periode ?? '')
    ? (searchParams.periode as string) : 'mois'

  // ── Sélecteur période DPE ──────────────────────────────────────────────
  const DPE_PERIODES_VALIDES = ['mois', '2mois', 'annee', 'tout']
  const dpePeriode = DPE_PERIODES_VALIDES.includes(searchParams.dpe_periode ?? '')
    ? (searchParams.dpe_periode as string) : 'tout'

  // ── Dates ──────────────────────────────────────────────────────────────
  const now        = new Date()
  const month      = now.getMonth()
  const year       = now.getFullYear()
  const monthStart = new Date(year, month, 1).toISOString().split('T')[0]
  const monthEnd   = new Date(year, month + 1, 0).toISOString().split('T')[0]
  const yearStart  = `${year}-01-01`
  const todayStr   = now.toISOString().split('T')[0]
  const sunDate    = new Date(now)
  sunDate.setDate(now.getDate() + (now.getDay() === 0 ? 0 : 7 - now.getDay()))
  const sundayStr  = sunDate.toISOString().split('T')[0]

  // Mois précédent (pour tendances)
  const lastMonthStart = new Date(year, month - 1, 1).toISOString().split('T')[0]
  const lastMonthEnd   = new Date(year, month, 0).toISOString().split('T')[0]

  // Date -2 semaines pour le KPI "DPE récents"
  const twoWeeksAgo = new Date(now)
  twoWeeksAgo.setDate(now.getDate() - 14)
  const twoWeeksAgoStr = twoWeeksAgo.toISOString().split('T')[0]

  // Date filtre pour dpe_periode
  const twoMonthsAgo = new Date(now)
  twoMonthsAgo.setMonth(now.getMonth() - 2)
  const twoMonthsAgoStr = twoMonthsAgo.toISOString().split('T')[0]

  const dpeDateDebut: string | null =
    dpePeriode === 'mois'  ? monthStart :
    dpePeriode === '2mois' ? twoMonthsAgoStr :
    dpePeriode === 'annee' ? yearStart : null

  // Labels
  const monthLabel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const monthBadge = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)

  const dpePeriodeLabel =
    dpePeriode === 'mois'  ? monthBadge :
    dpePeriode === '2mois' ? 'Moins de 2 mois' :
    dpePeriode === 'annee' ? String(year) :
    'Depuis toujours'

  const crmDateDebut: string | null =
    periode === 'mois'  ? monthStart :
    periode === 'annee' ? yearStart  : null

  const periodeLabel =
    periode === 'mois'  ? monthBadge :
    periode === 'annee' ? String(year) :
    'Depuis toujours'

  // ══════════════════════════════════════════════════════════════════════════
  // DONNÉES STRUCTURELLES
  // ══════════════════════════════════════════════════════════════════════════

  let contactsQuery = supabase
    .from('contacts')
    .select('id, statut_pipeline, date_relance, created_at')
    .eq('commercial_id', uid)
  if (crmDateDebut) contactsQuery = contactsQuery.gte('created_at', crmDateDebut)
  if (periode === 'mois') contactsQuery = contactsQuery.lte('created_at', monthEnd + 'T23:59:59')

  const [
    zonesRes,
    sessionsMonthRes,
    planningMonthRes,
    contactsRes,
    allZonedSessionsRes,
    upcomingRes,
    sessionEnCoursRes,
    nbAdressesRes,
    // ── Tendances mois précédent ──
    lastMonthSessionsRes,
    // ── Contacts avec zone_id pour répartition ──
    contactsZoneRes,
  ] = await Promise.all([
    supabase.from('zones_prospection')
      .select('id, nom, numero, couleur, nb_prospectables, nb_adresses, nb_logements_sociaux, statut')
      .eq('commercial_id', uid).order('numero'),

    supabase.from('sessions_prospection')
      .select('id, date_session, zone_id')
      .eq('commercial_id', uid).eq('statut', 'realisee')
      .gte('date_session', monthStart).lte('date_session', monthEnd),

    supabase.from('planning_sessions')
      .select('id')
      .eq('commercial_id', uid)
      .gte('date_prevue', monthStart).lte('date_prevue', monthEnd),

    contactsQuery,

    supabase.from('sessions_prospection')
      .select('id, zone_id, date_session')
      .eq('commercial_id', uid).eq('statut', 'realisee')
      .not('zone_id', 'is', null)
      .order('date_session', { ascending: false }).limit(500),

    supabase.from('planning_sessions')
      .select('zone_id, date_prevue')
      .eq('commercial_id', uid).eq('statut', 'planifiee')
      .gte('date_prevue', todayStr)
      .order('date_prevue', { ascending: true }),

    supabase.from('sessions_prospection')
      .select('id, zone_id, date_session, heure_debut, zones_prospection:zone_id(nom, couleur, numero)')
      .eq('commercial_id', uid).eq('statut', 'en_cours')
      .order('created_at', { ascending: false }).limit(1),

    supabase.from('adresses')
      .select('id', { count: 'exact', head: true })
      .in('code_insee', communesInsee.length > 0 ? communesInsee : ['__none__']),

    // Sessions du mois précédent (pour tendances)
    supabase.from('sessions_prospection')
      .select('id')
      .eq('commercial_id', uid).eq('statut', 'realisee')
      .gte('date_session', lastMonthStart).lte('date_session', lastMonthEnd),

    // Contacts avec leur zone (pour répartition par zone)
    supabase.from('contacts')
      .select('id, adresse_id, adresses(zone_id)')
      .eq('commercial_id', uid)
      .neq('statut_pipeline', 'perdu'),
  ])

  const zones            = zonesRes.data ?? []
  const sessionsMonth    = sessionsMonthRes.data ?? []
  const nbPlanned        = planningMonthRes.data?.length ?? 0
  const contacts         = contactsRes.data ?? []
  const allZonedSessions = allZonedSessionsRes.data ?? []
  const upcoming         = upcomingRes.data ?? []
  const sessionEC        = (sessionEnCoursRes.data ?? [])[0] ?? null
  const nbAdresses       = nbAdressesRes.count ?? 0
  const lastMonthSessions  = lastMonthSessionsRes.data ?? []
  const contactsZone       = contactsZoneRes.data ?? []

  // ══════════════════════════════════════════════════════════════════════════
  // INTERACTIONS VIA adminDb
  // ══════════════════════════════════════════════════════════════════════════

  const monthSessionIds    = sessionsMonth.map(s => s.id)
  const allZonedSessionIds = allZonedSessions.map(s => s.id)

  const { data: monthInts } = monthSessionIds.length > 0
    ? await adminDb.from('interactions')
        .select('adresse_id, session_id, resultat, action, presence')
        .in('session_id', monthSessionIds)
    : { data: [] as { adresse_id: string; session_id: string; resultat: string; action: string }[] }

  const { data: coverageInts } = allZonedSessionIds.length > 0
    ? await adminDb.from('interactions')
        .select('adresse_id, session_id')
        .in('session_id', allZonedSessionIds)
    : { data: [] as { adresse_id: string; session_id: string }[] }

  // ── Tendances : interactions du mois précédent ─────────────────────────
  const lastMonthSessionIds = lastMonthSessions.map(s => s.id)
  const lastMonthPortes = lastMonthSessionIds.length > 0
    ? ((await adminDb.from('interactions')
        .select('id', { count: 'exact', head: true })
        .in('session_id', lastMonthSessionIds)).count ?? 0)
    : 0

  // Mandats du mois précédent (pour tendance)
  const { count: lastMonthMandatsCount } = await supabase.from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('commercial_id', uid)
    .eq('statut_pipeline', 'mandat')
    .gte('created_at', lastMonthStart)
    .lte('created_at', lastMonthEnd + 'T23:59:59')

  // ══════════════════════════════════════════════════════════════════════════
  // DPE — REQUÊTES PARALLÈLES
  // ══════════════════════════════════════════════════════════════════════════

  // Helper pour appliquer le filtre période DPE sur une query
  const applyDpeFilter = (q: any) => dpeDateDebut ? q.gte('date_etablissement', dpeDateDebut) : q

  const zoneIds = zones.map(z => z.id)

  // ── Toutes requêtes DPE en parallèle ──────────────────────────────────
  const [
    // 1. DPE récents < 2 semaines (JAMAIS filtré par dpe_periode)
    dpeRecentsRes,

    // 2-8. Histogramme A→G (filtré par dpe_periode)
    ...dpeLetterResults
  ] = await Promise.all([
    // DPE récents — filtre fixe 14 jours
    (() => {
      const q = supabase.from('dpe_logement')
        .select('id', { count: 'exact', head: true })
        .in('code_insee', communesInsee.length > 0 ? communesInsee : ['__none__'])
        .gte('date_etablissement', twoWeeksAgoStr)
      return communesInsee.length > 0 ? q : Promise.resolve({ count: 0 })
    })(),

    // 7 lettres A→G avec filtre dpe_periode
    ...DPE_LETTERS.map(letter => {
      const q = supabase.from('dpe_logement')
        .select('id', { count: 'exact', head: true })
        .in('code_insee', communesInsee.length > 0 ? communesInsee : ['__none__'])
        .eq('etiquette_dpe', letter)
      return communesInsee.length > 0 ? applyDpeFilter(q) : Promise.resolve({ count: 0 })
    }),
  ])

  const dpeRecents = (dpeRecentsRes as any)?.count ?? 0

  const dpeDistrib = DPE_LETTERS.map((letter, i) => ({
    letter,
    count: (dpeLetterResults[i] as any)?.count ?? 0,
    color: DPE_COLORS[letter]!,
  }))
  const dpeTotal = dpeDistrib.reduce((s, d) => s + d.count, 0)
  const dpePct   = nbAdresses > 0 ? (dpeTotal / nbAdresses * 100).toFixed(1) : '0.0'

  // ── DPE par type (maison / appartement) — pour "identifiés sur le secteur" ──
  const [dpeMaisonTotalRes, dpeAppartTotalRes] = await Promise.all([
    (() => {
      const q = supabase.from('dpe_logement')
        .select('id', { count: 'exact', head: true })
        .in('code_insee', communesInsee.length > 0 ? communesInsee : ['__none__'])
        .eq('type_batiment', 'maison')
      return communesInsee.length > 0 ? applyDpeFilter(q) : Promise.resolve({ count: 0 })
    })(),
    (() => {
      const q = supabase.from('dpe_logement')
        .select('id', { count: 'exact', head: true })
        .in('code_insee', communesInsee.length > 0 ? communesInsee : ['__none__'])
        .neq('type_batiment', 'maison')
        .not('type_batiment', 'is', null)
      return communesInsee.length > 0 ? applyDpeFilter(q) : Promise.resolve({ count: 0 })
    })(),
  ])
  const dpeMaisonTotal  = (dpeMaisonTotalRes as any)?.count ?? 0
  const dpeAppartTotal  = (dpeAppartTotalRes as any)?.count ?? 0

  // ── DPE zone/hors zone + adresses boîtées : deux boucles en parallèle ──
  const codesFiltres = communesInsee.length > 0 ? communesInsee : ['__none__']

  const [dpeZoneRows, dpeAdresseIdsRaw] = await Promise.all([
    (async (): Promise<{ type_batiment: string | null; zone_id: string | null }[]> => {
      const rows: { type_batiment: string | null; zone_id: string | null }[] = []
      let from = 0
      while (true) {
        let q = adminDb
          .from('dpe_logement')
          .select('type_batiment, adresses(zone_id)')
          .in('code_insee', codesFiltres)
          .not('etiquette_dpe', 'is', null)
          .range(from, from + 999)
        if (dpeDateDebut) q = (q as any).gte('date_etablissement', dpeDateDebut)
        const { data: batch } = await q
        if (!batch?.length) break
        for (const d of batch) {
          rows.push({
            type_batiment: (d as any).type_batiment ?? null,
            zone_id:       (d as any).adresses?.zone_id ?? null,
          })
        }
        if (batch.length < 1000) break
        from += 1000
      }
      return rows
    })(),
    (async (): Promise<string[]> => {
      const ids: string[] = []
      let from = 0
      while (true) {
        let q = adminDb
          .from('dpe_logement')
          .select('adresse_id')
          .in('code_insee', codesFiltres)
          .not('adresse_id', 'is', null)
          .range(from, from + 999)
        if (dpeDateDebut) q = (q as any).gte('date_etablissement', dpeDateDebut)
        const { data: batch } = await q
        if (!batch?.length) break
        ids.push(...batch.map((d: any) => d.adresse_id).filter(Boolean))
        if (batch.length < 1000) break
        from += 1000
      }
      return ids
    })(),
  ])

  const dpeAdresseIdSet = new Set(dpeAdresseIdsRaw)

  const dpeInZoneRows    = dpeZoneRows.filter(d => d.zone_id && zoneIds.includes(d.zone_id))
  const dpeHorsZoneRows  = dpeZoneRows.filter(d => !d.zone_id || !zoneIds.includes(d.zone_id))

  const dpeInZoneMaison  = dpeInZoneRows.filter(d => d.type_batiment === 'maison').length
  const dpeInZoneAppart  = dpeInZoneRows.filter(d => d.type_batiment !== 'maison' && d.type_batiment != null).length
  const dpeInZoneTotal   = dpeInZoneRows.length

  const dpeHorsZoneMaison = dpeHorsZoneRows.filter(d => d.type_batiment === 'maison').length
  const dpeHorsZoneAppart = dpeHorsZoneRows.filter(d => d.type_batiment !== 'maison' && d.type_batiment != null).length
  const dpeHorsZoneTotal  = dpeHorsZoneRows.length

  const BOITAGE_ACTIONS = ['courrier_depose', 'courrier', 'boite', 'flyer_depose']

  let dpeBoites = 0
  if (allZonedSessionIds.length > 0 && dpeAdresseIdSet.size > 0) {
    let boitageQuery = adminDb
      .from('interactions')
      .select('adresse_id')
      .in('session_id', allZonedSessionIds)
      .in('action', BOITAGE_ACTIONS)
    if (dpeDateDebut) {
      boitageQuery = boitageQuery.gte('created_at', dpeDateDebut) as any
    }
    const { data: boitageInts } = await boitageQuery.limit(5000)
    const boitedWithDpe = new Set(
      (boitageInts ?? [])
        .map((i: any) => i.adresse_id)
        .filter((id: any) => id && dpeAdresseIdSet.has(id))
    )
    dpeBoites = boitedWithDpe.size
  }

  // ══════════════════════════════════════════════════════════════════════════
  // KPIs TERRAIN — ce mois
  // ══════════════════════════════════════════════════════════════════════════

  const allMonthInts   = monthInts ?? []
  const nbPortes       = allMonthInts.length
  const nbContactsPresence = allMonthInts.filter(i => i.presence === true).length

  const monthAdresseIds = [...new Set(allMonthInts.map(i => i.adresse_id).filter(Boolean))]
  let nbContactsCRM = 0
  if (monthAdresseIds.length > 0) {
    const batches = []
    for (let i = 0; i < monthAdresseIds.length; i += 200) {
      batches.push(monthAdresseIds.slice(i, i + 200))
    }
    const counts = await Promise.all(
      batches.map(batch =>
        adminDb.from('contacts')
          .select('id', { count: 'exact', head: true })
          .in('adresse_id', batch)
          .eq('commercial_id', uid)
      )
    )
    nbContactsCRM = counts.reduce((s, r) => s + ((r as any).count ?? 0), 0)
  }

  const nbContactsSess = Math.max(nbContactsPresence, nbContactsCRM)
  const nbFlyers       = allMonthInts.filter(i => i.action === 'flyer_depose' || i.action === 'courrier_depose').length
  const tauxContact    = nbPortes > 0 ? (nbContactsSess / nbPortes * 100) : 0
  const tauxLabel      = tauxContact > 0 ? tauxContact.toFixed(2) + ' %' : '0 %'

  const weeklyData = [1, 2, 3, 4].map(wk => {
    const weekSessIds = sessionsMonth.filter(s => getWeek(s.date_session) === wk).map(s => s.id)
    const weekInts = allMonthInts.filter(i => weekSessIds.includes(i.session_id))
    return {
      label:    `Sem. ${wk}`,
      sessions: weekSessIds.length,
      portes:   weekInts.length,
      contacts: weekInts.filter(i => i.presence === true).length,
      flyers:   weekInts.filter(i => i.action === 'flyer_depose' || i.action === 'courrier_depose').length,
    }
  })

  const nbSessionsReal = sessionsMonth.length
  const nbSessionsTot  = Math.max(nbPlanned, nbSessionsReal)
  const avgPortes      = nbSessionsReal > 0 ? (nbPortes / nbSessionsReal).toFixed(1) : '—'

  // ══════════════════════════════════════════════════════════════════════════
  // COUVERTURE PAR ZONE
  // ══════════════════════════════════════════════════════════════════════════

  const sessZoneMap     = new Map(allZonedSessions.map(s => [s.id, s.zone_id]))
  const zoneAdressSets  = new Map<string, Set<string>>()
  for (const int of (coverageInts ?? [])) {
    const zoneId = sessZoneMap.get(int.session_id)
    if (!zoneId) continue
    if (!zoneAdressSets.has(zoneId)) zoneAdressSets.set(zoneId, new Set())
    zoneAdressSets.get(zoneId)!.add(int.adresse_id)
  }
  const visitedCountByZone = new Map<string, number>()
  for (const [zid, set] of zoneAdressSets) visitedCountByZone.set(zid, set.size)

  const lastByZone: Record<string, string> = {}
  for (const s of allZonedSessions) {
    if (s.zone_id && !lastByZone[s.zone_id]) lastByZone[s.zone_id] = s.date_session
  }
  const nextByZone: Record<string, string> = {}
  for (const s of upcoming) {
    if (s.zone_id && !nextByZone[s.zone_id]) nextByZone[s.zone_id] = s.date_prevue
  }

  // ── Contacts par zone ─────────────────────────────────────────────────
  const contactsByZone = new Map<string, number>()
  let nbContactsHorsZone = 0
  for (const c of contactsZone) {
    const zid = (c as any).adresses?.zone_id
    if (zid && zoneIds.includes(zid)) {
      contactsByZone.set(zid, (contactsByZone.get(zid) ?? 0) + 1)
    } else {
      nbContactsHorsZone++
    }
  }

  const zonesDisplay = zones.map((z, i) => {
    const total    = z.nb_adresses ?? 0
    const excluded = (z as any).nb_logements_sociaux ?? 0
    const visited   = visitedCountByZone.get(z.id) ?? 0
    const remaining = Math.max(0, total - visited)
    const pct       = total > 0 ? Math.round((visited / total) * 100) : 0
    const pctColor  = pct >= 60 ? C.success : pct >= 40 ? C.gold : C.danger
    const color     = z.couleur ?? ZONE_COLORS[i % ZONE_COLORS.length]!
    const lastD     = lastByZone[z.id]
    const nextD     = nextByZone[z.id]
    return {
      ...z, color, visited, remaining, excluded,
      total: Math.max(total, 1), pct, pctColor,
      nbContacts: contactsByZone.get(z.id) ?? 0,
      lastLabel: lastD ? new Date(lastD + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—',
      nextLabel: nextD ? new Date(nextD + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—',
    }
  })

  // ══════════════════════════════════════════════════════════════════════════
  // KPIs CRM — filtrés par sélecteur période
  // ══════════════════════════════════════════════════════════════════════════

  const nbContactsTotal = contacts.filter(c => c.statut_pipeline !== 'perdu').length
  const nbDecouvertes   = contacts.filter(c => ['qualification','estimation','mandat'].includes(c.statut_pipeline ?? '')).length
  const nbEstimations   = contacts.filter(c => ['estimation','mandat'].includes(c.statut_pipeline ?? '')).length
  const nbMandats       = contacts.filter(c => c.statut_pipeline === 'mandat').length
  const nbRelRetard  = contacts.filter(c => c.date_relance && c.date_relance < todayStr).length
  const nbRelMois    = contacts.filter(c => c.date_relance && c.date_relance >= todayStr && c.date_relance <= monthEnd).length
  const nbRelSemaine = contacts.filter(c => c.date_relance && c.date_relance >= todayStr && c.date_relance <= sundayStr).length

  const isManager = commercial.role === 'manager'

  // ── Tendances vs mois précédent ────────────────────────────────────────
  const trendSessions = trendPct(nbSessionsReal, lastMonthSessions.length)
  const trendPortes   = trendPct(nbPortes,       lastMonthPortes ?? 0)
  const trendMandats  = trendPct(nbMandats,       lastMonthMandatsCount ?? 0)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: C.bg, minHeight: '100%', fontFamily: FONT }}>

      {/* Responsive grid styles */}
      <style>{`
        .dash-kpi-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .dash-2col  { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 900px) {
          .dash-kpi-4 { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 600px) {
          .dash-kpi-4 { grid-template-columns: 1fr 1fr; }
          .dash-2col  { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* Header */}
      <div style={{
        height: 54, padding: '0 24px',
        background: C.card, borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text, letterSpacing: '-0.01em' }}>Dashboard</span>
          <div style={{ width: 1, height: 18, background: C.border }} />
          <span style={{ fontSize: 12, color: C.dim, fontWeight: 500 }}>{monthBadge}</span>
        </div>
        <Link href="/terrain" style={{
          textDecoration: 'none', padding: '6px 14px', borderRadius: 8,
          background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`,
          boxShadow: '0 2px 8px rgba(217,119,6,0.4)',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>Démarrer terrain →</span>
        </Link>
      </div>

      <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Bannière manager */}
        {isManager && (
          <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: 13, color: C.text }}>👥 Espace manager</span>
              <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>Gérez les comptes et les accès de votre équipe commerciale.</div>
            </div>
            <Link href="/admin/users" style={{ padding: '7px 16px', borderRadius: 8, background: C.success, color: '#fff', fontWeight: 600, fontSize: 12, textDecoration: 'none', flexShrink: 0, marginLeft: 20 }}>
              Gérer l&apos;équipe →
            </Link>
          </div>
        )}

        {/* Session en cours */}
        {sessionEC && (
          <div style={{ background: 'rgba(217,119,6,0.07)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.gold, boxShadow: `0 0 8px ${C.gold}`, flexShrink: 0 }} />
              <div>
                <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>Session de prospection en cours</span>
                <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>
                  {(sessionEC as any).zones_prospection
                    ? `Zone ${(sessionEC as any).zones_prospection.numero} — ${(sessionEC as any).zones_prospection.nom}`
                    : 'Session libre'}
                </div>
              </div>
            </div>
            <Link href="/terrain" style={{ padding: '7px 14px', borderRadius: 8, background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`, color: '#fff', fontWeight: 700, fontSize: 12, textDecoration: 'none', flexShrink: 0 }}>
              ▶ Reprendre →
            </Link>
          </div>
        )}

        {/* ═══ 1. KPI STRIP ═══ */}
        <CollapsibleSection
          id="kpis"
          title="Indicateurs clés"
          badge={monthBadge}
          summary={`${nbSessionsReal} sessions · ${nbPortes} portes · ${nbContactsSess} contacts · ${nbMandats} mandats`}
          accentColor={C.gold}
        >
          <div className="dash-kpi-4" style={{ marginBottom: 10 }}>
            <KpiCard label="Sessions réalisées" value={String(nbSessionsReal)}
              sub={`sur ${nbSessionsTot} planifiées`} color={C.gold} variant="hero"
              trend={trendSessions}
              sparkData={weeklyData.map(w => w.sessions)} />
            <KpiCard label="Portes frappées" value={String(nbPortes)}
              sub="interactions terrain" color={C.info} variant="accent"
              trend={trendPortes}
              sparkData={weeklyData.map(w => w.portes)} />
            <KpiCard label="Contacts terrain" value={String(nbContactsSess)}
              sub="ce mois" color={C.success} variant="accent"
              sparkData={weeklyData.map(w => w.contacts)} />
            <KpiCard label="Taux de contact" value={tauxLabel} sub="portes → contacts" color={C.teal} />
          </div>
          <div className="dash-kpi-4">
            <KpiCard label="Contacts CRM" value={String(nbContactsTotal)} sub={periodeLabel} color={C.purple} />
            <KpiCard label="Estimations" value={String(nbEstimations)} sub={periodeLabel} color={C.info} />
            <KpiCard label="Mandats signés" value={String(nbMandats)} sub={periodeLabel} color={C.gold} variant="accent"
              trend={periode === 'mois' ? trendMandats : undefined} />
            <KpiCard label="Flyers / courriers" value={String(nbFlyers)} sub="déposés ce mois" color={C.orange} />
          </div>
        </CollapsibleSection>

        {/* ═══ 2 & 3. ACTIVITÉ + PERFORMANCE ═══ */}
        <div className="dash-2col">

          <CollapsibleSection
            id="activite"
            title="Activité terrain"
            badge={monthBadge}
            summary={`${nbSessionsReal} sessions · moy. ${avgPortes} portes/sess.`}
            accentColor={C.info}
          >
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: C.mid, fontWeight: 500 }}>Sessions réalisées / planifiées</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.gold }}>{nbSessionsReal} / {nbSessionsTot}</span>
              </div>
              <HBar fill={nbSessionsTot > 0 ? nbSessionsReal / nbSessionsTot : 0} color={C.gold} h={8} />
              {nbSessionsTot > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: C.success }}>
                    {Math.round((nbSessionsReal / nbSessionsTot) * 100)}% du planning
                  </span>
                </div>
              )}
            </div>
            <WeeklyHistogram weeks={weeklyData} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 18 }}>
              <MiniKPI label="Moy. portes/session" value={avgPortes} color={C.info} />
              <MiniKPI label="Sessions ce mois" value={String(nbSessionsReal)} color={C.gold} />
              <MiniKPI label="Flyers déposés" value={String(nbFlyers)} color={C.purple} />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            id="performance"
            title="Performance commerciale"
            badge="Pipeline"
            summary={`${nbMandats} mandats · ${nbDecouvertes} découvertes · ${nbRelRetard} retard${nbRelRetard > 1 ? 's' : ''}`}
            action={<PeriodeSelector current={periode} />}
            accentColor={C.gold}
          >
            <ConversionFunnel steps={[
              { label: 'Contacts',    value: nbContactsTotal, color: C.success },
              { label: 'Découvertes', value: nbDecouvertes,   color: C.teal },
              { label: 'Estimations', value: nbEstimations,   color: C.purple },
              { label: 'Mandats',     value: nbMandats,       color: C.gold },
            ]} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 18 }}>
              <RatioTile label="Taux de contact"   value={tauxLabel}                 color={C.success} sub={monthBadge} />
              <RatioTile label="Découv. / contact" value={fmtPct(nbDecouvertes, nbContactsTotal)} color={C.teal}    sub={periodeLabel} />
              <RatioTile label="Mandats / estim."  value={fmtPct(nbMandats, nbEstimations)}       color={C.gold}    sub={periodeLabel} />
              <RatioTile label="Mandats signés"    value={String(nbMandats)}         color={C.purple}  sub={periodeLabel} />
            </div>
            <div style={{ marginTop: 18 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 10, display: 'block' }}>
                Relances
                <span style={{ fontSize: 10, color: C.dim, fontWeight: 400, marginLeft: 6 }}>(contacts {periodeLabel.toLowerCase()})</span>
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Cette semaine', value: nbRelSemaine, color: C.info,    href: null },
                  { label: 'Ce mois',       value: nbRelMois,    color: C.gold,    href: null },
                  { label: 'En retard',     value: nbRelRetard,  color: C.danger,  href: '/contacts?filtre=relance' },
                ].map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, color: C.muted, fontWeight: 500, width: 95, flexShrink: 0 }}>{r.label}</span>
                    <div style={{ flex: 1 }}><HBar fill={nbContactsTotal > 0 ? r.value / nbContactsTotal : 0} color={r.color} h={5} /></div>
                    {r.href ? (
                      <Link href={r.href} style={{ textDecoration: 'none' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: r.color, width: 22, textAlign: 'right', display: 'block' }}>{r.value}</span>
                      </Link>
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 700, color: r.color, width: 22, textAlign: 'right' }}>{r.value}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleSection>
        </div>

        {/* ═══ 4 & 5. COUVERTURE + DPE ═══ */}
        <div className="dash-2col">

          {/* Couverture territoriale */}
          <CollapsibleSection
            id="couverture"
            title="Couverture territoriale"
            badge={`${zones.length} zones`}
            summary={`${zonesDisplay.reduce((s, z) => s + z.visited, 0)} adresses visitées`}
            accentColor={C.teal}
          >
            <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
              {[
                { label: 'Visitées',  color: C.success },
                { label: 'Restantes', color: C.info + '50' },
                { label: 'Exclues',   color: 'rgba(255,255,255,0.08)' },
              ].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
                  <span style={{ fontSize: 10, color: C.dim, fontWeight: 500 }}>{l.label}</span>
                </div>
              ))}
            </div>
            {zonesDisplay.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: C.muted }}>
                <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.4 }}>🗺️</div>
                <span style={{ fontSize: 13 }}>Aucune zone configurée</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', maxHeight: 340 }}>
                {zonesDisplay.map((z, i) => (
                  <div key={z.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px',
                    borderBottom: `1px solid ${C.borderSub}`,
                  }}>
                    <div style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, background: z.color + '15', border: `1.5px solid ${z.color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: z.color }}>{z.numero}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{z.nom}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: z.pctColor, flexShrink: 0, marginLeft: 8 }}>{z.pct}%</span>
                      </div>
                      <ZoneStackedBar visited={z.visited} remaining={z.remaining} excluded={z.excluded} total={z.total} />
                      {z.nbContacts > 0 && (
                        <span style={{ fontSize: 9, color: C.info, marginTop: 2, display: 'block' }}>
                          {z.nbContacts} contact{z.nbContacts > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, width: 64 }}>
                      <span style={{ fontSize: 10, color: C.muted, display: 'block' }}>{z.remaining} rest.</span>
                      <span style={{ fontSize: 9, color: C.dim }}>↻ {z.nextLabel}</span>
                    </div>
                  </div>
                ))}
                {/* Hors zone */}
                {nbContactsHorsZone > 0 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px',
                    borderBottom: 'none',
                  }}>
                    <div style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, background: C.dim + '20', border: `1.5px solid ${C.dim}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: C.dim }}>—</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 500, color: C.muted }}>Hors zone</span>
                      <span style={{ fontSize: 9, color: C.orange, marginLeft: 6 }}>
                        {nbContactsHorsZone} contact{nbContactsHorsZone > 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CollapsibleSection>

          {/* ══ Intelligence DPE ══ */}
          <CollapsibleSection
            id="dpe"
            title="Intelligence DPE"
            badge="Secteur"
            summary={`${dpeTotal} DPE identifiés · ${dpeRecents} < 2 sem.`}
            action={<DpePeriodeSelector current={dpePeriode} />}
            accentColor={C.purple}
          >
            {/* 3 KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 18 }}>
              <MiniKPI label="DPE total"        value={String(dpeTotal)}   color={C.gold}    sub={dpePeriodeLabel} />
              <MiniKPI label="DPE < 2 semaines" value={String(dpeRecents)} color={C.info}    sub="→ Préparer prospection" href={`/courriers?date_debut=${twoWeeksAgoStr}&date_fin=${todayStr}&autoload=1`} />
              <MiniKPI label="% adr. avec DPE"  value={dpePct + '%'}       color={C.success} sub="du secteur" />
            </div>

            {/* Histogramme A→G */}
            <span style={{ fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 10, display: 'block' }}>
              Répartition par étiquette
            </span>
            <DPEHistogram distribution={dpeDistrib} />

            {/* 4 lignes détaillées */}
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <DpeDetailRow
                label="DPE identifiés sur le secteur"
                maison={dpeMaisonTotal} appart={dpeAppartTotal} total={dpeTotal}
                color={C.info}
              />
              <DpeDetailRow
                label="DPE dans une zone de prospection"
                maison={dpeInZoneMaison} appart={dpeInZoneAppart} total={dpeInZoneTotal}
                color={C.success}
              />
              <DpeDetailRow
                label="DPE hors zone de prospection"
                maison={dpeHorsZoneMaison} appart={dpeHorsZoneAppart} total={dpeHorsZoneTotal}
                color={C.orange}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: C.purple + '08', border: `1px solid ${C.purple}15` }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.purple, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: C.purple, fontWeight: 500, flex: 1 }}>DPE boîtés (courrier/flyer déposé)</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.purple }}>{dpeBoites}</span>
              </div>
            </div>
          </CollapsibleSection>
        </div>

        {/* ═══ 6. TABLEAU DE PILOTAGE ═══ */}
        <CollapsibleSection
          id="pilotage"
          title={`Tableau de pilotage — ${zones.length} zones`}
          summary={`${zones.length} zones configurées`}
          accentColor={C.gold}
        >
          {zones.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: C.muted }}>
              <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.4 }}>📊</div>
              <span style={{ fontSize: 13 }}>Configurez vos zones pour voir le tableau de pilotage</span>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontFamily: FONT, fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Zone', '% couverture', 'Visitées', 'Restantes', 'Contacts', 'Dernier passage', 'Retour prévu', 'Statut'].map((h, i) => (
                      <th key={i} style={{
                        padding: '10px', textAlign: i === 0 ? 'left' : 'center',
                        borderBottom: `1px solid ${C.borderL}`,
                        color: C.dim, fontWeight: 600, fontSize: 10,
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                        whiteSpace: 'nowrap', background: 'rgba(255,255,255,0.015)',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {zonesDisplay.map((z) => (
                    <tr key={z.id}>
                      <td style={{ padding: '10px', borderBottom: `1px solid ${C.borderSub}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 20, height: 20, borderRadius: 5, background: z.color + '15', border: `1.5px solid ${z.color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: z.color }}>{z.numero}</span>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: C.text, whiteSpace: 'nowrap' }}>{z.nom}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center', borderBottom: `1px solid ${C.borderSub}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                          <HBar w={48} h={4} fill={z.pct / 100} color={z.pctColor} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: z.pctColor }}>{z.pct}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center', borderBottom: `1px solid ${C.borderSub}` }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.success }}>{z.visited}</span>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center', borderBottom: `1px solid ${C.borderSub}` }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.mid }}>{z.remaining}</span>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center', borderBottom: `1px solid ${C.borderSub}` }}>
                        {z.nbContacts > 0 ? (
                          <span style={{ fontSize: 11, fontWeight: 700, color: C.info }}>{z.nbContacts}</span>
                        ) : (
                          <span style={{ fontSize: 11, color: C.dim }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center', borderBottom: `1px solid ${C.borderSub}` }}>
                        <span style={{ fontSize: 11, color: C.muted }}>{z.lastLabel}</span>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center', borderBottom: `1px solid ${C.borderSub}` }}>
                        {z.nextLabel !== '—' ? (
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', color: C.info }}>
                            {z.nextLabel}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: C.dim }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center', borderBottom: `1px solid ${C.borderSub}` }}>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                          background: z.statut === 'active' ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${z.statut === 'active' ? 'rgba(34,197,94,0.2)' : C.border}`,
                          color: z.statut === 'active' ? C.success : C.dim,
                        }}>
                          {z.statut === 'active' ? 'Active' : z.statut ?? '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {/* Ligne Hors zone */}
                  {nbContactsHorsZone > 0 && (
                    <tr>
                      <td style={{ padding: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 20, height: 20, borderRadius: 5, background: C.dim + '15', border: `1.5px solid ${C.dim}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: C.dim }}>—</span>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 500, color: C.muted, fontStyle: 'italic', whiteSpace: 'nowrap' }}>Hors zone</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <span style={{ fontSize: 11, color: C.dim }}>—</span>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <span style={{ fontSize: 11, color: C.dim }}>—</span>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <span style={{ fontSize: 11, color: C.dim }}>—</span>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.orange }}>{nbContactsHorsZone}</span>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <span style={{ fontSize: 11, color: C.dim }}>—</span>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <span style={{ fontSize: 11, color: C.dim }}>—</span>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)', color: C.orange }}>
                          Hors zone
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CollapsibleSection>

      </div>
    </div>
  )
}
