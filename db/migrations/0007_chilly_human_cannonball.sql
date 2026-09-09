CREATE TYPE "public"."legal_verification" AS ENUM('verified', 'auto_unverified');--> statement-breakpoint
CREATE TABLE "gazette_document" (
	"id" serial PRIMARY KEY NOT NULL,
	"congbao_id" integer NOT NULL,
	"number" varchar(64) NOT NULL,
	"doc_type" varchar(32) NOT NULL,
	"title" text NOT NULL,
	"source_url" text NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gazette_document_congbao_id_unique" UNIQUE("congbao_id")
);
--> statement-breakpoint
CREATE TABLE "ingest_request" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" varchar(64) NOT NULL,
	"congbao_id" integer,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"detail" text,
	"requested_by" varchar(64),
	"thread_id" varchar(64),
	"user_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "legal_document" ADD COLUMN "verification" "legal_verification" DEFAULT 'verified' NOT NULL;--> statement-breakpoint
CREATE INDEX "gazette_document_number_idx" ON "gazette_document" USING btree (upper("number") varchar_pattern_ops);--> statement-breakpoint
CREATE INDEX "gazette_document_type_idx" ON "gazette_document" USING btree ("doc_type");--> statement-breakpoint
CREATE INDEX "ingest_request_status_idx" ON "ingest_request" USING btree ("status","created_at");
