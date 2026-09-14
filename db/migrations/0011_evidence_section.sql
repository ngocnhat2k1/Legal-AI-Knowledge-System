-- Evidence other than statute clauses — HS notes, GRI, Explanatory Notes, SEN, rulings, annex tables,
-- status, notebook-only documents, repo notes — one row per citable unit (plan 05 milestone 2;
-- bot-answer-parity-design.md §2.1). Hand-written like 0007–0010: the drizzle snapshots for 0007–0009
-- are missing, so `drizzle-kit generate` is not run (TASK-022). (kind, instrument, source_ref) is the
-- key the seed upserts on.
CREATE TABLE "evidence_section" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" varchar(16) NOT NULL,
	"instrument" text NOT NULL,
	"instrument_date" date,
	"authority" varchar(16) NOT NULL,
	"hs_chapter" smallint,
	"hs_heading" varchar(5),
	"hs_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"document_number" varchar(48),
	"title" text NOT NULL,
	"body" text NOT NULL,
	"embed_text" text NOT NULL,
	"embedding" vector(1024),
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', "title" || ' ' || "body")) STORED,
	"effective_from" date,
	"effective_to" date,
	"effectiveness" "legal_effectiveness" NOT NULL,
	"verification" "legal_verification" DEFAULT 'auto_unverified' NOT NULL,
	"verified_by" varchar(64),
	"source_ref" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "evidence_section_key_uq" UNIQUE("kind","instrument","source_ref"),
	CONSTRAINT "evidence_section_kind_ck" CHECK ("evidence_section"."kind" IN ('hs_note', 'gri', 'en', 'sen', 'ruling', 'guidance', 'annex_table', 'status', 'local_doc', 'draft', 'internal', 'note')),
	CONSTRAINT "evidence_section_authority_ck" CHECK ("evidence_section"."authority" IN ('binding', 'authoritative', 'administrative', 'reference', 'undetermined'))
);
--> statement-breakpoint
CREATE INDEX "evidence_section_hnsw" ON "evidence_section" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "evidence_section_tsv_gin" ON "evidence_section" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "evidence_section_kind_idx" ON "evidence_section" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "evidence_section_document_idx" ON "evidence_section" USING btree ("document_number");--> statement-breakpoint
CREATE INDEX "evidence_section_heading_idx" ON "evidence_section" USING btree ("hs_heading");--> statement-breakpoint
CREATE INDEX "evidence_section_codes_gin" ON "evidence_section" USING gin ("hs_codes");--> statement-breakpoint
CREATE INDEX "evidence_section_valid_idx" ON "evidence_section" USING btree ("effective_from","effective_to");
