CREATE TABLE "survey_responses" (
	"id" serial PRIMARY KEY,
	"registration_id" integer,
	"token" text NOT NULL UNIQUE,
	"answers" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "stripe_secret_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "paypal_client_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "paypal_client_secret" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "paypal_mode" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "survey" jsonb;--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "survey_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "email_hash" text;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "survey_token" text;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "survey_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_survey_token_key" UNIQUE("survey_token");