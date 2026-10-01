CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"username" text,
	"action" text NOT NULL,
	"target" text,
	"details" text,
	"registration_id" integer
);
--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "is_super" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "permissions" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" ("action");