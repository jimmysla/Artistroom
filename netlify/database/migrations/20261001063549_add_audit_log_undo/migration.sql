ALTER TABLE "audit_log" ADD COLUMN "undo" jsonb;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "undone_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "undone_by" text;