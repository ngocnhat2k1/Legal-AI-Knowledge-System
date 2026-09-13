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
  legalDocuments,
  legalProvision,
  lookupFull,
  postConfirm,
  searchByPrefix,
  searchGoods,
  tariffResponse,
} from './api.mjs';
import { stampTariff } from './conversation.mjs';
import { dmy, formatAnswer, formatLegal, formatMissingDoc, formatProvisions, sanitizeLead, withLead } from './format.mjs';
import { downloadImage, VISION_DIR } from './images.mjs';
import { citationFrom, cleanGazetteTitle, corpusHas, detectOrigin, keywordFrom, parseDocRef, parseQuery, parseQuotedTariff } from './parse.mjs';
import { L } from './render.mjs';
import { claudeVision } from './router.mjs';

const today = () => new Date().toISOString().slice(0, 10);

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
      text: `Không tìm thấy thuế cho HS ${q.dotted} (ngày ${q.date}). Có thể là dòng không mang thuế, dòng đặc biệt, hoặc ngoài dữ liệu đã nạp.`,
      topic: 'tariff',
      tariff: null,
    };
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { text: `Lỗi tra cứu: ${body.message || res.status}. Thử "8481.80.99 TQ".`, topic: 'tariff', tariff: null };
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

/** Đường TẤT ĐỊNH: từ gợi ý (từ khoá + nhóm HS) → tra DB → thuế mã khả dĩ nhất + mã thay thế. */
export async function tariffByClues(clues, text, { showFooter = true } = {}) {
  const lower = String(text || '').toLowerCase();
  const origin = clues?.origin || detectOrigin(lower);
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

  const grp4 = (hs) => String(hs).replace(/\./g, '').slice(0, 4);
  const reps = [];
  const repSeen = new Set();
  for (const c of cands) { const g = grp4(c.hs); if (!repSeen.has(g)) { repSeen.add(g); reps.push(c); } }
  // RANH GIỚI theo THỨ HẠNG của LLM: 2 gợi ý ĐẦU rơi khác nhóm 4 số ⇒ mô hình thực sự phân vân.
  // Prompt cố tình liệt kê nhóm cạnh tranh ở HẠNG THẤP để MỞ RỘNG tra DB — sự có mặt của chúng
  // KHÔNG phải bằng chứng ranh giới (nếu không "van bi" cũng kèm 7307/7318 sẽ nổ cờ oan). Độc lập
  // với ruling: kể cả khi có ÁP MÃ vẫn báo hàng nghiêng nhiều nhóm để không bị một ruling cũ "chốt" thay.
  const hintGroups = (clues?.hsHints || []).map(grp4).filter(Boolean);
  const borderline = hintGroups.length ? new Set(hintGroups.slice(0, 2)).size >= 2 : reps.length >= 2;

  const top = cands[0];
  const full = await lookupFull(top.hsDotted, origin, date);
  const confirm = full ? await confirmations(top.hsDotted, origin) : null;
  const tail = (c) => (c.path || '').split(' › ').slice(-2).join(' › ');
  const mfnOf = (c) => (c.mfn != null ? `${Number(c.mfn)}%` : '—');
  const menu = (c) => L([[c.hsDotted, 'b'], ' · MFN ', [mfnOf(c), 'b'], ' · ', [tail(c), 'i']], 'ul');

  // R2: always said, and the LLM lead can only stand above it — a lead naming the top code passes the gate.
  const lines = [L(['Với mô tả ', [desc, 'i'], ', mình tra được các mã ứng viên dưới đây — đây là ứng viên để bạn chốt, chưa phải mã đã xác định.'])];
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
  return { text: withLead(clues?.lead, lines), topic: 'tariff', tariff };
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
export async function answerLegal(query, { asOf, doc, article, clause, lead, showSourceNote = true } = {}) {
  const docs = await legalDocuments();
  const ref = parseDocRef(doc || '') ?? (() => { const r = parseDocRef(query); return r?.confident ? r : null; })();

  if (ref && !corpusHas(docs, ref)) {
    // Ask the API anyway: it is the side that can consult the Công báo catalogue, and
    // "we don't hold it" reads very differently with the document's real title attached.
    const probe = await legalAnswer(query, { asOf, doc: ref.core });
    return missingDocAnswer(query, ref.label, probe, asOf);
  }

  const r = await legalAnswer(query, { asOf, doc: ref?.core, article });
  if (r?.missingDoc) return missingDocAnswer(query, r.missingDoc, r, r.asOf ?? asOf);

  if (!r || r.abstained || !(r.citations || []).length) {
    // A named Điều that retrieval could not ground is still fetchable verbatim —
    // "cho tôi Điều 18" is a lookup, and the text either exists or it does not.
    if (ref && article) {
      const rows = await legalProvision(ref.core, article, clause);
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
    const where = ref ? ` trong ${ref.label}` : ' trong các văn bản đã nạp';
    return {
      text:
        `Mình không tìm thấy điều khoản đủ căn cứ${where}` +
        (r?.reason ? ` (${r.reason})` : '') +
        '. Bạn nêu SỐ HIỆU văn bản để mình nạp về tra giúp, hoặc nói rõ hơn phần muốn tìm.',
      topic: 'legal',
      legal: { query, asOf: r?.asOf ?? null, missingDoc: null },
    };
  }

  return {
    text: withLead(lead, formatLegal(r, { showSourceNote })),
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
  const matches = apiAnswer?.gazetteMatches ?? [];
  const kind = apiAnswer?.gazetteMatchKind ?? 'none';
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
      text: 'Mình chưa có kết quả tra cứu gần đây của bạn để xác nhận. Bạn tra MÃ HS hoặc TÊN HÀNG trước, rồi trả lời "đúng"/"sai"/"không chắc" nhé.',
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
  const label = verdict === 'correct' ? '✓ ĐÚNG' : verdict === 'wrong' ? '✗ SAI' : '? Không chắc';
  return {
    text: `Đã ghi nhận: ${label} cho HS ${tariff.dotted}${tariff.origin ? ` · ${tariff.origin}` : ''} (ngày ${tariff.date}). Cảm ơn ${senderName}.`,
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
    const clues = await claudeVision(file, caption, VISION_DIR);
    if (!clues || (!clues.keywords.length && !clues.hsHints.length)) {
      return {
        text: 'Mình chưa nhận ra mặt hàng trong ảnh. Bạn mô tả bằng chữ (tên hàng + chất liệu + công dụng) kèm xuất xứ giúp mình nhé.',
        topic: 'tariff',
        tariff: null,
      };
    }
    return await tariffByClues(clues, [caption, clues.note].filter(Boolean).join(' '));
  } finally {
    try { unlinkSync(file); } catch { /* ignore */ }
  }
}
