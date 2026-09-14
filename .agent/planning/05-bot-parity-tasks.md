---
type: planning
status: active
updated: 2026-09-14
related:
  - ../docs/bot-answer-parity-design.md
  - ../architecture-decisions/2026-09-13-evidence-sections-and-long-form-answers.md
  - ../docs/llm-expansion-design.md
  - 02-progress.md
---

# Kế hoạch triển khai — bot trả lời ngang notebook (Mảng 1 … 4)

> **Trạng thái 2026-09-13 (tối):** Mảng 1 đã commit; server đã chạy ([kế hoạch 06](06-deploy-mona-dev-server.md)) — Task 7 đạt (`/health` báo `llm: up`); Task 8 bước 4 chờ `rclone.conf`; Task 6 bước 6 (đo mục dài trên server) chưa làm; Task 5 bước 6–9 chờ chủ dự án. Task 9 bước 2 xong trên **kho cũ** (bước 1 chưa làm vì Task 5 còn chờ): pháp luật recall@5 90% (20 câu), từ chối đúng 2/2, trích dẫn hợp lệ 100%; HS top-1 20% / top-3 27,3% (55 tờ khai, đường tra tất định); notebook đạt 1/14, nhóm an toàn 0/8 — `fixtures/eval-baseline.json`. **Chủ dự án chốt thứ tự mới:** trình bày kiểu notebook + định dạng Zalo (đậm, màu theo ngữ nghĩa) trước, rồi Mảng 2 ngay sau. Sổ thực thi: `.superpowers/sdd/05-bot-parity-tasks/progress.md` (ngoài git). **Kế hoạch 07 xong** (07): `render.mjs`, `md()`, tách tin, `sourceLines`, `numberMarkers` đã có — Mảng 3 dùng lại.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bot Zalo trả lời ngang hoặc hơn Gemini Notebook trên cùng 32 nguồn, giữ nguyên bốn rào chắn
bot đang hơn notebook (thuế tất định, lọc hiệu lực cứng, kiểm trích dẫn, từ chối khi thiếu căn cứ).

**Architecture:** Một bảng `evidence_section` chứa mọi bằng chứng ngoài điều khoản; `POST /answer` đi
năm bước cố định (kế hoạch → truy hồi lai → mở rộng → viết → kiểm); bộ trình bày Zalo in nhãn từ dữ
liệu. LLM chỉ ở chỗ tìm và viết; mọi con số, mã, số hiệu phải neo vào trích dẫn nguyên văn trong cùng câu.

**Tech Stack:** NestJS 11 · Drizzle/postgres.js · Postgres 17 + pgvector · BGE-M3 sidecar (FastAPI) ·
`claude -p` CLI · Python 3.12 (pdfplumber, pymupdf) · Jest (TS) · `node --test` (bot) · `unittest` (Python) · Docker Compose · rclone.

**Spec:** [.agent/docs/bot-answer-parity-design.md](../docs/bot-answer-parity-design.md) (bản 2). Kế hoạch lập luận từ spec; người thực thi đọc cả hai.

## Global Constraints

- Tối đa **4 lần gọi `claude -p`** một lượt chat; trần tổng **120s** ở p95 (spec §3.7).
- Con số biểu thuế không bao giờ do LLM sinh; trong câu trả lời tự do, thuế chỉ được trích **nguyên một dòng** từ mục `tariff` (spec §3.6 kiểm 3; [R1](../business-rules.md), [R6](../business-rules.md)).
- Mã HS chỉ theo **chế độ ứng viên 1–3**, mã người dùng nêu không vào prompt (spec §3.8; [R2](../business-rules.md), [R4](../business-rules.md)).
- Hiệu lực là **bộ lọc cứng tính từ ngày**, hai cửa sổ `current`/`upcoming` (spec §2.4; [R8](../business-rules.md)).
- Mọi văn bản máy nạp vào ở `auto_unverified`; giữ `verified` chỉ khi chủ dự án duyệt diff và đứng tên (spec §2.7; [R18](../business-rules.md)).
- `decision_log` xoá sau **30 ngày**; **không** sao lưu `conversation*`/`decision_log` ([R14](../business-rules.md)).
- Migration SQL **viết tay** + `_journal.json`; **không** chạy `drizzle-kit generate` (snapshot 0007–0009 thiếu).
- Tài liệu tiếng Việt; mã nguồn, định danh, tên file, thông điệp commit tiếng Anh.
- **Chỉ commit khi chủ dự án yêu cầu** (`.agent/AGENTS.md`). Các bước "Commit" là nội dung soạn sẵn.
- Không bao giờ in giá trị `CLAUDE_CODE_OAUTH_TOKEN` hay nội dung `rclone.conf` ra log/chat.

## Phân rã theo mảng

Bốn mảng, thứ tự bắt buộc (spec "Phân rã chương trình"). **Mảng 1 chi tiết trong file này.** Mảng 2–4
có cấu trúc file, hợp đồng giao diện và danh sách việc ở cuối file; chi tiết hoá thành bước khi mảng
trước cho ra số đo —
vì mảng 2 cần `EMBED_CHARS` đo được ở mảng 1, mảng 3 cần schema mảng 2.

| Mảng | Phạm vi | Kế hoạch |
|---|---|---|
| **1 · Nền** | toolchain, bộ chấm 14 câu, parser + nạp lại có diff, embedder có rào, CLI trong image, sao lưu, runbook VPS, baseline | xong trừ Task 5 Bước 6–9, Task 6 Bước 6, Task 9 — bên dưới |
| 2 · Tầng bằng chứng | `evidence_section` + seed 13 kind + `/tariff` mở rộng | phác thảo cuối file |
| 3 · Đường trả lời | module `answer` + bot `render.mjs` | phác thảo cuối file |
| 4 · Nghiệm thu | `ab.ts`, chấm mù, cổng đạt | phác thảo cuối file |

## Còn lại của Mảng 1

Task 1–4, 7, 8 và Task 5 Bước 1–5 xong (commit `e332360`, `ad04ef2`, `41ac65a`; từng bước trong git `11275bc`). Việc còn lại dưới đây.

### Task 5 (còn lại): gộp kho sinh lại vào seed

Bước 1–5 đã sinh `research/legal-loader/out/` và `out/diff-report.md`.

- [ ] **Bước 6: cổng duyệt của chủ dự án**

Gửi `out/diff-report.md` cho chủ dự án, kèm tin nhắn nói rõ mục 2 của báo cáo (8 điều "có thể còn cụt"):
- **5 điều đã xác nhận tiêu đề vẫn cụt** (đối chiếu chữ in đậm trong PDF gốc), thân điều mở đầu giữa câu: 25/VBHN-BTC Điều 14, 76; 46/VBHN-BTC Điều 18; 54/VBHN-VPQH Điều 55, 101.
- 25/VBHN-BTC Điều 44 nhiều khả năng là báo nhầm: thân điều nhắc lại tiêu đề.
- 25/VBHN-BTC Điều 80 và 54/VBHN-VPQH Điều 66 **chưa xác nhận** — cần kiểm tay.

Chủ dự án quyết định **theo từng văn bản** (7 văn bản, không phải một quyết định chung). Chỉ tiếp tục khi mỗi văn bản có một trong hai câu trả lời:
- "giữ verified" → văn bản đó vào nhóm `--verified-by "<tên chủ dự án>"` ở Bước 7;
- không duyệt → văn bản đó vào nhóm `--unverified` ở Bước 7.

- [ ] **Bước 7: gộp vào kho**

Trước khi gộp: nếu chủ dự án xác nhận `gazette_issue` của 128/2020/NĐ-CP sai, sửa `corpus.json` và sinh lại `out/` (Bước 3) trước — xem mục "Việc phát sinh từ Mảng 1".

Mỗi nhóm quyết định ở Bước 6 chạy một lần, `--only` liệt kê số hiệu văn bản của nhóm (bỏ `--only` = cả 7 văn bản trong `out/`). Ví dụ:
```bash
cd research/legal-loader
python3 merge_into_seed.py --from out --into ../../db/seed/data/legal --only 33/2023/TT-BTC,46/VBHN-BTC --verified-by "<tên>"
python3 merge_into_seed.py --from out --into ../../db/seed/data/legal --only 25/VBHN-BTC --unverified
```
Expected: mỗi lần in `merged N documents into … as …` với đúng các văn bản của nhóm; qua mọi lần chạy, mỗi văn bản trong `out/documents.ndjson` được gộp đúng một lần; `wc -l ../../db/seed/data/legal/*.ndjson` cho `documents` = 15.

- [ ] Sau khi gộp xong: đổi mặc định trong `db/seed/legal.ts` (`verification: d.verification ?? 'verified'`) thành `'auto_unverified'`, để một dòng sau này thiếu trường `verification` không bao giờ bị coi là đã xác minh (R18).

- [ ] **Bước 8: kiểm bằng mắt 10 điều ngẫu nhiên**

Run:
```bash
python3 -c "
import json,random
rows=[json.loads(l) for l in open('db/seed/data/legal/provisions.ndjson',encoding='utf-8')]
d=[r for r in rows if r['ptype']=='dieu']; random.seed(13)
for r in random.sample(d,10): print(r['document_number'],'|',r['heading'][:70],'|',(r['body'] or '')[:60].replace(chr(10),' '))"
```
Expected: mọi `heading` là cụm danh từ hoàn chỉnh, không cụt; không thân điều bắt đầu giữa câu. **Không tin số đếm** (bài học 2026-08-13).

- [ ] **Bước 9: commit (chỉ khi chủ dự án yêu cầu)**

```bash
git add research/legal-loader/refetch.py .gitignore db/seed/data/legal/documents.ndjson db/seed/data/legal/provisions.ndjson db/seed/data/legal/chunks.ndjson db/seed/data/legal/annex-tables.ndjson
git commit -m "Legal corpus: regenerate all 15 documents with the current parser (5 stolen headings, 1 phantom clause fixed)"
```

---

### Task 6 (còn lại): đo embed trên server

- [x] **Bước 6: đo trên server** (2026-09-14, server MONA): bản ghi 48.998 ký tự 7,4 s; lô 32 mục ≥ 8.000 ký tự 170,7 s (5,3 s/mục); RAM đỉnh embedder 2.580 MB / 3.500 MB, không OOM; 3,46 ký tự/token → `EMBED_CHARS = 6800`, giữ `EMBED_MAX_TOKENS = 2048`. Cổng đạt. Số đo ghi ở spec §2.6.

---

### Task 9: Baseline mảng 1

**Files:**
- Sinh: `fixtures/eval-baseline.json`
- Modify: `.agent/planning/02-progress.md`, `.agent/docs/bot-answer-parity-design.md` (§2.6 số đo), `.agent/planning/05-bot-parity-tasks.md` (trạng thái)

**Interfaces:**
- Produces: con số baseline mà mảng 2–4 được chấm so với: recall@5, abstain, HS top-1/top-3, notebook đạt x/14, nhóm an toàn y/z, số đo embed.

- [ ] **Bước 1: nạp kho đã sinh lại**

Run (VPS hoặc Docker local có embedder): `FORCE_RESEED=1 docker compose run --rm --no-deps seed-legal 2>&1 | tail -5`
(bắt buộc `--no-deps`: thiếu nó, compose chạy lại cả `seed` với cùng `FORCE_RESEED=1` và nạp lại các bảng biểu thuế vô ích)
Expected: `+ 15 legal_document`, số provisions/chunks khớp `wc -l` các file ndjson.

- [ ] **Bước 2: chạy eval**

`yarn eval` không chạy được trong image hay trên máy chủ: `.dockerignore` loại `fixtures`, image không có `apps/eval`. Chạy từ máy Mac qua đường hầm SSH:
Run: `ssh -N -L 3000:127.0.0.1:<cổng host của api> <host>` (mặc định 3000; máy dev MONA dùng 3060 — kế hoạch 06), rồi ở shell khác `EVAL_API_URL=http://localhost:3000 corepack yarn eval`
Expected: in ba khối (PHÁP LUẬT, MÃ HS, NOTEBOOK); `Đã ghi fixtures/eval-baseline.json`. Với endpoint `/legal`, khối NOTEBOOK có `kiểm bị bỏ qua (response không mang trường cần chấm)` > 0 và `chưa chấm` ≥ 1 (nb-07 chỉ có `expectIntent`, `/legal` không trả `plan`) — đúng dự kiến; ca chưa chấm không tính vào `nhóm an toàn đạt`.

- [ ] **Bước 3: ghi lại**

Trong `02-progress.md`: mục "Tiếp tục từ đây" → "Mảng 1 xong; con số baseline: …" (chép nguyên văn từ báo cáo); bảng trạng thái thêm hàng Mảng 1–4; nhật ký phiên một mục. Trong spec §2.6: thay khởi điểm bằng số đo Task 6. Trong file này: đánh dấu Task 1–9.

- [ ] **Bước 4: commit (chỉ khi chủ dự án yêu cầu)**

```bash
git add fixtures/eval-baseline.json .agent/planning/02-progress.md .agent/planning/05-bot-parity-tasks.md .agent/docs/bot-answer-parity-design.md
git commit -m "Baseline before the bot-parity upgrade: legal, HS, and the 14 notebook questions"
```

---

## Việc phát sinh từ Mảng 1

- [ ] **5 tiêu đề còn cụt** — 25/VBHN-BTC Điều 14, 76; 46/VBHN-BTC Điều 18; 54/VBHN-VPQH Điều 55, 101. Phần đuôi tiêu đề mở đầu bằng chữ hoa, chữ viết tắt hoặc chữ số ("Giấy…", "DNCX…", "Việt Nam", "Nam…", "78/2006/QH11…"), mà `_is_heading_continuation` chỉ nối dòng mở đầu bằng chữ thường. Việc tiếp: sửa parser để nối an toàn các dòng tiếp này (có ca test cho từng dạng, không nuốt dòng thân điều viết hoa hay khoản "1. …"), sinh lại, diff lại. Không làm trong kế hoạch này (Ruling R18 trong `.superpowers/sdd/05-bot-parity-tasks/progress.md`: đổi heuristic có thể nuốt nhầm dòng thân điều của cả 15 văn bản — R3).
- [ ] **100 khoá khoản/điểm trùng** trong 7 văn bản corpus (+17 trong 72/2022/NĐ-CP) — `db/seed/legal.ts` chỉ giữ dòng cuối cho mỗi khoá, nên mọi chunk của một khoá trùng trỏ về cùng một dòng provision. Kiểm xem trích dẫn có hiện văn bản của khoản khác không (R3).
- [ ] **128/2020/NĐ-CP `gazette_issue`** — `corpus.json` (và `out/documents.ndjson`, seed) ghi `"1023+1024"`, `gazette_date` `2020-11-02`; trang Công báo của văn bản ghi "Nằm trong các Công báo: 1027 + 1028", số báo đó ngày 04/11/2020 (kiểm 2026-09-13). Chủ dự án xác nhận, rồi sửa `corpus.json` và sinh lại `out/` **trước Bước 7** của Task 5 (không thì bản gộp mang lại giá trị cũ).

---

## Mảng 2 · Tầng bằng chứng — phác thảo (chi tiết hoá sau Task 6 và 9)

**Cấu trúc file**

| File | Trách nhiệm |
|---|---|
| `db/migrations/0011_evidence_section.sql` + `db/migrations/meta/_journal.json` | bảng `evidence_section` (cột theo spec §2.1, HNSW cosine, GIN tsv, index `(kind)`, `(document_number)`, `(hs_heading)`, GIN `hs_codes`), bảng `decision_log(id, created_at, thread_id, plan jsonb, evidence_ids bigint[], citation_ids bigint[], violations jsonb, timing jsonb, calls smallint)` |
| `db/schema/index.ts` | `evidenceSection`, `decisionLog` |
| `db/seed/evidence.ts` | đọc các builder, embed theo lô ≤32 mục / ≤64.000 ký tự, upsert theo `(kind, instrument, source_ref)`, embed lại khi `meta.md5` đổi, `FORCE_RESEED` |
| `db/seed/evidence/{notes,gri,en,sen,rulings,guidance,annex,status,decree,windows,agentNotes}.ts` | mỗi file một builder `build(): EvidenceRow[]` cho một kind (windows: local_doc/draft/internal theo mốc cấu trúc + 4.000/400 lặp header) |
| `db/seed/evidence.spec.ts` | các khoá số ở spec §7 (33 `status`, 13/2022 một mục hai dòng, cửa sổ 1725 có `hs_codes`…) |
| `research/inbox-loader/render_notebook.py` | xuất `db/seed/data/legal/nghiep-vu.json` (danh sách `NGHIEP_VU`) để seed và notebook cùng nguồn |
| `apps/api/src/modules/tariff/tariff.service.ts` (+ spec) | Chương 98 hai chiều, `schedule=all` (lộ trình), listing theo tiền tố không `LIMIT 25` |
| `apps/api/src/modules/health/health.service.ts` | `evidenceSections` count, `embedder` up/down |

**Hợp đồng giao diện**

```ts
export interface EvidenceRow {
  kind: 'hs_note'|'gri'|'en'|'sen'|'ruling'|'guidance'|'annex_table'|'status'|'local_doc'|'draft'|'internal'|'note';
  instrument: string; instrumentDate: string | null;
  authority: 'binding'|'authoritative'|'administrative'|'reference'|'undetermined';
  hsChapter: number | null; hsHeading: string | null; hsCodes: string[]; documentNumber: string | null;
  title: string; body: string; embedText: string;
  effectiveFrom: string; effectiveTo: string | null; effectiveness: 'con_hieu_luc'|'het_hieu_luc'|'het_hieu_luc_mot_phan'|'chua_co_hieu_luc';
  verification: 'verified'|'auto_unverified'; verifiedBy: string | null; sourceRef: string; meta: Record<string, unknown>;
}
export const EMBED_CHARS: number;   // từ số đo Task 6
export function extractHsCodes(body: string): string[];        // mọi \d{4}\.\d{2}\.\d{2}
export function windowText(text: string, header: string, size?: number, overlap?: number): string[]; // lặp header
export function statusSections(documents: DocRow[], relations: RelationRow[]): EvidenceRow[]; // spec §2.3
```

**Việc (mỗi việc một chu kỳ test; thứ tự bắt buộc)**

> **Trạng thái 2026-09-14:** việc 1–4 xong (`8fa69dc`). Khác phác thảo: builder gom trong một file thuần `db/seed/evidence-build.ts` + `evidence-build.spec.ts` (19 test); `decision_log` hoãn sang Mảng 3 cùng code ghi nó; seed **upsert tiếp tục được**, không TRUNCATE; ghi chú `.agent/` đi vào image qua `repo-notes.ndjson` (image không có `.agent/`); mục `note` để `auto_unverified` thay vì `verified` như spec §2.1, vì R18 chỉ cho người đứng tên xác minh. Việc 5 và `/health.evidenceSections` chuyển sang Mảng 3 (chưa có code đọc). Kết quả 1.979 mục + mục nghị định: hs_note 134, gri 18, en 1.306, sen 97, ruling 29, annex_table 112, status 33, local_doc 6, guidance 2, draft 20, internal 149, note 73.

1. ✅ Migration 0011 + schema + `db:migrate` chạy sạch trên DB rỗng và DB đã có. (0010 đã dùng cho `0010_tariff_by_subline` — ADR 2026-09-13-fta-national-sublines.)
2. ✅ `extractHsCodes`, `windowText`, `statusSections` — thuần, test trước.
3. ✅ Builder từng kind theo bảng spec §2.2, khoá bằng số đếm và các ca nội dung ở spec §7.
4. ✅ `db/seed/evidence.ts` + compose service `seed-evidence` (sau `seed-legal`), idempotent.
5. ↪ Mảng 3 — `/tariff`: Chương 98 hai chiều + `schedule` + listing; test golden hai ca Chương 98.
6. ✅ Chạy seed trên server trong ngưỡng đo Task 6: 2026-09-14 07:39–08:53 UTC (73,5 phút), 1.989/1.989 mục có vector (status 43 = 33 văn bản + 10 nghị định biểu thuế), exit 0, không OOM, RAM trống thấp nhất của host 1.417 MB.
7. Cổng: `yarn eval` (endpoint `/legal` — chưa có `/answer`) không tụt; `evidence-build.spec` xanh; kiểm SQL thật cho `simple` parser với số hiệu (spec §3.3).

## Mảng 3 · Đường trả lời — phác thảo (chi tiết hoá sau mảng 2)

> **Lát đầu (2026-09-14, `e17e0a1`…`19da3b0`) — trước `POST /answer`, không thêm lần gọi LLM.** `GET /legal` truy hồi thêm
> `evidence_section` (`apps/api/src/modules/legal/legal.evidence.ts`: RRF lai như `legal_chunk`, cửa sổ `current` +
> 18 tháng `upcoming`, chưa lọc HS), tối đa 3 mục nối **sau** điều khoản, qua cùng cổng `MAX_DIST`; văn bản người dùng
> nêu mà kho chỉ có trong tầng bằng chứng (69/2018/NĐ-CP) trả lời từ mục đó thay vì `missingDoc`. Mỗi nguồn vào prompt
> kèm nhãn thẩm quyền / chưa có hiệu lực / tình trạng; prompt bỏ trần 200 từ; gọi viết 90 s. Citation mang `kind`,
> `instrument`, `note` — bộ chấm notebook (`apps/eval/notebook.ts`) nhờ đó chấm được `expectEvidence`. Bot in `note`
> trên dòng nguồn. Việc dưới đây vẫn nguyên: `retrieve.ts` chuyển phần truy hồi này sang, thêm lọc HS, kế hoạch, mở
> rộng, kiểm, sửa.
>
> Hai điều học được khi kiểm trên dữ liệu thật (`2ee0c60`, `eaae4ec`, `19da3b0`):
> - 69/2018/NĐ-CP đã được bot tự nạp nên đi đường "có trong kho" và trả lời bằng chính khoản của nó; mục `status`
>   ("hết hiệu lực từ 05/09/2026") không lên hạng vì parser `simple` cắt số hiệu (spec §3.3). **Mục `status` của mọi văn
>   bản câu hỏi nêu luôn đi kèm, không qua cổng** (`namedStatus`).
> - Cổng `MAX_DIST` 0,58 của điều khoản quá lỏng cho bằng chứng. Đo 10 câu: mục đúng 0,27–0,41; câu lạc đề ≥ 0,57; trong
>   lĩnh vực, ghi chú AEO 0,34 cho câu "thời hạn nộp thuế" có khoản gần nhất 0,25. Cổng bằng chứng: **≤ 0,50 và không
>   xa hơn điều khoản tốt nhất quá 0,05**. Mảng 3 chỉnh lại hai số này bằng eval notebook.
> - Mã HS 8 số trong câu hỏi cũng không khớp bằng từ khoá ("6506.10.10"), và RRF để các đoạn mở đầu chương lặp từ của
>   câu hỏi vượt mục đúng ("Chú giải Phần XVI"). **Mục có mã HS câu hỏi nêu (`hs_codes`) luôn đi kèm, nguồn ràng buộc
>   trước** (`hsCodeSections`); các mục còn lại qua cổng rồi **xếp theo khoảng cách cosine**, không theo RRF.
> - Deploy `0bf25af` (qua CI/CD) lúc LLM đã có lại hạn mức: văn xuôi dùng đúng bằng chứng (69/2018 "hết hiệu lực từ
>   05/09/2026, thay bởi 292/2026"; 336/2026 "chưa có hiệu lực, vẫn theo 85/2019"; mũ bảo hiểm 6506.10.10 "rủi ro trung
>   bình, Phụ lục II TT 36/2026"). Hai lỗi, sửa ngay sau đó: (1) bot chạy khô câu "NĐ 43/2017 về nhãn hàng hóa còn áp dụng
>   không" → LLM viết "vẫn còn hiệu lực… sẽ hết hiệu lực từ 23/01/2026" từ chính mục ghi hết hiệu lực ngày đó. **So ngày
>   không giao cho LLM:** mục `status` mang `meta.ends` (ngày, văn bản, phần), API so với ngày hỏi → nhãn "ĐÃ HẾT HIỆU LỰC"
>   trong prompt và `expired` trên citation → bot in dòng đỏ từ dữ liệu; mục có cửa sổ `upcoming` vì sắp bị thay (85/2019)
>   không còn bị gắn "CHƯA CÓ HIỆU LỰC". Sau deploy phải chạy `seed-evidence` một lần (không nhúng lại). (2) câu có mã HS hỏi
>   về danh mục văn bản đi đường tắt tra thuế → `legalAboutCode` (`dispatch.mjs`) đưa sang pháp luật khi có dấu hiệu văn
>   bản/danh mục và không có dấu hiệu thuế. Còn mở: "Chú giải Phần XVI loại trừ gì" — LLM không trả văn xuôi (chưa rõ do
>   timeout 90 s hay JSON hỏng; `generate` nuốt lỗi, cần log).
> - Sau deploy `21e54da` (và chạy `seed-evidence`): dòng đỏ hiện đúng, Phần XVI đã có văn xuôi, nhưng LLM vẫn mở đầu
>   "Còn hiệu lực tại thời điểm hiện tại (14/09/2026), nhưng sẽ hết hiệu lực từ 23/01/2026" rồi tự sửa. Lớp thứ hai: chuỗi
>   `expired` vào prompt thành **"sự kiện đã xác định"** trên câu hỏi, và **`dropInForceClaims`** (`legal.grounding.ts`)
>   bỏ câu nói văn bản đã hết hiệu lực "còn hiệu lực / vẫn áp dụng / sẽ hết hiệu lực", trừ câu chỉ nêu nguồn còn hiệu
>   lực. Đây là kiểm chuỗi, không phải kiểm suy diễn — `guards.ts` của Mảng 3 thay thế. `generate` giờ ghi log lý do trả
>   null (lỗi hoặc thiếu JSON), không ghi prompt: câu "thời hạn nộp thuế" có lần trả văn xuôi, có lần không.

**Cấu trúc file**

| File | Trách nhiệm |
|---|---|
| `apps/api/src/modules/answer/answer.module.ts`, `answer.controller.ts` (`POST /answer`, `GET /evidence/:id`) | nối NestJS |
| `answer.service.ts` | điều phối năm bước, `decision_log` |
| `plan.ts` | prompt bước 1, `normalizePlan(raw): Plan` (tập intent 9 giá trị, `kinds` gợi ý, `scope.hs` 4–8 số) |
| `retrieve.ts` | SQL lai trên `legal_chunk` và `evidence_section` với hai cửa sổ, lọc HS theo spec §3.3, RRF gộp truy vấn, đa dạng hoá; `toTsQuery` giữ `\d{2}\.\d{2}` |
| `expand.ts` | mở rộng theo bảng spec §3.4, trần 40.000 token, mục `tariff` sinh tức thì |
| `compose.ts` | prompt bước 4 + khối "quy ước đọc bằng chứng" + chế độ ứng viên; `runClaude(prompt, timeoutMs)` dùng chung (chuyển từ `legal.generation.ts`) |
| `guards.ts` (+ `guards.spec.ts`) | năm luật §3.6, `candidates` §3.8, tách câu, chuẩn hoá; các ca test liệt kê ở spec §7 |
| `repair.ts` | gọi #3 với danh sách vi phạm; cắt câu khi còn vi phạm |
| `types.ts` | `AnswerRequest`, `AnswerResponse`, `Plan`, `Citation`, `Candidate` đúng JSON spec §3.1 |
| `apps/api/src/modules/conversation/conversation.service.ts` | `sweepIdle` xoá `decision_log` > 30 ngày |
| `apps/zalo-bot/format.mjs` (+ `dispatch.test.mjs`) | **chỉ thêm** `formatAnswerMd(answer: AnswerResponse): Line[]`: `md(answerMd)`, `sourceLines` với nhãn `authority`/`window`/`meta.status`, khối `candidates` và khối thuế đặt dưới; bỏ qua `followups`. `render.mjs` (bộ trình bày, tách tin, `warn`) đã có từ kế hoạch 07 (đã ship) — không viết bộ trình bày thứ hai |
| `apps/zalo-bot/dispatch.mjs` (+ test) | `INTENTS` thêm `status`/`hs`/`mixed` pass-through |
| `apps/zalo-bot/index.mjs`, `api.mjs`, `answer.mjs`, `conversation.mjs`, `parse.mjs` | gọi `/answer`, ack "🔍 Đang tra…", `forceIntent`, `state.legal.evidenceIds`, `parseQuery` bắt `\d{4}\.\d{2}` và "nhóm dddd" |

**Hợp đồng giao diện:** đúng JSON ở spec §3.1; `guards.check(answer: ComposeResult, evidence: ExpandedSection[], userTokens: string[]): Violation[]`; `formatAnswerMd(AnswerResponse): Line[]` + `render(Line[]) → {msg, styles}[]` (có sẵn); `guards.ts` chuyển `numberMarkers` từ `legal.grounding.ts` sang và so với `quote` từng trích dẫn.

**Việc:** (1) `types.ts` + `guards.ts` TDD với mọi ca §7; (2) `plan.ts` + `normalizePlan` test; (3) `retrieve.ts` với test SQL thật trên DB seed (Phần XVI, 16/2026, mũ bảo hiểm, 84.18); (4) `expand.ts` + trần token; (5) `compose.ts` + `repair.ts`; (6) `answer.service` + controller + `decision_log` + sweep; (7) bot: `formatAnswerMd` TDD, `dispatch` mở rộng, `index.mjs` nối, ack; (8) thêm nhánh `POST /answer` vào `yarn eval`, rồi đo: 14/14 có bằng chứng truy hồi (`expectEvidence`), `numbersOutsideSentenceQuote = 0`, `citationsProven = 100%`, p95 ≤ 120s.

## Mảng 4 · Nghiệm thu — phác thảo (chi tiết hoá sau mảng 3)

| File | Trách nhiệm |
|---|---|
| `fixtures/ab-questions.json` | ~35 câu: 14 notebook + 22 golden chọn lọc + câu chủ dự án cung cấp; mỗi câu có `notebookAnswer` do chủ dự án dán |
| `apps/eval/ab.ts` | chạy bot qua `/answer`, sinh `fixtures/ab-sheet.html` (che tên, trộn A/B theo seed), đọc lại `fixtures/ab-grades.json`, in tỉ lệ thắng/ngang và nhóm an toàn |
| `research/inbox-loader/notebook_ask.py` (tuỳ chọn) | thử tự động hỏi notebook qua Playwright; bỏ nếu không ổn định |

**Cổng đạt** (spec §7): thắng/ngang ≥ 70%; nhóm an toàn 100%; recall@5 ≥ baseline; trích dẫn qua kiểm 100%; số ngoài `quote` cùng câu = 0; p95 ≤ 120s; seed evidence trong ngưỡng đo.

## Kiến thức liên quan

- [Thiết kế bot trả lời ngang notebook](../docs/bot-answer-parity-design.md) — spec bản 2
- [ADR bảng bằng chứng chung và câu trả lời dài](../architecture-decisions/2026-09-13-evidence-sections-and-long-form-answers.md)
- [Thiết kế mở rộng LLM (M0…M4)](../docs/llm-expansion-design.md)
- [Nhật ký tiến độ](02-progress.md)
