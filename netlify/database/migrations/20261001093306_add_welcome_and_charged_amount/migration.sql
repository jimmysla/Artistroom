ALTER TABLE "event_settings" ADD COLUMN "welcome_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "welcome_image" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "payment_amount_cents" integer;