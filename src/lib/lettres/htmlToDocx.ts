// ═══════════════════════════════════════════════════════════════════════════
// HTML → DOCX TextRun[] converter (serveur uniquement, pas de DOMParser)
// Supporte : <strong> <b> <em> <i> <u> <s> <a href> <span style> <br>
// ═══════════════════════════════════════════════════════════════════════════

import { TextRun, ExternalHyperlink, Paragraph, ImageRun, AlignmentType } from 'docx'

interface StyleState {
  bold:      boolean
  italic:    boolean
  underline: boolean
  strike:    boolean
  color:     string | undefined
  size:      number | undefined   // demi-points (20 = 10pt)
  href:      string | undefined
}

const DEFAULT_STYLE: StyleState = {
  bold: false, italic: false, underline: false, strike: false,
  color: undefined, size: undefined, href: undefined,
}

type Token =
  | { type: 'text';     text: string }
  | { type: 'open';     tag: string; attrs: Record<string,string> }
  | { type: 'close';    tag: string }
  | { type: 'selfclose'; tag: string; attrs: Record<string,string> }

// ── Tokenizer HTML minimal ────────────────────────────────────────────────────

function tokenize(html: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const n = html.length

  while (i < n) {
    if (html[i] === '<') {
      const end = html.indexOf('>', i)
      if (end === -1) { tokens.push({ type: 'text', text: html.slice(i) }); break }
      const raw = html.slice(i + 1, end)
      i = end + 1

      if (raw.startsWith('!--')) continue // ignore comments

      const isClose = raw.startsWith('/')
      const isSelf  = raw.endsWith('/')
      const inner   = isClose ? raw.slice(1) : (isSelf ? raw.slice(0, -1) : raw)
      const parts   = inner.trim().split(/\s+/)
      const tag     = (parts[0] ?? '').toLowerCase()
      if (!tag) continue

      // Parse attributes
      const attrStr = inner.trim().slice(tag.length).trim()
      const attrs: Record<string,string> = {}
      const attrRe = /(\w[\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g
      let m: RegExpExecArray | null
      while ((m = attrRe.exec(attrStr)) !== null) {
        attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? ''
      }

      if (isClose)     tokens.push({ type: 'close', tag })
      else if (isSelf) tokens.push({ type: 'selfclose', tag, attrs })
      else             tokens.push({ type: 'open', tag, attrs })
    } else {
      // Text node — read until next '<'
      const end = html.indexOf('<', i)
      const text = end === -1 ? html.slice(i) : html.slice(i, end)
      i = end === -1 ? n : end
      if (text) tokens.push({ type: 'text', text })
    }
  }
  return tokens
}

// ── Décode les entités HTML basiques ─────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
}

// ── Parse CSS inline minimal ──────────────────────────────────────────────────

function parseCssColor(css: string): string | undefined {
  const m = /color\s*:\s*(#[0-9a-fA-F]{3,8}|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\))/i.exec(css)
  if (!m) return undefined
  const raw = m[1].trim()
  if (raw.startsWith('#')) return raw.replace('#', '').toUpperCase().padEnd(6, '0').slice(0, 6)
  // rgb(r,g,b) → hex
  const rgb = raw.match(/\d+/g)
  if (!rgb || rgb.length < 3) return undefined
  return rgb.slice(0,3).map(v => Number(v).toString(16).padStart(2,'0')).join('').toUpperCase()
}

function parseCssFontSize(css: string): number | undefined {
  const m = /font-size\s*:\s*(\d+(?:\.\d+)?)(px|pt|em)?/i.exec(css)
  if (!m) return undefined
  const val  = parseFloat(m[1])
  const unit = (m[2] ?? 'px').toLowerCase()
  // Convert to demi-points (DOCX size unit)
  if (unit === 'pt') return Math.round(val * 2)
  if (unit === 'px') return Math.round((val * 0.75) * 2) // px → pt → half-pt
  return Math.round(val * 2) // default assume pt
}

// ── Convertit un état de style en props TextRun ───────────────────────────────

function makeTextRun(text: string, st: StyleState): TextRun {
  return new TextRun({
    text,
    bold:      st.bold      || undefined,
    italics:   st.italic    || undefined,
    underline: st.underline ? { type: 'single' } : undefined,
    strike:    st.strike    || undefined,
    color:     st.color,
    size:      st.size,
    font:      'Arial',
  })
}

// ── Conversion principale ─────────────────────────────────────────────────────

export interface HtmlRunResult {
  runs:      (TextRun | ExternalHyperlink)[]
  lineBreaks: boolean  // si des <br> ont été trouvés → appeler en multi-paragraphes
}

/**
 * Convertit une chaîne HTML en tableau de TextRun / ExternalHyperlink DOCX.
 * Les <br> sont remplacés par un retour à la ligne (BreakType.LINE) dans le TextRun.
 */
export function htmlToRuns(
  html: string,
  baseColor = '1A1A1A',
  baseSize  = 20,
): (TextRun | ExternalHyperlink)[] {
  const tokens = tokenize(html)
  const stack: StyleState[] = [{ ...DEFAULT_STYLE, color: baseColor, size: baseSize }]
  const result: (TextRun | ExternalHyperlink)[] = []

  const cur = (): StyleState => stack[stack.length - 1]

  const push = (patch: Partial<StyleState>) =>
    stack.push({ ...cur(), ...patch })

  function flushText(text: string) {
    if (!text) return
    const st  = cur()
    const decoded = decodeEntities(text)
    if (!decoded) return
    if (st.href) {
      result.push(new ExternalHyperlink({
        link: st.href,
        children: [new TextRun({
          text: decoded,
          bold:      st.bold     || undefined,
          italics:   st.italic   || undefined,
          underline: { type: 'single', color: st.color ?? baseColor },
          color:     st.color ?? baseColor,
          size:      st.size,
          font:      'Arial',
        })],
      }))
    } else {
      result.push(makeTextRun(decoded, st))
    }
  }

  for (const tok of tokens) {
    if (tok.type === 'text') {
      flushText(tok.text)
    } else if ((tok.type === 'selfclose' || tok.type === 'open') && tok.tag === 'br') {
      // Line break (<br> ou <br/>)
      result.push(new TextRun({ break: 1 }))
    } else if (tok.type === 'open') {
      switch (tok.tag) {
        case 'strong': case 'b': push({ bold: true }); break
        case 'em':     case 'i': push({ italic: true }); break
        case 'u':  push({ underline: true }); break
        case 's':  case 'del': case 'strike': push({ strike: true }); break
        case 'a': {
          const href = tok.attrs['href'] ?? ''
          push({ href: href || undefined, color: '009597', underline: true })
          break
        }
        case 'span': {
          const style   = tok.attrs['style'] ?? ''
          const color   = parseCssColor(style)
          const size    = parseCssFontSize(style)
          push({
            ...(color ? { color } : {}),
            ...(size  ? { size  } : {}),
          })
          break
        }
        default: push({}) // unknown tag → no style change, but push for balanced pop
      }
    } else if (tok.type === 'close') {
      if (stack.length > 1) stack.pop()
    }
  }

  return result
}

// ── Spliteur HTML → lignes ────────────────────────────────────────────────────

function splitByBlocks(html: string): string[] {
  const s = html
    .replace(/<\/p>/gi,   '\x00')
    .replace(/<\/div>/gi, '\x00')
    .replace(/<\/li>/gi,  '\x00')
    .replace(/<br\s*\/?>/gi, '\x00')
    .replace(/<(?:p|div|ul|ol|li|h[1-6])(?:\s[^>]*)?>|<\/(?:ul|ol|h[1-6])>/gi, '')
  return s.split('\x00').map(l => l.trim()).filter(l => l.length > 0)
}

/**
 * Convertit un HTML multi-paragraphes en tableau de Paragraph DOCX.
 * Supporte la variable spéciale {logo} qui insère une ImageRun.
 */
export function htmlToParagraphs(
  html: string,
  opts?: {
    logoData?:   string | null
    logoMime?:   string | null
    logoW?:      number
    logoH?:      number
    alignment?:  AlignmentType
    baseColor?:  string
    baseSize?:   number
    spacing?:    { before?: number; after?: number }
    border?: {
      top?:    { style: string; size: number; color: string }
      bottom?: { style: string; size: number; color: string }
    }
  },
): Paragraph[] {
  const lines = splitByBlocks(html)
  if (lines.length === 0) return []

  return lines.map((line, idx) => {
    const children: (TextRun | ExternalHyperlink | ImageRun)[] = []
    const segments = line.split('{logo}')
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      if (seg) children.push(...htmlToRuns(seg, opts?.baseColor ?? '1A1A1A', opts?.baseSize ?? 20))
      if (i < segments.length - 1 && opts?.logoData && opts?.logoMime) {
        children.push(new ImageRun({
          data:           Buffer.from(opts.logoData, 'base64'),
          transformation: { width: opts.logoW ?? 60, height: opts.logoH ?? 40 },
          type:           (opts.logoMime.split('/')[1] as 'png' | 'jpg' | 'gif' | 'bmp') || 'png',
        }))
      }
    }
    return new Paragraph({
      children,
      alignment: opts?.alignment,
      spacing: {
        before: idx === 0 ? (opts?.spacing?.before ?? 0) : 0,
        after:  idx === lines.length - 1 ? (opts?.spacing?.after ?? 60) : 60,
      },
      border: opts?.border as any,
    })
  })
}

/**
 * Version simplifiée : convertit du HTML en texte brut (pour fallback).
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .trim()
}
