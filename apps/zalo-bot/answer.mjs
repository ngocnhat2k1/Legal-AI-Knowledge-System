/**
 * Producing an answer once the branch is known. Every function here returns the same
 * shape so the caller can persist memory uniformly:
 *
 *   { text, topic, tariff?, legal? }
 *
 * where `tariff`/`legal` are what the NEXT turn is allowed to point at (null = nothing
 * referable), and an absent key means "leave that memory alone".
 */
import { unlinkSync } from 'node:fs';

import {
  confirmations,
  confirmationsMatch,
  legalAnswer,
  legalProvision,
  lookupFull,
  postConfirm,
  searchByPrefix,
  searchGoods,
  tariffResponse,
} from './api.mjs';
import { stampTariff } from './conversation.mjs';
import { confirmFooter, dmy, formatAnswer, formatLegal, formatMissingDoc, formatProvisions, sanitizeLead, withLead } from './format.mjs';
import { downloadImage, VISION_DIR } from './images.mjs';
import { CODE_MARK, codebook } from './dispatch.mjs';
import { citationFrom, cleanGazetteTitle, detectOrigin, HS_RE, keywordFrom, missingKind, parseDocRef, parseQuery, parseQuotedTariff, todayVN as today } from './parse.mjs';
import { L } from './render.mjs';
import { claudeVision } from './router.mjs';

// --- Tariff by explicit HS code ---------------------------------------------

/** Direct lookup when the message itself carries an HS code — no model in the path. */
export async function answerByHs(q, { showFooter = true } = {}) {
  let res;
  try {
    res = await tariffResponse(q.hs, q.origin, q.date);
  } catch {
    return { text: 'Không gọi được dịch vụ tra cứu. Thử lại sau nhé.', topic: 'tariff', tariff: null };
  }
  if (res.status === 404) {
    return {
      text: `Không tìm thấy thuế cho HS ${q.dotted} (ngày ${dmy(q.date)}). Có thể là dòng không mang thuế, dòng đặc biệt, hoặc ngoài dữ liệu đã nạp.`,
      topic: 'tariff',
      tariff: null,
    };
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error(`[tariff] ${res.status} ${body.message ?? ''}`); // the API message is English and technical: log it, never show it
    return { text: `Mình chưa tra được mã ${q.dotted}. Bạn kiểm tra lại mã (8 chữ số, ví dụ "8481.80.99 xuất xứ Trung Quốc") nhé.`, topic: 'tariff', tariff: null };
  }
  const data = await res.json();
  const confirm = await confirmations(q.hs, q.origin);
  return {
    // The tariff block writes its own lead from data (spec §5b.2): no LLM lead here.
    text: formatAnswer(q, data, confirm, { showFooter }),
    topic: 'tariff',
    tariff: stampTariff({ hs: q.hs, dotted: q.dotted, origin: q.origin, date: q.date, snapshot: data }),
  };
}

// --- Tariff from clues (keywords + candidate headings) -----------------------

const grp4 = (hs) => String(hs).replace(/\./g, '').slice(0, 4);
const dot4 = (g) => `${g.slice(0, 2)}.${g.slice(2, 4)}`;
/** The first (best-ranked) line of each 4-digit heading. */
const perHeading = (cands) => cands.filter((c, i) => cands.findIndex((x) => grp4(x.hs) === grp4(c.hs)) === i);
const tail = (c) => (c.path || '').split(' › ').slice(-2).join(' › ');

/** Candidate lines for a description: the model's headings first (its rank order), then keyword search. */
async function gatherCandidates(clues, text) {
  const origin = clues?.origin || detectOrigin(String(text || '').toLowerCase());
  const date = clues?.date || today();
  const seen = new Set();
  const cands = [];
  const add = (list) => {
    for (const c of list || []) if (!seen.has(c.hs)) { seen.add(c.hs); cands.push(c); }
  };
  for (const p of clues?.hsHints || []) add(await searchByPrefix(p));
  const keywords = (clues?.keywords?.length ? clues.keywords : [keywordFrom(text, origin)]).filter((k) => k && k.length >= 2);
  for (const kw of keywords) {
    let l = await searchGoods(kw);
    if (!l.length && /\s/.test(kw)) {
      for (const w of kw.split(/\s+/).filter((w) => w.length >= 2)) { l = await searchGoods(w); if (l.length) break; }
    }
    add(l);
  }
  return { origin, date, cands, keywords };
}

/** Đường TẤT ĐỊNH: từ gợi ý (từ khoá + nhóm HS) → tra DB → thuế mã khả dĩ nhất + mã thay thế. */
export async function tariffByClues(clues, text, { showFooter = true } = {}) {
  const { origin, date, cands, keywords } = await gatherCandidates(clues, text);

  if (!cands.length) {
    return {
      text: [
        L([
          'Mình chưa tìm được mã HS phù hợp',
          ...(keywords.length ? [' cho ', [keywords.join(', '), 'i']] : []),
          '. Bạn mô tả rõ hơn (chất liệu, công dụng) hoặc gõ thẳng mã HS nhé.',
        ]),
      ],
      topic: 'tariff',
      tariff: null,
    };
  }

  // Chữ ký sản phẩm để (a) tra ruling đã xác nhận, (b) đính kèm khi có đính chính sau này.
  const productKw = (clues?.keywords?.length ? clues.keywords : keywords).filter((k) => k && k.length >= 2).slice(0, 6);
  // `note` is LLM text: it passes the prose gate before it is shown or stored; rejected → keywords.
  const desc = (sanitizeLead(clues?.note, '') || productKw.join(', ') || text).replace(/\s+/g, ' ').trim().slice(0, 300);

  // Một ÁP MÃ đã được con người xác nhận cho hàng tương tự > phỏng đoán của LLM (verify-on-use).
  // Ngưỡng thích nghi: cụm nhiều token cần ≥2 token khớp (chống một từ chung promote nhầm);
  // tên 1-token cho phép khớp 1. CHỈ ưu tiên lại mã đã có trong ứng viên tra ra của CHÍNH hàng
  // này — không chèn mã lạ, để một ruling cũ không kéo mã không liên quan lên đầu.
  const qTokenCount = new Set(productKw.join(' ').toLowerCase().split(/[,\s]+/).map((s) => s.trim()).filter((s) => s.length >= 2)).size;
  const need = Math.min(2, qTokenCount || 1);
  let citedRuling = null;
  for (const r of await confirmationsMatch(productKw)) {
    if ((r.score || 0) < need) continue;
    const rhs = String(r.hs).replace(/\D/g, '');
    if (rhs.length !== 8) continue;
    const idx = cands.findIndex((c) => c.hs === rhs);
    if (idx < 0) continue; // mã ruling không nằm trong kết quả tra của hàng này → không phải bằng chứng nó áp cho hàng này
    if (idx > 0) cands.unshift(cands.splice(idx, 1)[0]);
    citedRuling = { dotted: `${rhs.slice(0, 4)}.${rhs.slice(4, 6)}.${rhs.slice(6, 8)}`, note: r.note, staffName: r.staffName };
    break;
  }

  const reps = perHeading(cands);
  // RANH GIỚI theo THỨ HẠNG của LLM: 2 gợi ý ĐẦU rơi khác nhóm 4 số ⇒ mô hình thực sự phân vân.
  // Prompt cố tình liệt kê nhóm cạnh tranh ở HẠNG THẤP để MỞ RỘNG tra DB — sự có mặt của chúng
  // KHÔNG phải bằng chứng ranh giới (nếu không "van bi" cũng kèm 7307/7318 sẽ nổ cờ oan). Độc lập
  // với ruling: kể cả khi có ÁP MÃ vẫn báo hàng nghiêng nhiều nhóm để không bị một ruling cũ "chốt" thay.
  const hintGroups = (clues?.hsHints || []).map(grp4).filter(Boolean);
  const borderline = hintGroups.length ? new Set(hintGroups.slice(0, 2)).size >= 2 : reps.length >= 2;

  const top = cands[0];
  const full = await lookupFull(top.hsDotted, origin, date);
  const confirm = full ? await confirmations(top.hsDotted, origin) : null;
  // /tariff/search prices MFN at Postgres CURRENT_DATE (UTC): print it only when that is the lookup date (R8).
  // ponytail: between 00:00 and 07:00 Vietnam time the menus show "—"; pass the date to /tariff/search if that matters.
  const mfnOf = (c) => (date === new Date().toISOString().slice(0, 10) && c.mfn != null ? `${Number(c.mfn)}%` : '—');
  const menu = (c) => L([[c.hsDotted, 'b'], ' · MFN ', [mfnOf(c), 'b'], ' · ', [tail(c), 'i']], 'ul');

  // R2: always said, and the LLM lead can only stand above it. The lead is gated with no block, so it names no
  // code: "thuộc mã 7307.99.90" above the candidates reads as settled, and a quoted "sai" would hit that code.
  const said = 'mình tra được các mã ứng viên dưới đây — đây là ứng viên để bạn chốt, chưa phải mã đã xác định.';
  const lines = [L(desc ? ['Với mô tả ', [desc, 'i'], `, ${said}`] : [said[0].toUpperCase() + said.slice(1)])];
  if (citedRuling) {
    const cite = String(citedRuling.note || '').replace(/\s+/g, ' ').trim().slice(0, 90);
    lines.push(L(['Mã ', [citedRuling.dotted, 'b'], ' đã được ', [citedRuling.staffName, 'b'], ` xác nhận cho hàng tương tự${cite ? ` (${cite})` : ''} — mình ưu tiên mã này, bạn vẫn đối chiếu căn cứ.`]));
    if (borderline) lines.push(L(['Mặt hàng có thể thuộc nhiều nhóm; mã trên là mã đã được người xác nhận, không phải bot tự suy.'], 'note'));
  }

  if (borderline && !citedRuling) {
    // Three candidates side by side, none looking settled: no FTA block, no rate lead of its own.
    const top3 = [top, ...reps.filter((c) => c.hs !== top.hs).slice(0, 2)];
    lines.push(
      L(['Mặt hàng có thể thuộc nhiều nhóm — cần bạn hoặc chuyên viên chốt mã (kèm số công văn nếu có) trước khi khai.'], 'warn'),
      ...top3.map((c) => L([[c.hsDotted, 'b'], ' · ', [cleanGazetteTitle('', c.heading || tail(c), 50), 'i'], ' · MFN ', [mfnOf(c), 'b']], 'ul')),
      L([]),
      ...(full?.staleness?.warning ? [L([full.staleness.warning], 'warn')] : []),
      L([`Tra theo ngày ${dmy(date)} · MFN theo Biểu thuế nhập khẩu ưu đãi đã nạp${full?.import?.mfn ? ` (mã đầu: NĐ ${full.import.mfn.decree})` : ''}`], 'note'),
      // A human verdict on the top code (R18) matters most where the code is least settled.
      ...[confirmFooter(confirm)].filter(Boolean),
      L(['Nhắn mã bạn chốt (kèm xuất xứ) để mình tra đủ thuế ưu đãi, hoặc nhắn "HS đúng là <mã>" (kèm số công văn nếu có) để mình ghi nhận cho lần sau.'], 'note'),
    );
  } else {
    lines.push(
      ...(full
        ? formatAnswer({ dotted: top.hsDotted, origin, date }, full, confirm, { showFooter: false, candidate: true })
        : [L(['Chưa có dòng thuế hiệu lực cho ', [top.hsDotted, 'b'], ` tại ngày ${dmy(date)} — ${top.path}.`])]),
    );
    if (citedRuling && borderline) {
      lines.push(L(['Các nhóm ứng viên khác:']), ...reps.filter((c) => c.hs !== top.hs).slice(0, 2).map(menu));
    } else if (!borderline && cands.length > 1) {
      lines.push(L(['Nếu chưa đúng loại hàng, bạn chọn mã khác:']), ...cands.slice(1, 6).map(menu));
    }
    lines.push(
      L(
        [citedRuling
          ? 'Nếu mã đã xác nhận trên chưa đúng cho lô này, nhắn "HS đúng là <mã>" (kèm số công văn).'
          : 'Chốt mã đúng: nhắn "HS đúng là <mã>" (kèm số công văn nếu có) để mình ghi nhận cho lần sau.'],
        'note',
      ),
    );
  }

  const tariff =
    full || citedRuling
      ? stampTariff({ hs: top.hsDotted.replace(/\./g, ''), dotted: top.hsDotted, origin, date, snapshot: full || null, desc, keywords: productKw })
      : null;
  return { text: withLead(sanitizeLead(clues?.lead, ''), lines), topic: 'tariff', tariff };
}

// --- "Mã này dùng được không" -------------------------------------------------

/**
 * The user named a code for goods they described and asks whether it fits. Their code never reaches a prompt (R4):
 * the router read the message with the code masked, the candidate headings come from the description, and the
 * reasoning is /legal reading the notes of those headings. The code meets both only here, in code.
 */
export async function answerCodeCheck(q, clues, text) {
  const plain = codebook().mask(text).replace(CODE_MARK, ' ');
  // No description from the router: a keyword search on "được không" lists headings about nothing.
  const described = Boolean(clues?.hsHints?.length || clues?.keywords?.length);
  const { origin, date, cands } = described ? await gatherCandidates(clues, plain) : { origin: null, date: clues?.date || today(), cands: [] };
  const own = grp4(q.hs);
  // The router's rank order is not stable run to run (30.05 first, then fourth, for the same message): compare with six
  // headings, show three plus the user's own when it is among them.
  const wide = perHeading(cands).slice(0, 6);
  const mineAt = wide.findIndex((c) => grp4(c.hs) === own);
  const heads = [...wide.slice(0, 3), ...(mineAt >= 3 ? [wide[mineAt]] : [])];
  // The headings shown, plus the user's own heading as one more to tell apart — unlabelled, after the router ranked
  // blind: R4's "comparison target", so the reasoning can say why 30.05 fits or not even when a run left it out.
  const groups = [...new Set([...heads.map((c) => grp4(c.hs)), own])];
  const ask = String(clues?.searchQuery || '').replace(CODE_MARK, '').trim() || `Căn cứ phân loại mã HS cho: ${plain.trim()}`;
  // Criteria, not a verdict: from "miếng dán bàn chân ngải cứu" alone one run concluded "phải xét vào 38.24" (R2, R5).
  const query = `${ask} Các nhóm ứng viên cần phân biệt: ${groups.map(dot4).join(', ')}. Nêu tiêu chí phân biệt theo chú giải và dữ kiện nào của hàng quyết định nhóm; mô tả chưa đủ dữ kiện thì không chốt nhóm.`;
  const [mine, legal] = await Promise.all([
    lookupFull(q.dotted, q.origin ?? origin, q.date),
    heads.length ? legalAnswer(query, { asOf: date }) : null,
  ]);

  const lines = [];
  if (!heads.length) {
    lines.push(L(['Mình chưa tìm được nhóm ứng viên nào từ mô tả để đối chiếu với mã ', [q.dotted, 'b'], '. Bạn cho thêm thành phần, chất liệu, công dụng của hàng nhé.']));
  } else if (mineAt >= 0) {
    lines.push(L(['Mã ', [q.dotted, 'b'], ' bạn tham khảo thuộc nhóm ', [dot4(own), 'b'], ', trùng một nhóm ứng viên mình tra từ mô tả hàng — mới khớp ở cấp nhóm 4 số; hàng vào nhóm nào, phân nhóm nào còn tùy đặc điểm của nó, xem phần căn cứ bên dưới trước khi chốt.']));
  } else {
    // Not orange: the candidates are a model's ranking and move run to run, so their absence is no finding.
    lines.push(L(['Mã ', [q.dotted, 'b'], ' thuộc nhóm ', [dot4(own), 'b'], ', chưa nằm trong các nhóm mình tra từ mô tả hàng.']));
  }
  lines.push(
    mine?.goods?.path
      ? L(['Danh mục mô tả mã này: ', [cleanGazetteTitle('', mine.goods.path, 320), 'i']])
      : L(['Mình chưa tra được mã ', [q.dotted, 'b'], ' trong biểu đã nạp — bạn kiểm tra lại mã giúp mình.']),
  );
  if (heads.length) {
    lines.push(
      L(['Nhóm ứng viên theo mô tả hàng:']),
      ...heads.map((c) =>
        L([[dot4(grp4(c.hs)), 'b'], ' · ', [cleanGazetteTitle('', c.heading || tail(c), 70), 'i'], grp4(c.hs) === own ? ' (nhóm của mã bạn tham khảo)' : ''], 'ul'),
      ),
    );
  }
  lines.push(L([]));
  // Without prose (the model timed out or is down) only the HS notes go out verbatim: the statute clauses retrieved
  // beside them (labelling rules, "phân loại theo hồ sơ") are noise to someone comparing headings.
  const notes = legal?.answer ? legal.citations ?? [] : (legal?.citations ?? []).filter((c) => ['en', 'hs_note', 'sen'].includes(c.kind));
  if (notes.length) {
    lines.push(L([['Căn cứ phân loại', 'b']]), ...formatLegal({ ...legal, citations: notes }));
  } else if (heads.length) {
    lines.push(L(['Mình chưa tìm được chú giải đủ căn cứ để giải thích — bạn đối chiếu Chú giải chương và Chú giải chi tiết của các nhóm trên trước khi chốt.'], 'note'));
  }
  lines.push(L([`Đây là gợi ý để đối chiếu, chưa phải mã đã xác định; cần chắc chắn trước khi khai thì đề nghị hải quan xác định trước mã số. Muốn xem thuế, nhắn "thuế ${q.dotted} xuất xứ <nước>".`], 'note'));

  const grounded = Boolean(legal?.answer && legal.citations?.length);
  return {
    // No router lead: it is written before any evidence and can pass the gate saying "mã này phù hợp" (R2).
    text: lines,
    // A "sai" after this disputes the reasoning: it must never reach the trail as "the user's code is wrong" (R13).
    topic: 'legal',
    // Not remembered: "mã HS vừa tra: 3005.10.10 (miếng dán ngải cứu)" in the next prompt is the premise R4 forbids.
    tariff: null,
    legal: grounded
      ? {
          // The description-only question: the heading list would carry the user's heading into the next router prompt (R4).
          query: ask,
          asOf: legal.asOf ?? null,
          docNumbers: [...new Set(legal.citations.map((c) => c.documentNumber))],
          citations: legal.citations.slice(0, 3).map((c) => ({ documentNumber: c.documentNumber, provisionLabel: c.provisionLabel })),
          missingDoc: null,
        }
      : null,
  };
}

// --- Legal -------------------------------------------------------------------

/**
 * Grounded legal answer. Three distinct outcomes, and telling them apart is the point:
 *   - the corpus does not HOLD the document the user named → say which documents it holds
 *   - the corpus holds it but nothing in it answers the question → say that
 *   - an answer, with verbatim provisions
 *
 * The first case used to be silently collapsed into "chưa tổng hợp được câu trả lời",
 * which reads as the bot failing rather than the question being out of scope.
 */
export async function answerLegal(query, { asOf, doc, article, clause, lead } = {}) {
  const ref = parseDocRef(doc || '') ?? (() => { const r = parseDocRef(query); return r?.confident ? r : null; })();

  // The full number when the user wrote one: the API then matches that ONE document (69/2018 bug), and for
  // a document it does not hold it answers `missingDoc` with what the Công báo catalogue knows.
  const r = await legalAnswer(query, { asOf, doc: ref ? (ref.full ?? ref.core) : undefined, article });
  if (r?.missingDoc) return missingDocAnswer(query, r.missingDoc, r, r.asOf ?? asOf);

  if (!r || r.abstained || !(r.citations || []).length) {
    // A named Điều that retrieval could not ground is still fetchable verbatim —
    // "cho tôi Điều 18" is a lookup, and the text either exists or it does not.
    if (ref && article) {
      const rows = await legalProvision(ref.full ?? ref.core, article, clause);
      if (rows?.length) {
        return {
          text: withLead(lead, formatProvisions(rows)),
          topic: 'legal',
          legal: {
            query,
            asOf: asOf ?? null,
            docNumbers: [rows[0].documentNumber],
            citations: rows.slice(0, 3).map((p) => ({ documentNumber: p.documentNumber, provisionLabel: p.citationLabel })),
          },
        };
      }
    }
    // No answer from the API is not "nothing found": neither the corpus nor the Công báo catalogue was consulted.
    if (!r) return { text: 'Không gọi được dịch vụ tra cứu văn bản. Thử lại sau nhé.', topic: 'legal', legal: null };
    // The API reason is shown only when it passes the same gate as LLM prose (it can be model text).
    const reason = sanitizeLead(r?.reason, '');
    return {
      text: [
        L(['Mình chưa tìm thấy điều khoản đủ căn cứ trong ', ref ? [ref.label, 'b'] : 'các văn bản mình đang có', ' nên chưa trả lời, để tránh sai.']),
        ...(reason ? [L([`Lý do: ${reason}`], 'note')] : []),
        L(['Nếu bạn biết số hiệu văn bản, nhắn số hiệu để mình tìm trên Công báo và nạp về.']),
      ],
      topic: 'legal',
      legal: { query, asOf: r?.asOf ?? null, missingDoc: null },
    };
  }

  return {
    text: formatLegal(r),
    topic: 'legal',
    legal: {
      query,
      asOf: r.asOf ?? null,
      docNumbers: [...new Set((r.citations || []).map((c) => c.documentNumber))],
      citations: (r.citations || []).slice(0, 3).map((c) => ({ documentNumber: c.documentNumber, provisionLabel: c.provisionLabel })),
      missingDoc: null,
    },
  };
}

/**
 * Answer for a document we do not hold, carrying whatever the gazette catalogue knows.
 * `pendingIngest` is what lets the next turn act on "nạp" — the offer and the thing
 * being offered have to survive between messages, which is what conversation memory is for.
 */
function missingDocAnswer(query, label, apiAnswer, asOf) {
  // A catalogue hit equal to the number asked for IS that document: offer it, never list it as another one.
  const { kind, matches } = missingKind(label, apiAnswer?.gazetteMatches ?? [], apiAnswer?.gazetteMatchKind ?? 'none');
  // Only an EXACT catalogue hit may be offered for ingest. A near-miss by number is a
  // different document, and an ambiguous year is a question for the user — fetching
  // either would answer something nobody asked.
  const hit = kind === 'exact' ? (matches[0] ?? null) : null;
  return {
    text: formatMissingDoc(label, matches, kind),
    topic: 'legal',
    legal: {
      query,
      asOf: asOf ?? null,
      missingDoc: label,
      pendingIngest: hit ? { number: hit.number, title: hit.title, sourceUrl: hit.sourceUrl } : null,
    },
  };
}

// --- Verify-on-use: confirm / correct ---------------------------------------

/** Record a one-word verdict against the tariff result still on the table. */
export async function handleConfirm(tariff, verdict, senderName) {
  if (!tariff?.hs) {
    return {
      text: 'Mình chưa có kết quả tra cứu gần đây của bạn để xác nhận. Bạn tra mã HS hoặc tên hàng trước, rồi trả lời "đúng", "sai" hoặc "không chắc" nhé.',
      topic: 'tariff',
    };
  }
  // KHÔNG gửi note ở đây: một cú "đúng" chỉ là ĐỒNG Ý với phỏng đoán của bot, KHÔNG phải
  // ÁP MÃ của con người. note=null → matchByProduct loại (chỉ ruling do người GÕ MÃ mới promote được).
  const ok = await postConfirm({
    hs: tariff.hs,
    origin: tariff.origin || null,
    date: tariff.date,
    verdict,
    staffName: senderName,
    snapshot: tariff.snapshot,
  });
  if (!ok) return { text: 'Ghi nhận xác nhận bị lỗi, thử lại sau nhé.', topic: 'tariff' };
  const label = verdict === 'correct' ? 'đúng' : verdict === 'wrong' ? 'sai' : 'chưa chắc';
  return {
    text: [L(['Đã ghi nhận ', [label, 'b'], ' cho mã ', [tariff.dotted, 'b'], ` (${tariff.origin ? `xuất xứ ${tariff.origin}, ` : ''}ngày ${dmy(tariff.date)}). Cảm ơn ${senderName}.`])],
    topic: 'tariff',
  };
}

/**
 * Staff adjust a recent tariff answer ("sai, HS đúng là …"). Distinct from the one-word
 * confirm: it carries a NEW HS and/or a corrected description. Rather than mechanically
 * re-looking-up the number, RECORD it into the verify-on-use trail (old HS = wrong, with
 * the staff's citation), then look the corrected code up.
 *
 * Only reachable when the conversation is actually ABOUT a tariff result — see dispatch.mjs.
 */
export async function handleCorrection(tariff, text, senderName, quote) {
  // Mã CŨ (bị coi là sai): ưu tiên kết quả đã nhớ; nếu hết hạn thì lấy lại từ tin được quote.
  const old = tariff?.hs
    ? { hs: tariff.hs, dotted: tariff.dotted, origin: tariff.origin, date: tariff.date, snapshot: tariff.snapshot }
    : parseQuotedTariff(quote?.msg);
  const fix = parseQuery(text); // mã đúng người dùng đưa ra (nếu có)
  const now = today();
  // Mô tả hàng đã lưu từ lần phân loại trước — để đính vào bản ghi 'correct' cho mã đúng,
  // nhờ đó lần sau tra hàng TƯƠNG TỰ mới khớp lại được (matchByProduct).
  const prodDesc = String(tariff?.desc || '').replace(/\s+/g, ' ').trim();
  const prevKw = Array.isArray(tariff?.keywords) ? tariff.keywords : [];
  // note LƯU vào sổ = MÔ TẢ SẢN PHẨM + SỐ CĂN CỨ (công văn). KHÔNG lưu free-text lời sửa
  // (có thể chứa tên/SĐT/số lô của khách) vì note bị khớp mờ + echo chéo ngữ cảnh.
  const rulingNote = [prodDesc, citationFrom(text)].filter(Boolean).join(' | ').slice(0, 300) || null;

  // The same code confirms only after a confirming word ("đúng là 8481.80.99"): "8481.80.99 có sai không" names it too,
  // and is a doubt, not a ruling (R13). Unclear → ask, write nothing.
  const lower = String(text || '').toLowerCase().normalize('NFC');
  const cued = /(đúng là|dung la|mã đúng|ma dung|hs đúng|hs dung|chính xác là|chuẩn là)\s*(là|:)?\s*(mã\s*)?$/.test(lower.slice(0, Math.max(0, lower.search(HS_RE))));
  if (fix && old?.hs && fix.hs === old.hs && !cued) {
    return {
      text: [L(['Bạn muốn xác nhận mã ', [old.dotted, 'b'], ' là đúng, hay đang hỏi mã này có hợp với hàng không? Nhắn "đúng" để xác nhận, hoặc mô tả hàng để mình đối chiếu nhé.'])],
      topic: 'tariff',
    };
  }
  // "đúng là <mã cũ>" = XÁC NHẬN (người GÕ MÃ) → ghi correct KÈM mô tả để tra lại được.
  if (fix && old?.hs && fix.hs === old.hs) {
    await postConfirm({ hs: old.hs, origin: old.origin || null, date: old.date || now, verdict: 'correct', staffName: senderName, note: rulingNote, snapshot: old.snapshot || null });
    return {
      text: [L(['Đã xác nhận mã ', [old.dotted, 'b'], `${old.origin ? ` (xuất xứ ${old.origin})` : ''} là đúng. Cảm ơn ${senderName}.`])],
      topic: 'tariff',
      tariff: tariff?.hs ? stampTariff({ ...old, desc: prodDesc || undefined, keywords: prevKw }) : null,
    };
  }

  if (old?.hs) {
    await postConfirm({ hs: old.hs, origin: old.origin || null, date: old.date || now, verdict: 'wrong', staffName: senderName, note: rulingNote, snapshot: old.snapshot || null });
  }

  if (!fix) {
    return {
      text: [L(['Đã ghi nhận: mã ', old?.dotted ? [old.dotted, 'b'] : 'trước', ` chưa đúng (theo ${senderName}). Bạn gửi mã HS đúng, hoặc mô tả hay ảnh mặt hàng để mình tra lại nhé.`])],
      topic: 'tariff',
      tariff: null,
    };
  }

  // Tra mã đúng. Xuất xứ chỉ lấy khi lời sửa nêu rõ (không kéo theo xuất xứ cũ có thể sai).
  const origin = detectOrigin(text);
  const head = L([`Đã ghi nhận đính chính từ ${senderName}: mã `, ...(old?.dotted ? [[old.dotted, 'b'], ' '] : []), 'chưa đúng, sửa thành ', [fix.dotted, 'b'], '.']);
  const res = await tariffResponse(fix.hs, origin, fix.date);
  if (!res.ok) {
    const why = res.status === 404 ? 'không có trong dữ liệu đã nạp' : `lỗi ${res.status}`;
    return { text: [head, L(['Nhưng mình chưa tra được thuế cho ', [fix.dotted, 'b'], ` (${why}). Bạn kiểm tra lại mã giúp mình nhé.`])], topic: 'tariff', tariff: null };
  }
  const data = await res.json();
  // Ghi mã ĐÚNG = 'correct' KÈM mô tả sản phẩm + số căn cứ (rulingNote, đã lọc PII) → tra lại được sau này.
  await postConfirm({ hs: fix.hs, origin: origin || null, date: fix.date, verdict: 'correct', staffName: senderName, note: rulingNote, snapshot: data });
  const confirm = await confirmations(fix.hs, origin);
  return {
    text: [head, L([]), ...formatAnswer({ dotted: fix.dotted, origin, date: fix.date }, data, confirm)],
    topic: 'tariff',
    tariff: stampTariff({ hs: fix.hs, dotted: fix.dotted, origin, date: fix.date, snapshot: data, desc: prodDesc || undefined, keywords: prevKw }),
  };
}

// --- Image --------------------------------------------------------------------

/** A photo caption as vision may read it: no code or heading the user typed, so it cannot seed the heading guesses (R4). */
export const captionForVision = (caption) => codebook().mask(caption).replace(CODE_MARK, ' ').replace(/\s+/g, ' ').trim();

/** Answer a photo message: download → vision-identify → deterministic tariff lookup. */
export async function answerImage(imageUrls, caption) {
  const file = await downloadImage(imageUrls);
  if (!file) {
    return {
      text: 'Mình chưa tải được ảnh. Bạn gửi lại, hoặc mô tả mặt hàng bằng chữ (tên hàng + xuất xứ) giúp mình nhé.',
      topic: 'tariff',
      tariff: null,
    };
  }
  try {
    const clues = await claudeVision(file, captionForVision(caption), VISION_DIR);
    if (!clues || (!clues.keywords.length && !clues.hsHints.length)) {
      return {
        text: 'Mình chưa nhận ra mặt hàng trong ảnh. Bạn mô tả bằng chữ (tên hàng + chất liệu + công dụng) kèm xuất xứ giúp mình nhé.',
        topic: 'tariff',
        tariff: null,
      };
    }
    // The note is LLM text: gate it here, so no fallback (keywords, desc, no-candidates line) can echo it (R1).
    return await tariffByClues(clues, [caption, sanitizeLead(clues.note, '')].filter(Boolean).join(' '));
  } finally {
    try { unlinkSync(file); } catch { /* ignore */ }
  }
}
