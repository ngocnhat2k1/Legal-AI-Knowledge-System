CREATE TYPE "public"."legal_doc_type" AS ENUM('luat', 'phap_lenh', 'nghi_dinh', 'nghi_quyet', 'thong_tu', 'quyet_dinh', 'vbhn');--> statement-breakpoint
CREATE TYPE "public"."legal_effectiveness" AS ENUM('con_hieu_luc', 'het_hieu_luc', 'het_hieu_luc_mot_phan', 'chua_co_hieu_luc');--> statement-breakpoint
CREATE TYPE "public"."provision_type" AS ENUM('chuong', 'muc', 'dieu', 'khoan', 'diem');--> statement-breakpoint
CREATE TABLE "legal_chunk" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"provision_id" bigint NOT NULL,
	"article_provision_id" bigint NOT NULL,
	"document_id" integer NOT NULL,
	"sac_prefix" varchar(200),
	"body" text NOT NULL,
	"embed_text" text NOT NULL,
	"embedding" vector(1024),
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', "body")) STORED,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"effectiveness" "legal_effectiveness" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_document" (
	"id" serial PRIMARY KEY NOT NULL,
	"doc_type" "legal_doc_type" NOT NULL,
	"number" varchar(48) NOT NULL,
	"title" text NOT NULL,
	"issuing_body" text,
	"signed_date" date,
	"gazette_date" date,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"effectiveness" "legal_effectiveness" DEFAULT 'con_hieu_luc' NOT NULL,
	"is_consolidated" boolean DEFAULT false NOT NULL,
	"consolidates" varchar(48),
	"gazette_issue" varchar(32),
	"source_url" text,
	"doc_summary" varchar(200),
	"embed_model" varchar(48),
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	CONSTRAINT "legal_document_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "legal_provision" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"parent_id" bigint,
	"ptype" "provision_type" NOT NULL,
	"number" varchar(16),
	"order_index" integer NOT NULL,
	"heading" text,
	"body" text,
	"path" text NOT NULL,
	"citation_label" text NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"effectiveness" "legal_effectiveness"
);
--> statement-breakpoint
ALTER TABLE "legal_chunk" ADD CONSTRAINT "legal_chunk_provision_id_legal_provision_id_fk" FOREIGN KEY ("provision_id") REFERENCES "public"."legal_provision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_chunk" ADD CONSTRAINT "legal_chunk_article_provision_id_legal_provision_id_fk" FOREIGN KEY ("article_provision_id") REFERENCES "public"."legal_provision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_chunk" ADD CONSTRAINT "legal_chunk_document_id_legal_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."legal_document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_provision" ADD CONSTRAINT "legal_provision_document_id_legal_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."legal_document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_provision" ADD CONSTRAINT "legal_provision_parent_id_legal_provision_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."legal_provision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legal_chunk_hnsw" ON "legal_chunk" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "legal_chunk_tsv_gin" ON "legal_chunk" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "legal_chunk_valid_idx" ON "legal_chunk" USING btree ("effective_from","effective_to");--> statement-breakpoint
CREATE INDEX "legal_chunk_article_idx" ON "legal_chunk" USING btree ("article_provision_id");--> statement-breakpoint
CREATE INDEX "legal_chunk_document_idx" ON "legal_chunk" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "legal_provision_doc_order_idx" ON "legal_provision" USING btree ("document_id","order_index");--> statement-breakpoint
CREATE INDEX "legal_provision_parent_idx" ON "legal_provision" USING btree ("parent_id");