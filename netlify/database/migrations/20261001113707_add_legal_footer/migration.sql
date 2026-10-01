ALTER TABLE "event_settings" ADD COLUMN "show_legal" text DEFAULT 'aus' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "imprint_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "privacy_text" text DEFAULT '' NOT NULL;