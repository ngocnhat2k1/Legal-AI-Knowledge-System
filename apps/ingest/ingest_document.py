"""Pull ONE legal document from Công báo into the corpus, on request.

    DATABASE_URL=… EMBEDDER_URL=… python3 ingest_document.py "36/2016/TT-BKHCN"

Flow: catalogue lookup → gazette metadata → download part(s) → parse → STRUCTURAL
GATE → chunk → embed → insert as `auto_unverified`.

The gate is the point of this file. For the hand-built corpus, correctness rested on
a human supplying the true chương/điều counts (`expect` in corpus.json); nobody can
supply that for a document nobody has read yet. So the gate checks the properties a
correct parse of ANY Vietnamese legal instrument must have, and every rule in it is a
failure that actually happened while building the corpus by hand — see
.agent/docs/legal-corpus-self-extension.md.

Nothing here decides whether a document is still in force. Công báo's own relation
data is incomplete (it reports NĐ 134/2016 as unamended when NĐ 18/2021 amends it),
so an ingested document is labelled `auto_unverified` and the bot says so when citing
it. Machine-fetched text never quietly acquires the standing of text a human read.
"""
from __future__ import annotations

import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'research', 'legal-loader'))
from build_chunks import build_chunks  # noqa: E402  (see apps/ingest/README)
from parse_provisions import CHUONG, DIEU, MUC, build, doc_lines  # noqa: E402

UA = {'User-Agent': 'Mozilla/5.0 (compatible; CustomsAssistant/1.0; +internal tool)'}
BASE = 'https://congbao.chinhphu.vn'
WORK_DIR = os.environ.get('INGEST_WORK_DIR', '/tmp/ingest')

DOC_TYPE_VI = {
    'Luật': 'luat', 'Pháp lệnh': 'phap_lenh', 'Nghị định': 'nghi_dinh',
    'Nghị quyết': 'nghi_quyet', 'Thông tư': 'thong_tu', 'Quyết định': 'quyet_dinh',
    'Văn bản hợp nhất': 'vbhn', 'Thông tư liên tịch': 'thong_tu',
}


def get(url: str, timeout: int = 90) -> bytes:
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def text_of(page: str) -> list[str]:
    """Flatten a Công báo page to visible lines (its metadata is table-rendered)."""
    s = re.sub(r'<script[\s\S]*?</script>', '', page)
    s = html.unescape(re.sub(r'<[^>]+>', '\n', s))
    return [l.strip() for l in s.split('\n') if l.strip()]


def fetch_metadata(congbao_id: int) -> dict:
    """Ngày ban hành / ngày hiệu lực / loại / cơ quan, from the properties page.

    `effective_from` is NOT NULL in the schema and cannot be guessed from the text, so
    a document whose properties page does not state it is refused rather than defaulted.
    """
    lines = text_of(get(f'{BASE}/thuoc-tinh-van-ban-so-x-{congbao_id}').decode('utf-8', 'ignore'))
    out: dict[str, str] = {}
    for i, l in enumerate(lines[:-1]):
        for label, key in (('Ngày ban hành', 'signed'), ('Ngày hiệu lực', 'effective'),
                           ('Ngày đăng', 'gazette'), ('Loại văn bản', 'doc_type'),
                           ('Cơ quan ban hành', 'issuer')):
            # Last occurrence wins: the page repeats these labels in its nav breadcrumb
            # ABOVE the real property table, so taking the first gives "Hệ thống văn bản"
            # as the issuing body.
            if l.startswith(label):
                out[key] = lines[i + 1].strip()
    iso = lambda d: (f'{d[6:10]}-{d[3:5]}-{d[0:2]}' if re.fullmatch(r'\d{2}/\d{2}/\d{4}', d or '') else None)
    return {
        'signed_date': iso(out.get('signed', '')),
        'gazette_date': iso(out.get('gazette', '')),
        'effective_from': iso(out.get('effective', '')),
        'doc_type': DOC_TYPE_VI.get(out.get('doc_type', '').strip(), None),
        'issuing_body': (out.get('issuer') or '').title() or None,
    }


def fetch_part_urls(source_url: str) -> list[tuple[str, str]]:
    """(file_name, url) for every downloadable part, from the content page.

    The g7 CDN links are tokenised and expire quickly, so they must be read from the
    page and used immediately — never cached between runs.
    """
    page = get(source_url).decode('utf-8', 'ignore')
    seen, out = set(), []
    for m in re.finditer(r'https?://[^"\'<> ]*download/stream[^"\'<> ]*', page):
        u = html.unescape(m.group(0))
        if u in seen:
            continue
        seen.add(u)
        fn = urllib.parse.parse_qs(urllib.parse.urlparse(u).query).get('file_name', [''])[0]
        if fn:
            out.append((fn, u))
    return out


def download_parts(part_urls: list[tuple[str, str]], stem: str) -> list[str]:
    """Download the PDF parts (falling back to Word) in gazette order.

    PDF is preferred for the same reason the hand-built corpus prefers it: a signed PDF
    is a FLAT render, while the .doc of a consolidated document duplicates amended
    Khoản. Word is used only when a document has no PDF.
    """
    os.makedirs(WORK_DIR, exist_ok=True)
    pdfs = [(f, u) for f, u in part_urls if f.lower().endswith('.pdf')]
    chosen = pdfs or [(f, u) for f, u in part_urls if f.lower().endswith(('.doc', '.docx'))]
    paths = []
    for i, (fn, u) in enumerate(chosen, 1):
        ext = os.path.splitext(fn)[1].lower() or '.pdf'
        dest = os.path.join(WORK_DIR, f'{stem}-{i:02d}{ext}')
        data = get(u, timeout=180)
        if len(data) < 5000:
            continue
        with open(dest, 'wb') as f:
            f.write(data)
        paths.append(dest)
    return paths


def article_parts(paths: list[str]) -> list[str]:
    """Keep only the parts that carry ARTICLES, in order.

    A long circular is split across gazette issues and the trailing ones are appendices
    and forms (25/VBHN-BTC: 8 parts, only the first 4 hold articles). Feeding the
    appendices to the parser adds noise, so a part that yields no Điều after articles
    have already started ends the document.
    """
    kept, started = [], False
    for p in paths:
        try:
            lines = doc_lines(p)
        except Exception as e:  # a corrupt part must not kill the whole ingest
            print(f'  ! không đọc được {os.path.basename(p)}: {e}')
            continue
        has_article = any(DIEU.match(l) for l in lines)
        if has_article:
            kept.append(p)
            started = True
        elif started:
            break
    return kept


def structural_gate(rows: list[dict]) -> list[str]:
    """Reasons this parse must NOT be trusted. Empty list = it may be ingested.

    Each rule corresponds to a real corruption seen while building the corpus by hand;
    none of them is speculative.
    """
    problems: list[str] = []
    dieu = [r for r in rows if r['ptype'] == 'dieu']
    chuong = [r for r in rows if r['ptype'] == 'chuong']
    khoan = [r for r in rows if r['ptype'] == 'khoan']

    if len(dieu) < 2:
        return [f'chỉ parse được {len(dieu)} điều — gần như chắc chắn hỏng']

    nums = [int(r['number']) for r in dieu if str(r['number']).isdigit()]
    # Articles run 1..N without gaps. A hole means a heading was swallowed — the shape
    # that cost 28 of 46/VBHN-BTC's 111 articles.
    missing = [n for n in range(1, max(nums) + 1) if n not in set(nums)]
    if missing:
        problems.append(f'thiếu điều: {missing[:12]}{"…" if len(missing) > 12 else ""}')
    if nums != sorted(nums):
        problems.append('số điều không tăng dần')

    # A heading that is not a heading. `Điều 18. Khai hải quan` once came out as
    # "Điều 18 Luật Hải quan và lấy mẫu…" — a cross-reference that stole the heading.
    odd = [r['number'] for r in dieu if not re.match(r'^Điều\s+\d+\.', r['heading'] or '')]
    if len(odd) > 1:
        problems.append(f'tiêu đề điều không có dấu chấm: {odd[:8]} (nghi bị tham chiếu chéo cướp)')

    # A body starting mid-sentence means either the parser lost the structure or a long
    # heading wrapped and its tail landed in the body. The wrap is now taken back by the
    # parser itself (parse_provisions.HEADING_WRAP_MAX), so this rate is no longer
    # expected to be high: measured across the four multi-part documents in the corpus,
    # it fell from 126/387 articles to 1/387. The threshold moved 0.5 -> 0.2 to match.
    # Not 0: a body opening with a bracket or a quoted term is still legitimate, and a
    # gate that fires on healthy documents gets ignored exactly when it matters.
    frag = [r['number'] for r in dieu if (r.get('body') or '').strip()[:1].islower()]
    if len(frag) > len(dieu) * 0.2:
        problems.append(f'{len(frag)}/{len(dieu)} thân điều bắt đầu giữa câu — nghi mất cấu trúc')

    if chuong and len(khoan) < len(dieu):
        problems.append(f'chỉ {len(khoan)} khoản cho {len(dieu)} điều — nghi parse trượt phần thân')
    return problems


def embed_texts(texts: list[str], batch: int = 32) -> tuple[list[list[float]], str]:
    """Embed via the BGE-M3 sidecar — the ONE place the model lives (see the seeder)."""
    base = os.environ['EMBEDDER_URL'].rstrip('/')
    vectors: list[list[float]] = []
    embed_id = 'unknown'
    for i in range(0, len(texts), batch):
        payload = json.dumps({'texts': texts[i:i + batch]}).encode()
        req = urllib.request.Request(f'{base}/embed', data=payload,
                                     headers={**UA, 'Content-Type': 'application/json'})
        data = json.loads(urllib.request.urlopen(req, timeout=300).read())
        vectors.extend(data['vectors'])
        embed_id = data.get('embed_id', embed_id)
        print(f'   … {min(i + batch, len(texts))}/{len(texts)}')
    return vectors, embed_id


def insert_document(conn, doc: dict, rows: list[dict], chunks: list[dict],
                    vectors: list[list[float]], embed_id: str) -> None:
    """Insert ONE document, its provisions and its chunks, in a single transaction.

    Unlike the seeder — which TRUNCATEs and reloads the whole corpus — this adds to a
    live corpus, so it must be all-or-nothing: a half-inserted document would be
    retrievable with dangling parents and no way for a reader to tell.
    """
    with conn.transaction():
        cur = conn.execute(
            """INSERT INTO legal_document
               (doc_type, number, title, issuing_body, signed_date, gazette_date,
                effective_from, effective_to, effectiveness, is_consolidated, consolidates,
                gazette_issue, source_url, doc_summary, embed_model, verification)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'auto_unverified')
               RETURNING id""",
            (doc['doc_type'], doc['number'], doc['title'], doc['issuing_body'],
             doc['signed_date'], doc['gazette_date'], doc['effective_from'], doc['effective_to'],
             doc['effectiveness'], doc['is_consolidated'], doc['consolidates'],
             doc['gazette_issue'], doc['source_url'], (doc['summary'] or '')[:200], embed_id))
        doc_id = cur.fetchone()[0]

        # Rows arrive in document order, which is topological (Chương before its Điều),
        # so a running key→id map resolves every parent without a second pass.
        prov_id: dict[str, int] = {}
        for p in rows:
            cur = conn.execute(
                """INSERT INTO legal_provision
                   (document_id, parent_id, ptype, number, order_index, heading, body, path, citation_label)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                (doc_id, prov_id.get(p['parent_key']) if p['parent_key'] else None,
                 p['ptype'], p['number'], p['order_index'], p['heading'], p['body'],
                 p['path'], p['citation_label']))
            prov_id[p['key']] = cur.fetchone()[0]

        for c, vec in zip(chunks, vectors):
            conn.execute(
                """INSERT INTO legal_chunk
                   (provision_id, article_provision_id, document_id, sac_prefix, body, embed_text,
                    embedding, effective_from, effective_to, effectiveness)
                   VALUES (%s,%s,%s,%s,%s,%s,%s::vector,%s,%s,%s)""",
                (prov_id[c['provision_key']], prov_id[c['article_key']], doc_id,
                 c['sac_prefix'], c['body'], c['embed_text'],
                 '[' + ','.join(str(x) for x in vec) + ']',
                 c['effective_from'], c['effective_to'], c['effectiveness']))


def ingest(conn, number: str) -> int:
    row = conn.execute(
        'SELECT congbao_id, number, title, source_url, doc_type FROM gazette_document '
        'WHERE upper(number) = %s ORDER BY congbao_id DESC LIMIT 1', (number,)).fetchone()
    if not row:
        return 3, f'không thấy {number} trong chỉ mục Công báo'
    congbao_id, number, title, source_url, list_type = row

    if conn.execute('SELECT 1 FROM legal_document WHERE upper(number) = %s', (number,)).fetchone():
        return 0, f'{number} đã có sẵn trong kho'

    print(f'Nạp {number} — {title[:70]}')
    meta = fetch_metadata(congbao_id)
    if not meta['effective_from']:
        # effective_from is NOT NULL and drives the valid-time hard filter. Guessing it
        # would silently mis-scope every future answer from this document.
        return 4, 'trang thuộc tính của Công báo không nêu ngày hiệu lực — không đoán'

    parts = download_parts(fetch_part_urls(source_url), stem=re.sub(r'\W+', '-', number).lower())
    if not parts:
        return 5, 'không tải được phần nội dung nào từ Công báo'
    keep = article_parts(parts)
    if not keep:
        return 6, 'không phần nào của văn bản chứa Điều (có thể chỉ là biểu mẫu/phụ lục)'
    print(f'  {len(parts)} phần tải về, {len(keep)} phần chứa điều')

    # `short` prefixes EVERY citation label, so it must read as a citation, not as a
    # headline. The catalogue title is unusable for that: deep listing pages repeat the
    # number inside the title, giving "36/2016/TT-BCT Thông tư số 36/2016/TT-BCT quy…".
    kind_vi = {'luat': 'Luật', 'phap_lenh': 'Pháp lệnh', 'nghi_dinh': 'Nghị định',
               'nghi_quyet': 'Nghị quyết', 'thong_tu': 'Thông tư',
               'quyet_dinh': 'Quyết định', 'vbhn': 'VBHN'}
    doc_kind = meta['doc_type'] or list_type
    clean_title = re.sub(r'^\s*' + re.escape(number) + r'\s*', '', title, flags=re.I).strip()
    doc = {
        'number': number,
        'doc_type': doc_kind,
        'short': f'{kind_vi.get(doc_kind, "Văn bản")} {number}',
        'title': clean_title or title,
        'issuing_body': meta['issuing_body'],
        'signed_date': meta['signed_date'],
        'gazette_date': meta['gazette_date'],
        'effective_from': meta['effective_from'],
        'effective_to': None,
        'effectiveness': 'con_hieu_luc',
        'is_consolidated': doc_kind == 'vbhn',
        'consolidates': None,
        'gazette_issue': None,
        'source_url': source_url,
        'summary': (clean_title or title)[:200],
        'doc_files': keep,
    }
    rows = build(doc)
    problems = structural_gate(rows)
    n_dieu = sum(1 for r in rows if r['ptype'] == 'dieu')
    print(f'  parse: {n_dieu} điều, {sum(1 for r in rows if r["ptype"] == "khoan")} khoản')
    if problems:
        return 7, 'cổng tự kiểm chặn: ' + '; '.join(problems)

    chunks = build_chunks({number: doc}, rows)
    if not chunks:
        return 8, 'không dựng được chunk nào'
    print(f'  {len(chunks)} chunk → embed …')
    vectors, embed_id = embed_texts([c['embed_text'] for c in chunks])

    insert_document(conn, doc, rows, chunks, vectors, embed_id)
    return 0, f'{number} — {n_dieu} điều, {len(chunks)} chunk (chưa đối chiếu tay)'


def worker_loop(conn, poll_seconds: int = 15) -> None:
    """Claim queued requests one at a time and record the outcome.

    A poller, not an API-spawned job: letting the API start containers would mean giving
    it the docker socket, and ingest is minutes long — far past the life of the chat
    message that asked for it. The queue row IS the handoff, and it carries the thread
    to report back to.
    """
    print(f'ingest worker: chờ việc mỗi {poll_seconds}s')
    while True:
        row = conn.execute(
            """UPDATE ingest_request SET status = 'running'
               WHERE id = (SELECT id FROM ingest_request WHERE status = 'queued'
                           ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
               RETURNING id, number""").fetchone()
        if not row:
            time.sleep(poll_seconds)
            continue
        req_id, number = row
        print(f'[{req_id}] nạp {number} …')
        try:
            code, message = ingest(conn, number)
        except Exception as e:  # a bad document must not take the worker down
            code, message = 99, f'lỗi không lường trước: {e}'
        status = 'done' if code == 0 else 'failed'
        conn.execute(
            'UPDATE ingest_request SET status = %s, detail = %s, finished_at = now() WHERE id = %s',
            (status, message[:2000], req_id))
        print(f'[{req_id}] {status}: {message}')


def main() -> int:
    import psycopg
    conn = psycopg.connect(os.environ['DATABASE_URL'], autocommit=True)
    if len(sys.argv) > 1 and sys.argv[1] == '--worker':
        worker_loop(conn)
        return 0
    if len(sys.argv) < 2:
        print('dùng: ingest_document.py "<số hiệu>" | --worker', file=sys.stderr)
        return 2
    code, message = ingest(conn, sys.argv[1].strip().upper())
    print(('OK: ' if code == 0 else 'DỪNG: ') + message)
    return code


if __name__ == '__main__':
    sys.exit(main())
