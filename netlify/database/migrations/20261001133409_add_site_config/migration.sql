ALTER TABLE "event_settings" ADD COLUMN "form_config" jsonb;--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "legal" jsonb;--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "checkin_design" jsonb;--> statement-breakpoint
ALTER TABLE "registrations" ADD COLUMN "extra" text;