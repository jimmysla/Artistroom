ALTER TABLE "event_settings" ADD COLUMN "payment_provider" text DEFAULT 'link' NOT NULL;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "payment_provider" text;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "payment_ref" text;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "payment_checkout" text;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_payment_ref_key" UNIQUE("payment_ref");