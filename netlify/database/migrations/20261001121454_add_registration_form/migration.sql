ALTER TABLE "event_settings" ADD COLUMN "registration_form" jsonb;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "extra_fields" text;