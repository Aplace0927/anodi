import type { ClassField, ClassMethod } from '../types';
import { v4 } from './uuid';

export interface ParsedClass {
  className: string;
  fields: { name: string; type: string }[];
  methods: { signature: string }[];
}

function stripComments(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'])\/\/.*$/gm, '$1')
    .replace(/^\s*#(?!\[).*$/gm, (m) => (/^\s*#\s*(include|define|if|endif|pragma)/.test(m) ? '' : m.replace(/^(\s*)#.*$/, '')));
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Extract the body between the first '{' at/after `from` and its matching '}'. */
function braceBody(src: string, from: number): { body: string; end: number } | null {
  const open = src.indexOf('{', from);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return { body: src.slice(open + 1, i), end: i + 1 };
    }
  }
  return { body: src.slice(open + 1), end: src.length };
}

/** Split a brace-body into top-level statements, dropping nested {...} content. */
function topLevelStatements(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  let paren = 0;
  for (const ch of body) {
    if (ch === '(') paren++;
    if (ch === ')') paren--;
    if (ch === '{') {
      if (depth === 0) {
        // method body or initializer: terminate header
        if (cur.includes('(') && paren === 0) {
          out.push(cur);
          cur = '';
          depth++;
          continue;
        }
      }
      depth++;
      continue;
    }
    if (ch === '}') {
      depth--;
      if (depth === 0) cur = '';
      continue;
    }
    if (depth > 0) continue;
    if (ch === ';' && paren === 0) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (clean(cur)) out.push(cur);
  return out;
}

const ACCESS = /^(public|private|protected)\s*:\s*/;
const MODS = /\b(public|private|protected|static|final|readonly|mutable|volatile|const(?=\s+\w+\s+\w+)|pub(\([^)]*\))?|override|abstract|virtual|inline|export|declare)\b\s*/g;

function parseBraceLang(src: string, head: RegExp): ParsedClass | null {
  const m = head.exec(src);
  if (!m) return null;
  const className = m[1];
  const bb = braceBody(src, m.index + m[0].length);
  if (!bb) return null;
  const fields: ParsedClass['fields'] = [];
  const methods: ParsedClass['methods'] = [];
  for (let st of topLevelStatements(bb.body)) {
    st = clean(st);
    while (ACCESS.test(st)) st = st.replace(ACCESS, '');
    if (!st || /^(typedef|using|friend|template\s*<[^>]*>\s*$|enum|struct\s+\w+\s*$|class\s+\w+\s*$)/.test(st)) continue;
    if (st.includes('(') && !/^[^(]*=[^(]*$/.test(st)) {
      const sig = clean(st.replace(/\s*=\s*(default|delete|0)\s*$/, '').replace(/\)\s*:\s*[\w:.]+\s*[({].*$/, ')'));
      methods.push({ signature: sig.replace(/^((public|private|protected)\s+)+/, '') });
      continue;
    }
    const decl = clean(st.replace(/=.*$/, '').replace(MODS, ''));
    // Java/TS: "name: type"
    const ts = /^(\w+)\??\s*:(?!:)\s*(.+)$/.exec(decl);
    if (ts) {
      fields.push({ name: ts[1], type: ts[2] });
      continue;
    }
    for (const part of splitDeclarators(decl)) fields.push(part);
  }
  return { className, fields, methods };
}

/** "int a, *b, c[4]" -> separate fields sharing the base type. */
function splitDeclarators(decl: string): { name: string; type: string }[] {
  const parts = decl.split(',').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return [];
  const first = /^(.*?)([*&\s]*)(\w+)\s*(\[[^\]]*\])?\s*(:\s*\d+)?$/.exec(parts[0]);
  if (!first || !first[1].trim()) return [];
  const base = first[1].trim();
  const res = [{ name: first[3], type: clean(base + first[2].replace(/\s/g, '') + (first[4] ?? '')) }];
  for (const p of parts.slice(1)) {
    const mm = /^([*&]*)\s*(\w+)\s*(\[[^\]]*\])?$/.exec(p);
    if (mm) res.push({ name: mm[2], type: clean(base + mm[1] + (mm[3] ?? '')) });
  }
  return res;
}

function parsePython(src: string): ParsedClass | null {
  const m = /^[ \t]*class\s+(\w+)[^\n]*:\s*$/m.exec(src);
  if (!m) return null;
  const lines = src.slice(m.index + m[0].length).split('\n');
  const fields: ParsedClass['fields'] = [];
  const methods: ParsedClass['methods'] = [];
  const seen = new Set<string>();
  let baseIndent = -1;
  let inInit = false;
  let initIndent = 0;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const indent = raw.match(/^\s*/)![0].length;
    if (baseIndent < 0) baseIndent = indent;
    if (indent < baseIndent) break;
    const line = raw.trim();
    if (inInit && indent <= initIndent) inInit = false;
    if (indent === baseIndent) {
      const d = /^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)\s*(->\s*[^:]+)?:/.exec(line);
      if (d) {
        const params = d[2].split(',').map((p) => p.trim()).filter((p) => p && p !== 'self' && p !== 'cls');
        methods.push({ signature: `${d[1]}(${params.join(', ')})${d[3] ? ' ' + d[3].trim() : ''}` });
        if (d[1] === '__init__') {
          inInit = true;
          initIndent = indent;
          for (const p of params) {
            const pm = /^\*{0,2}(\w+)\s*(?::\s*([^=]+))?/.exec(p);
            void pm; // params are not fields by themselves
          }
        }
        continue;
      }
      const a = /^(\w+)\s*:\s*([^=]+?)(?:\s*=.*)?$/.exec(line);
      if (a && !seen.has(a[1])) {
        seen.add(a[1]);
        fields.push({ name: a[1], type: a[2].trim() });
      }
    } else if (inInit) {
      const s = /^self\.(\w+)\s*(?::\s*([^=]+?))?\s*=/.exec(line);
      if (s && !seen.has(s[1])) {
        seen.add(s[1]);
        fields.push({ name: s[1], type: s[2]?.trim() ?? '' });
      }
    }
  }
  return { className: m[1], fields, methods };
}

function parseRust(src: string): ParsedClass | null {
  const m = /\bstruct\s+(\w+)(?:<[^>]*>)?\s*(?:where[^{]*)?\{/.exec(src);
  if (!m) return null;
  const bb = braceBody(src, m.index);
  if (!bb) return null;
  const fields: ParsedClass['fields'] = [];
  for (const part of bb.body.split(/,(?![^<(\[]*[>)\]])/)) {
    const f = /^\s*(?:pub(?:\([^)]*\))?\s+)?(\w+)\s*:\s*([\s\S]+?)\s*$/.exec(part.replace(/#\[[^\]]*\]/g, ''));
    if (f) fields.push({ name: f[1], type: clean(f[2]) });
  }
  const methods: ParsedClass['methods'] = [];
  const implRe = new RegExp(`\\bimpl(?:<[^>]*>)?\\s+(?:[\\w:<>]+\\s+for\\s+)?${m[1]}\\b[^{]*\\{`, 'g');
  let im: RegExpExecArray | null;
  while ((im = implRe.exec(src))) {
    const ib = braceBody(src, im.index);
    if (!ib) continue;
    for (const st of topLevelStatements(ib.body)) {
      const fm = /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:const\s+|async\s+|unsafe\s+)*fn\s+(\w+)(?:<[^>]*>)?\s*(\([^)]*\))\s*(->\s*[\s\S]+?)?\s*(?:where[\s\S]*)?$/.exec(st);
      if (fm) methods.push({ signature: clean(`${fm[1]}${fm[2]}${fm[3] ? ' ' + fm[3] : ''}`) });
    }
  }
  return { className: m[1], fields, methods };
}

export function parseClassDefinition(input: string): ParsedClass | null {
  const src = stripComments(input || '').trim();
  if (!src) return null;
  let res: ParsedClass | null = null;
  const sm = /\bstruct\s+\w+[^{;]*\{/.exec(src);
  const sb = sm ? braceBody(src, sm.index) : null;
  if (sm && sb && !/\bclass\b/.test(src) && (/\bfn\s+\w+/.test(src) || (!sb.body.includes(';') && /\w\s*:\s*\S/.test(sb.body)))) {
    res = parseRust(src);
  } else if (/^\s*(@\w+[^\n]*\n\s*)*class\s+\w+[^\n]*:\s*$/m.test(src) && !/\{/.test(src)) {
    res = parsePython(src);
  } else {
    res =
      parseBraceLang(src, /\b(?:class|interface|struct|record)\s+(\w+)(?:\s*<[^>{]*>)?[^{;]*(?=\{)/) ??
      parsePython(src);
  }
  if (!res) return null;
  return res;
}

export function withIds(p: ParsedClass): { fields: ClassField[]; methods: ClassMethod[] } {
  return {
    fields: p.fields.map((f) => ({ id: v4(), ...f })),
    methods: p.methods.map((m) => ({ id: v4(), ...m })),
  };
}
