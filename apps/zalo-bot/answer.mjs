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

import { confirmations, confirmationsMatch, lookupFull, postConfirm, searchByPrefix, searchGoods, tariffResponse } from './api.mjs';
import { stampTariff } from './conversation.mjs';
import { confirmFooter, dmy, formatAnswer, rulingLine, sanitizeLead } from './format.mjs';
import { downloadImage, VISION_DIR } from './images.mjs';
import { ruling } from './dispatch.mjs';
import { citationFrom, cleanGazetteTitle, detectOrigin, HS_RE, keywordFrom, ORIGIN_LABEL, parseQuery, parseQuotedTariff, todayVN as today } from './parse.mjs';
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
    confirm, // for a caller that prints this lookup under prose (formatAnswerMd tariff mode)
  };
}

// --- Tariff from clues (keywords + candidate headings) -----------------------

const grp4 = (hs) => String(hs).replace(/\./g, '').slice(0, 4);
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
  const desc = (sanitizeLead(clues?.note, '') || productKw.join(', ')).replace(/\s+/g, ' ').trim().slice(0, 300);

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
  // Three candidates side by side, none looking settled: no FTA block, no rate lead of its own.
  const top3 = [top, ...reps.filter((c) => c.hs !== top.hs).slice(0, 2)];
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
    lines.push(rulingLine(citedRuling));
    if (borderline) lines.push(L(['Mặt hàng có thể thuộc nhiều nhóm; mã trên là mã đã được người xác nhận, không phải bot tự suy.'], 'note'));
  }

  if (borderline && !citedRuling) {
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

  // Three codes side by side are candidates, not a lookup: a "đúng" names no code, and "HS đúng là <the second>" must not record the
  // first as wrong (round 4).
  const tariff =
    borderline && !citedRuling
      ? stampTariff({ hs: null, candidates: top3.map((c) => c.hsDotted), desc, keywords: productKw })
      : full || citedRuling
        ? stampTariff({ hs: top.hsDotted.replace(/\./g, ''), dotted: top.hsDotted, origin, date, snapshot: full || null, desc, keywords: productKw })
        : null;
  return { text: lines, topic: 'tariff', tariff };
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
  // Sending the same word again writes it; the opposite word, or "ok" as thanks, must not (R13).
  if (!ok) return { text: 'Ghi nhận xác nhận bị lỗi, thử lại sau nhé.', topic: 'tariff', tariff: { ...tariff, open: verdict } };
  const label = verdict === 'correct' ? 'đúng' : verdict === 'wrong' ? 'sai' : 'chưa chắc';
  return {
    text: [L(['Đã ghi nhận ', [label, 'b'], ' cho mã ', [tariff.dotted, 'b'], ` (${tariff.origin ? `xuất xứ ${tariff.origin}, ` : ''}ngày ${dmy(tariff.date)}). Cảm ơn ${senderName}.`])],
    topic: 'tariff',
    // Ruled: no second verdict on this table, quoting the lookup or after an offer (R13).
    tariff: { ...tariff, open: false, ruled: true },
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
  // After a composed hs reply there is none: its codes are candidates or the user's own, and neither is ever recorded as
  // wrong (plan 08 §6.3).
  const candidates = !tariff?.hs && Boolean(tariff?.candidates?.length);
  const old = tariff?.hs
    ? { hs: tariff.hs, dotted: tariff.dotted, origin: tariff.origin, date: tariff.date, snapshot: tariff.snapshot }
    : candidates ? null : parseQuotedTariff(quote?.msg);
  const fix = parseQuery(text); // mã đúng người dùng đưa ra (nếu có)
  const now = today();
  // Mô tả hàng đã lưu từ lần phân loại trước — để đính vào bản ghi 'correct' cho mã đúng,
  // nhờ đó lần sau tra hàng TƯƠNG TỰ mới khớp lại được (matchByProduct).
  const prodDesc = String(tariff?.desc || '').replace(/\s+/g, ' ').trim();
  const prevKw = Array.isArray(tariff?.keywords) ? tariff.keywords : [];
  // note LƯU vào sổ = MÔ TẢ SẢN PHẨM + SỐ CĂN CỨ (công văn). KHÔNG lưu free-text lời sửa
  // (có thể chứa tên/SĐT/số lô của khách) vì note bị khớp mờ + echo chéo ngữ cảnh.
  const rulingNote = [prodDesc, citationFrom(text)].filter(Boolean).join(' | ').slice(0, 300) || null;

  // The same code confirms only as the ledger's form ("HS đúng là 8481.80.99"): "8481.80.99 có sai không" names it too,
  // and is a doubt, not a ruling (R13). Unclear → ask, write nothing.
  const cued = Boolean(ruling(text)?.coded);
  if (fix && old?.hs && fix.hs === old.hs && !cued) {
    return {
      text: [L(['Bạn muốn xác nhận mã ', [old.dotted, 'b'], ' là đúng, hay đang hỏi mã này có hợp với hàng không? Nhắn "đúng" để xác nhận, hoặc mô tả hàng để mình đối chiếu nhé.'])],
      topic: 'tariff',
    };
  }
  // The origin a ruling names is the origin of the goods ruled on, and later staff read confirmations by code and origin (R18):
  // "HS đúng là 8481.80.99 xuất xứ Nhật Bản" after the TQ lookup wrote CN, after a lookup with no origin none. The code in memory
  // is recorded only when its lookup had that origin: look that origin up first.
  const origin = detectOrigin(text);
  if (old?.hs && origin && origin !== (old.origin || null)) {
    const country = ORIGIN_LABEL[origin] ?? origin;
    const looked = old.origin ? `với xuất xứ ${ORIGIN_LABEL[old.origin] ?? old.origin}` : 'không kèm xuất xứ';
    return {
      text: [L(['Mình chưa ghi nhận gì: mã ', [old.dotted, 'b'], ` vừa tra ${looked}, còn tin của bạn nêu xuất xứ ${country}. Bạn tra với xuất xứ đó trước (nhắn "${old.dotted} xuất xứ ${country}"), rồi nhắn lại nhé.`])],
      topic: 'tariff',
    };
  }

  // A reply never says a verdict was recorded unless the write succeeded (R13); a failed one keeps memory (no `tariff`
  // key), so the same message can be sent again.
  const failed = { text: 'Ghi nhận bị lỗi, bạn thử lại sau nhé.', topic: 'tariff' };
  const wrong = () => postConfirm({ hs: old.hs, origin: old.origin || null, date: old.date || now, verdict: 'wrong', staffName: senderName, note: rulingNote, snapshot: old.snapshot || null });

  // "đúng là <mã cũ>" = XÁC NHẬN (người GÕ MÃ) → ghi correct KÈM mô tả để tra lại được.
  if (fix && old?.hs && fix.hs === old.hs) {
    if (!(await postConfirm({ hs: old.hs, origin: old.origin || null, date: old.date || now, verdict: 'correct', staffName: senderName, note: rulingNote, snapshot: old.snapshot || null }))) return failed;
    return {
      text: [L(['Đã xác nhận mã ', [old.dotted, 'b'], `${old.origin ? ` (xuất xứ ${old.origin})` : ''} là đúng. Cảm ơn ${senderName}.`])],
      topic: 'tariff',
      // An acknowledgement is not the lookup: a "đúng"/"ok" after it thanks the reply, and the table takes no second ruling.
      tariff: tariff?.hs ? { ...stampTariff({ ...old, desc: prodDesc || undefined, keywords: prevKw }), open: false, ruled: true } : null,
    };
  }

  if (!fix) {
    if (!old?.hs || !(await wrong())) return tariff?.hs ? { ...failed, tariff: { ...tariff, open: 'wrong' } } : failed;
    return {
      text: [L(['Đã ghi nhận: mã ', [old.dotted, 'b'], ` chưa đúng (theo ${senderName}). Bạn gửi mã HS đúng, hoặc mô tả hay ảnh mặt hàng để mình tra lại nhé.`])],
      topic: 'tariff',
      tariff: null,
    };
  }

  // Tra mã đúng TRƯỚC khi ghi: mã không tra được thì không ghi dòng nào, kể cả dòng 'wrong' của mã cũ, và nói rõ là chưa ghi.
  // Xuất xứ chỉ lấy khi lời sửa nêu rõ (không kéo theo xuất xứ cũ có thể sai).
  const res = await tariffResponse(fix.hs, origin, fix.date).catch(() => null);
  if (!res?.ok) {
    const why = res?.status === 404 ? 'không có trong dữ liệu đã nạp' : 'chưa gọi được dịch vụ tra cứu';
    return { text: [L(['Mình chưa ghi nhận gì: chưa tra được mã ', [fix.dotted, 'b'], ` (${why}). Bạn kiểm tra lại mã rồi nhắn lại nhé.`])], topic: 'tariff' };
  }
  const data = await res.json();
  // Ghi mã ĐÚNG = 'correct' KÈM mô tả sản phẩm + số căn cứ (rulingNote, đã lọc PII) → tra lại được sau này.
  // 'correct' first: if it fails nothing is recorded and the same message can be sent again. A 'wrong' failing after it is said
  // as it is, and memory goes, so a resend cannot record the new code twice (R13).
  if (!(await postConfirm({ hs: fix.hs, origin: origin || null, date: fix.date, verdict: 'correct', staffName: senderName, note: rulingNote, snapshot: data }))) return failed;
  if (old?.hs && !(await wrong())) {
    return {
      text: [L(['Đã ghi nhận mã ', [fix.dotted, 'b'], ` là đúng (theo ${senderName}), nhưng chưa ghi được mã `, [old.dotted, 'b'], ' là chưa đúng vì lỗi ghi sổ. Mình dừng ghi cho lượt này để khỏi ghi trùng.'])],
      topic: 'tariff',
      tariff: null,
    };
  }
  const head = candidates
    ? L(['Đã ghi nhận mã ', [fix.dotted, 'b'], ...(prodDesc ? [' cho ', [prodDesc, 'i']] : []), ` (theo ${senderName}).`])
    : L([`Đã ghi nhận đính chính từ ${senderName}: mã `, ...(old?.dotted ? [[old.dotted, 'b'], ' '] : []), 'chưa đúng, sửa thành ', [fix.dotted, 'b'], '.']);
  const confirm = await confirmations(fix.hs, origin);
  return {
    text: [head, L([]), ...formatAnswer({ dotted: fix.dotted, origin, date: fix.date }, data, confirm)],
    topic: 'tariff',
    // The new code's block is shown, but its verdict was just recorded: a "đúng" after it thanks the reply (no second row).
    tariff: { ...stampTariff({ hs: fix.hs, dotted: fix.dotted, origin, date: fix.date, snapshot: data, desc: prodDesc || undefined, keywords: prevKw }), open: false, ruled: true },
  };
}

/**
 * A plan read a verdict with no confirming cue ("63079090 mới đúng"): an offer, never a write (plan 08 §6.3). It spells out
 * what would be recorded, so the ledger only gets a verdict the user typed on purpose. `fix`: the code in the message, or null.
 */
export async function codeOffer(tariff, fix) {
  // A table whose ruling was recorded takes no second one (R13): it is not reopened, and "chưa ghi nhận gì" would be untrue.
  if (tariff?.ruled) {
    // A candidates table has no code of its own: its ruling was for the goods (round 8).
    const ruled = tariff.dotted ? ['mã ', [tariff.dotted, 'b'], ' vừa rồi'] : ['hàng vừa hỏi'];
    return { text: [L(['Mình đã ghi nhận phán quyết cho ', ...ruled, ' nên không ghi thêm. Muốn ghi nhận khác, bạn tra lại mã rồi nhắn "đúng", "sai" hoặc "HS đúng là <mã>".'])] };
  }
  const desc = String(tariff?.desc || '').replace(/\s+/g, ' ').trim();
  const forDesc = desc ? [' cho ', [desc, 'i']] : [];
  if (!fix) {
    return {
      text: [
        L([
          'Mình chưa ghi nhận gì. Muốn ghi nhận mã đúng', ...forDesc, ', nhắn "HS đúng là <mã>" (kèm số công văn nếu có)',
          ...(tariff?.hs ? ['; mã ', [tariff.dotted, 'b'], ' vừa tra: đúng với lô hàng thì nhắn "đúng", chưa đúng thì nhắn "sai".'] : ['.']),
        ]),
      ],
      // It asks "đúng"/"sai" about the lookup, so it leaves that lookup open to them; nextState closes every other offer (R13).
      ...(tariff?.hs ? { tariff: { ...tariff, open: true } } : {}),
    };
  }
  const row = (await searchByPrefix(fix.hs)).find((c) => c.hs === fix.hs);
  const heading = row ? cleanGazetteTitle('', row.heading || tail(row), 50) : '';
  const named = ['Mã ', [fix.dotted, 'b'], ...(heading ? [' (', [heading, 'i'], ')'] : [])];
  const record = [...forDesc, `, nhắn "HS đúng là ${fix.dotted}". Cần thuế thì nhắn thêm xuất xứ.`];
  const cands = tariff?.candidates ?? [];
  // The API's test behind that reply's "nằm trong các nhóm dưới đây": a candidate under the code's heading, however deep.
  const inside = cands.some((c) => String(c).replace(/\D/g, '').startsWith(grp4(fix.hs)));
  // The candidates are named, so a quote of this offer shows which table it answers (dispatch.mjs fastPath).
  const said = cands.length
    ? [...named, ` ${inside ? 'nằm trong' : 'khác'} các nhóm ${cands.join(', ')} mình vừa nêu. Muốn mình ghi nhận mã này`, ...record]
    : tariff?.hs === fix.hs
      ? [...named, ' là mã vừa tra: đúng với lô hàng thì nhắn "đúng", chưa đúng thì nhắn "sai" hoặc "HS đúng là <mã>".']
      : tariff?.hs
        // "HS đúng là" on this thread also records the code just looked up as wrong: say so before it is sent.
        ? [...named, ' khác mã ', [tariff.dotted, 'b'], ' vừa tra. Muốn ghi nhận ', [tariff.dotted, 'b'], ' chưa đúng và ', [fix.dotted, 'b'], ' là mã đúng', ...record]
        : [...named, ': muốn mình ghi nhận mã này', ...record];
  // The form this offer spells out must work when sent: the table stays open to "HS đúng là …" ('coded'), not to a bare
  // "đúng"/"ok", which answers the offer. The same-code offer asks "đúng"/"sai" itself.
  const reopen = tariff?.hs === fix.hs ? true : tariff?.hs || cands.length ? 'coded' : null;
  return { text: [L(said)], ...(reopen ? { tariff: { ...tariff, open: reopen } } : {}) };
}

// --- Image --------------------------------------------------------------------

/**
 * Every spelling of a code or heading vision must not see: an 8-digit code; digits after a word naming one ("nhóm hàng 3005",
 * "mã số 30.05.10.10", "HS: 3005", "chương 30"); a dotted "3005.10" or "30.05" standing alone. Not a date ("ngày 30.05",
 * "14.09.2026"), an amount ("12.50%", "12.50 triệu") or a time ("08.30 sáng"). The typed path masks in the API (plan.ts
 * maskCodes); vision runs here, so the caption is stripped here.
 */
const HS_TOKEN = new RegExp(
  `${HS_RE.source}` +
    `|(?<=(?:nhóm(?:\\s*hàng)?|mã(?:\\s*số)?(?:\\s*hs)?|hs(?:\\s*code)?|chương)\\s*:?\\s*)\\d{2}(?:\\.?\\d{2}(?:\\.\\d{2}){0,2})?(?![\\d/])` +
    `|(?<![\\d.,/])\\d{4}\\.\\d{2}(?![\\d/%]|[.,]\\d)` +
    `|(?<![\\d.,/]|ngày\\s)\\d{2}\\.\\d{2}(?:\\.\\d{2}){0,2}(?![\\d/%]|[.,]\\d|\\s*(?:triệu|tỷ|đồng|usd|giờ|sáng|chiều|h(?![\\p{L}])))`,
  'giu',
);
/** A bare heading joined to one already struck out: "nhóm [mã] hay 3824", and a list "nhóm [mã] hoặc 3824, và 3926". */
const JOINED_HEADING = /(\[mã\](?:\s*(?:,|hay|hoặc|hoac|và|va|sang))+\s*)(\d{4})(?![\d/]|[.,]\d)/giu;

/** A photo caption as vision may read it: no code or heading the user typed, so it cannot seed the heading guesses (R4). */
export const captionForVision = (caption) => {
  // NFC first: Unikey's "Unicode tổ hợp" types "nhóm" decomposed, and the keyword lookbehind would miss it.
  let s = String(caption ?? '').normalize('NFC').replace(HS_TOKEN, '[mã]');
  for (let prev = ''; prev !== s; ) [prev, s] = [s, s.replace(JOINED_HEADING, (_, head) => `${head}[mã]`)];
  return s.replace(/\[mã\]/g, ' ').replace(/\s+/g, ' ').trim();
};

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
    // The note is LLM text: gate it here, so no fallback (keywords, desc, no-candidates line) can echo it (R1). The caption
    // goes masked too: with no vision keywords the search words, desc and ruling note come from this text (R4).
    return await tariffByClues(clues, [captionForVision(caption), sanitizeLead(clues.note, '')].filter(Boolean).join(' '));
  } finally {
    try { unlinkSync(file); } catch { /* ignore */ }
  }
}
