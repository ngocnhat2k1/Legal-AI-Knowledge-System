CREATE TYPE "public"."duty_kind" AS ENUM('percent', 'specific');--> statement-breakpoint
CREATE TYPE "public"."rate_type" AS ENUM('ad_valorem', 'specific', 'compound', 'excluded', 'trq');--> statement-breakpoint
CREATE TYPE "public"."trade_direction" AS ENUM('import', 'export');--> statement-breakpoint
CREATE TABLE "annex" (
	"id" serial PRIMARY KEY NOT NULL,
	"decree_id" integer NOT NULL,
	"code" varchar(8) NOT NULL,
	"name" text NOT NULL,
	"trade_direction" "trade_direction" NOT NULL,
	CONSTRAINT "annex_decree_code_uq" UNIQUE("decree_id","code")
);
--> statement-breakpoint
CREATE TABLE "anti_dumping_duty" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"hs_code" varchar(8) NOT NULL,
	"product_scope" text,
	"origin_country" varchar(8) NOT NULL,
	"exporter" text,
	"duty_kind" "duty_kind" NOT NULL,
	"rate_percent" numeric(7, 4),
	"amount" numeric(14, 2),
	"amount_currency" varchar(3),
	"amount_unit" varchar(24),
	"decision_number" varchar(48) NOT NULL,
	"decision_authority" varchar(64) DEFAULT 'Bộ Công Thương' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"source_url" text,
	"note" text,
	CONSTRAINT "cbpg_hs_format" CHECK ("anti_dumping_duty"."hs_code" ~ '^[0-9]{8}$'),
	CONSTRAINT "cbpg_validity_order" CHECK ("anti_dumping_duty"."effective_to" IS NULL OR "anti_dumping_duty"."effective_to" >= "anti_dumping_duty"."effective_from"),
	CONSTRAINT "cbpg_shape" CHECK (CASE "anti_dumping_duty"."duty_kind"
        WHEN 'percent'  THEN "anti_dumping_duty"."rate_percent" IS NOT NULL AND "anti_dumping_duty"."amount" IS NULL
        WHEN 'specific' THEN "anti_dumping_duty"."amount" IS NOT NULL AND "anti_dumping_duty"."amount_currency" IS NOT NULL AND "anti_dumping_duty"."amount_unit" IS NOT NULL AND "anti_dumping_duty"."rate_percent" IS NULL
        ELSE false
      END)
);
--> statement-breakpoint
CREATE TABLE "decree" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" varchar(32) NOT NULL,
	"title" text NOT NULL,
	"signed_date" date,
	"gazette_date" date,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"gazette_issue" varchar(32),
	"source_url" text,
	"note" text,
	CONSTRAINT "decree_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "hs_version" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(16) NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"note" text,
	CONSTRAINT "hs_version_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "tariff_rate" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"hs_code" varchar(8) NOT NULL,
	"hs_version_id" integer NOT NULL,
	"annex_id" integer NOT NULL,
	"schedule_id" integer NOT NULL,
	"rate_type" "rate_type" NOT NULL,
	"rate_percent" numeric(7, 4),
	"amount" numeric(14, 2),
	"amount_currency" varchar(3),
	"amount_unit" varchar(24),
	"effective_from" date NOT NULL,
	"effective_to" date,
	"source_decree_id" integer NOT NULL,
	"gazette_issue" varchar(32),
	"out_of_quota_annex_id" integer,
	"conditions" jsonb,
	"source_cell_text" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"note" text,
	CONSTRAINT "tariff_rate_hs_format" CHECK ("tariff_rate"."hs_code" ~ '^[0-9]{8}$'),
	CONSTRAINT "tariff_rate_validity_order" CHECK ("tariff_rate"."effective_to" IS NULL OR "tariff_rate"."effective_to" >= "tariff_rate"."effective_from"),
	CONSTRAINT "tariff_rate_shape" CHECK (CASE "tariff_rate"."rate_type"
        WHEN 'ad_valorem' THEN "tariff_rate"."rate_percent" IS NOT NULL AND "tariff_rate"."amount" IS NULL AND "tariff_rate"."amount_currency" IS NULL
        WHEN 'specific'   THEN "tariff_rate"."amount" IS NOT NULL AND "tariff_rate"."amount_currency" IS NOT NULL AND "tariff_rate"."amount_unit" IS NOT NULL AND "tariff_rate"."rate_percent" IS NULL
        WHEN 'compound'   THEN "tariff_rate"."rate_percent" IS NOT NULL AND "tariff_rate"."amount" IS NOT NULL AND "tariff_rate"."amount_currency" IS NOT NULL AND "tariff_rate"."amount_unit" IS NOT NULL
        WHEN 'excluded'   THEN "tariff_rate"."rate_percent" IS NULL AND "tariff_rate"."amount" IS NULL
        WHEN 'trq'        THEN "tariff_rate"."rate_percent" IS NOT NULL AND "tariff_rate"."out_of_quota_annex_id" IS NOT NULL
        ELSE false
      END)
);
--> statement-breakpoint
CREATE TABLE "tariff_schedule" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(24) NOT NULL,
	"name" text NOT NULL,
	"fta_form" varchar(16),
	"requires_co" boolean DEFAULT false NOT NULL,
	"note" text,
	CONSTRAINT "tariff_schedule_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "annex" ADD CONSTRAINT "annex_decree_id_decree_id_fk" FOREIGN KEY ("decree_id") REFERENCES "public"."decree"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_rate" ADD CONSTRAINT "tariff_rate_hs_version_id_hs_version_id_fk" FOREIGN KEY ("hs_version_id") REFERENCES "public"."hs_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_rate" ADD CONSTRAINT "tariff_rate_annex_id_annex_id_fk" FOREIGN KEY ("annex_id") REFERENCES "public"."annex"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_rate" ADD CONSTRAINT "tariff_rate_schedule_id_tariff_schedule_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."tariff_schedule"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_rate" ADD CONSTRAINT "tariff_rate_source_decree_id_decree_id_fk" FOREIGN KEY ("source_decree_id") REFERENCES "public"."decree"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_rate" ADD CONSTRAINT "tariff_rate_out_of_quota_annex_id_annex_id_fk" FOREIGN KEY ("out_of_quota_annex_id") REFERENCES "public"."annex"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cbpg_lookup_idx" ON "anti_dumping_duty" USING btree ("hs_code","origin_country");--> statement-breakpoint
CREATE INDEX "tariff_rate_lookup_idx" ON "tariff_rate" USING btree ("hs_code","schedule_id","annex_id");