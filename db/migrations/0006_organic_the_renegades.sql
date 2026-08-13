CREATE TYPE "public"."conversation_role" AS ENUM('user', 'bot');--> statement-breakpoint
CREATE TYPE "public"."conversation_topic" AS ENUM('tariff', 'legal', 'general');--> statement-breakpoint
CREATE TABLE "conversation" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" varchar(16) DEFAULT 'zalo' NOT NULL,
	"thread_id" varchar(64) NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"staff_name" varchar(64),
	"topic" "conversation_topic",
	"state" jsonb,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_key_uq" UNIQUE("channel","thread_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_turn" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" "conversation_role" NOT NULL,
	"body" text NOT NULL,
	"intent" varchar(16),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_turn" ADD CONSTRAINT "conversation_turn_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_last_active_idx" ON "conversation" USING btree ("last_active_at");--> statement-breakpoint
CREATE INDEX "conversation_turn_recent_idx" ON "conversation_turn" USING btree ("conversation_id","id");--> statement-breakpoint
CREATE INDEX "conversation_turn_created_idx" ON "conversation_turn" USING btree ("created_at");