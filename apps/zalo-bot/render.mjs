/**
 * The one presenter for Zalo. Pure: no I/O, no zca-js import.
 *
 * Two ways in, one way out. Deterministic builders (format.mjs) hand over Line[] whose
 * segments carry semantic marks; only they can colour anything. LLM prose goes through
 * md(), whose output marks are {b, i, ul, ol} by construction: no syntax a model writes
 * can produce a colour. That is how "colours are decided by code from data" holds in code.
 *
 * Offsets are JavaScript string indices (UTF-16 units) on NFC text, the way the demo
 * message that rendered correctly on phone and Zalo PC computed them.
 */

/** Semantic mark → zca-js TextStyle value (2.1.2). render.test.mjs compares this with the library enum. */
export const ST = {
  b: 'b',
  i: 'i',
  green: 'c_15a85f',
  orange: 'c_f27806',
  red: 'c_db342e',
  small: 'f_13',
  ul: 'lst_1',
  ol: 'lst_2',
};
const EXPAND = { note: [ST.small, ST.i], warn: [ST.orange] };

/** Line = { segs: Array<string | [string, ...mark]>, marks?: mark[] }; empty segs = blank line (paragraph break). */
export const L = (segs, ...marks) => ({ segs, marks });

const seg = (s) => (typeof s === 'string' ? [s.normalize('NFC')] : [String(s[0]).normalize('NFC'), ...s.slice(1)]);
const lineText = (ln) => ln.segs.map((s) => seg(s)[0]).join('');
const BLANK = L([]);

/** Plain text of a reply: for sanitizeLead, the saved bot turn, and tests. Never an evidence body. */
export function toText(input) {
  return typeof input === 'string' ? input.normalize('NFC') : input.map(lineText).join('\n');
}

/** Merge every `warn` line into one orange line at the first one's place, joined by "; " (a space after "." "!" "?"). */
function mergeWarnings(lines) {
  const isWarn = (ln) => ln.marks?.includes('warn');
  const warns = lines.filter(isWarn);
  if (warns.length < 2) return lines;
  const merged = L(
    warns.flatMap((ln, k) => (k ? [/[.!?]$/.test(lineText(warns[k - 1])) ? ' ' : '; ', ...ln.segs] : ln.segs)),
    'warn',
  );
  // By position, not identity: the same warn Line object may be passed twice.
  const first = lines.findIndex(isWarn);
  return lines.flatMap((ln, k) => (k === first ? [merged] : isWarn(ln) ? [] : [ln]));
}

function build(lines) {
  let msg = '';
  const styles = [];
  const add = (start, len, mark) => {
    const sts = EXPAND[mark] ?? (ST[mark] ? [ST[mark]] : null);
    if (!sts) throw new Error(`render: unknown mark "${mark}"`);
    for (const st of sts) {
      // Nested markup splits one run into adjacent segments; send it as one style.
      const prev = styles.findLast((x) => x.st === st && x.start + x.len === start);
      if (prev) prev.len += len;
      else styles.push({ start, len, st });
    }
  };
  lines.forEach((ln, k) => {
    if (k) msg += '\n';
    const lineStart = msg.length;
    for (const s of ln.segs) {
      const [text, ...marks] = seg(s);
      const start = msg.length;
      msg += text;
      if (text) for (const m of marks) add(start, text.length, m);
    }
    const len = msg.length - lineStart;
    if (len) for (const m of ln.marks ?? []) add(lineStart, len, m);
  });
  return { msg, styles };
}

const size = (lines) => lines.reduce((n, ln) => n + lineText(ln).length, 0) + Math.max(0, lines.length - 1);

/** Cut one over-long line at segment boundaries; a marked segment is only cut when it alone exceeds the limit. */
function splitLine(line, limit) {
  const out = [];
  let cur = [];
  let len = 0;
  const push = () => {
    if (cur.length) out.push({ segs: cur, marks: line.marks });
    cur = [];
    len = 0;
  };
  const queue = line.segs.map(seg);
  while (queue.length) {
    const [text, ...marks] = queue.shift();
    if (len + text.length <= limit) {
      cur.push([text, ...marks]);
      len += text.length;
      continue;
    }
    if (len && (marks.length || text.lastIndexOf(' ', limit - len) <= 0)) {
      push();
      queue.unshift([text, ...marks]);
      continue;
    }
    const room = limit - len;
    const space = text.lastIndexOf(' ', room);
    const cut = space > 0 ? space : room;
    cur.push([text.slice(0, cut), ...marks]);
    push();
    queue.unshift([text.slice(cut).replace(/^ /, ''), ...marks]);
  }
  push();
  return out;
}

/**
 * Line[] (or a plain string, never read for markup) → Zalo messages with styles.
 * Splits on paragraph boundaries BEFORE computing offsets, so every message counts from 0.
 */
export function render(input, { budget = 1800 } = {}) {
  const raw = typeof input === 'string' ? input.normalize('NFC').replace(/\r\n?/g, '\n').split('\n').map((t) => L([t])) : input;
  const lines = mergeWarnings(raw);
  const paras = [];
  let para = [];
  for (const ln of lines) {
    if (lineText(ln) === '') {
      if (para.length) paras.push(para);
      para = [];
    } else para.push(ln);
  }
  if (para.length) paras.push(para);

  const all = paras.flatMap((p, k) => (k ? [BLANK, ...p] : p));
  if (size(all) <= budget) return [build(all)];

  const limit = budget - 8; // room for the "(k/n)" line
  const msgs = [];
  let cur = [];
  const flush = () => {
    if (cur.length) msgs.push(cur);
    cur = [];
  };
  for (const p of paras) {
    const next = cur.length ? [BLANK, ...p] : p;
    if (size([...cur, ...next]) <= limit) {
      cur.push(...next);
      continue;
    }
    if (size(p) <= limit) {
      flush();
      cur.push(...p);
      continue;
    }
    // Too long for any message: continue the current one line by line, so a short paragraph is not sent alone.
    if (cur.length) cur.push(BLANK);
    for (const ln of p.flatMap((l) => (lineText(l).length > limit ? splitLine(l, limit) : [l]))) {
      if (cur.length && size([...cur, ln]) > limit) {
        if (lineText(cur.at(-1)) === '') cur.pop();
        flush();
      }
      cur.push(ln);
    }
  }
  flush();
  return msgs.map((m, k) => build([...m, L([`(${k + 1}/${msgs.length})`], 'note')]));
}

// --- md(): the Markdown subset LLM prose may use ------------------------------

const WORD = /[\p{L}\p{N}]/u;

/** Inline `**b**` / `*i*` with CommonMark-like flanking; everything else is text. */
function inline(text) {
  const toks = [];
  for (let i = 0; i < text.length; ) {
    const ch = text[i];
    if (ch === '\\' && (text[i + 1] === '*' || text[i + 1] === '\\')) {
      toks.push({ text: text[i + 1] });
      i += 2;
      continue;
    }
    if (ch === '*') {
      let j = i;
      while (text[j] === '*') j++;
      const run = text.slice(i, j);
      const prev = text[i - 1] ?? '';
      const next = text[j] ?? '';
      // A `*` between letters/digits (173.6*162.6) or against a parenthesis ("(*)") is text.
      const literal = run.length > 2 || (WORD.test(prev) && WORD.test(next)) || /[()]/.test(prev) || /[()]/.test(next);
      toks.push(
        literal
          ? { text: run }
          : { delim: run, open: next !== '' && (WORD.test(next) || next === '*'), close: prev !== '' && !/\s/.test(prev) },
      );
      i = j;
      continue;
    }
    let j = i;
    while (j < text.length && text[j] !== '*' && text[j] !== '\\') j++;
    if (j === i) j = i + 1; // a lone backslash
    toks.push({ text: text.slice(i, j) });
    i = j;
  }
  const stack = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (!t.delim) continue;
    const at = t.close ? stack.findLastIndex((o) => toks[o].delim === t.delim) : -1;
    if (at >= 0) {
      toks[stack[at]].role = 'open';
      t.role = 'close';
      stack.length = at;
    } else if (t.open) stack.push(k);
  }
  const segs = [];
  const active = [];
  for (const t of toks) {
    if (t.role) {
      const mark = t.delim === '**' ? 'b' : 'i';
      if (t.role === 'open') active.push(mark);
      else active.splice(active.lastIndexOf(mark), 1);
      continue;
    }
    const s = t.text ?? t.delim;
    const last = segs[segs.length - 1];
    const sameMarks = last && JSON.stringify(last.slice(1)) === JSON.stringify(active);
    if (sameMarks) last[0] += s;
    else segs.push([s, ...active]);
  }
  return segs.map((s) => (s.length === 1 ? s[0] : s));
}

/** LLM prose → Line[]. Output marks are only b, i, ul, ol. */
export function md(text) {
  const src = String(text ?? '').normalize('NFC').replace(/\r\n?/g, '\n');
  const out = [];
  // Zalo numbers `ol` lines itself, so `N. ` becomes `ol` only when N continues a run from 1.
  // Any other number stays in the text: "2. …\n4. …" keeps the clause numbers the reader cites (R10).
  let olNext = 1;
  for (const raw of src.split('\n')) {
    let m = raw.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (m && Number(m[1]) === olNext) {
      olNext++;
      out.push({ segs: inline(m[2]), marks: ['ol'] });
      continue;
    }
    olNext = 1;
    if (!raw.trim()) {
      if (out.length && lineText(out[out.length - 1]) !== '') out.push(L([]));
      continue;
    }
    if ((m = raw.match(/^\s*#{1,3}\s+(.*)$/))) out.push({ segs: inline(m[1]), marks: ['b'] });
    else if ((m = raw.match(/^\s*[-*•]\s+(.*)$/))) out.push({ segs: inline(m[1]), marks: ['ul'] });
    else out.push({ segs: inline(raw), marks: [] });
  }
  return out;
}
