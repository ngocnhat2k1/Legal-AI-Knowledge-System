-- Trigram search for the description lookup ("van" -> valve HS codes).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "hs_description" (
	"hs_code" varchar(8) PRIMARY KEY NOT NULL,
	"heading" text,
	"description" text,
	"path" text NOT NULL,
	CONSTRAINT "hs_description_hs_format" CHECK ("hs_description"."hs_code" ~ '^[0-9]{8}$')
);
--> statement-breakpoint
CREATE INDEX "hs_description_path_trgm" ON "hs_description" USING gin ("path" gin_trgm_ops);