CREATE TABLE "event_settings" (
	"id" integer PRIMARY KEY,
	"name" text NOT NULL,
	"date" text NOT NULL,
	"time" text DEFAULT '' NOT NULL,
	"location" text NOT NULL,
	"sender_email" text DEFAULT '' NOT NULL,
	"sender_name" text DEFAULT 'Artistroom' NOT NULL,
	"payment_url" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "ticket_token" text;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "checked_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_ticket_token_key" UNIQUE("ticket_token");