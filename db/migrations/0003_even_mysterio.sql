CREATE TYPE "public"."confirmation_verdict" AS ENUM('correct', 'wrong', 'unsure');--> statement-breakpoint
CREATE TABLE "lookup_confirmation" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"hs_code" varchar(8) NOT NULL,
	"origin" varchar(8),
	"as_of_date" date NOT NULL,
	"schedule" varchar(24),
	"verdict" "confirmation_verdict" NOT NULL,
	"staff_name" varchar(64) NOT NULL,
	"note" text,
	"response_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "confirmation_hs_format" CHECK ("lookup_confirmation"."hs_code" ~ '^[0-9]{8}$')
);
--> statement-breakpoint
CREATE INDEX "confirmation_lookup_idx" ON "lookup_confirmation" USING btree ("hs_code","origin");