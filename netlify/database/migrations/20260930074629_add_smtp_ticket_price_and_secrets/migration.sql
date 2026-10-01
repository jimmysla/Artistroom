CREATE TABLE "app_secrets" (
	"name" text PRIMARY KEY,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "ticket_price" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "smtp_host" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "smtp_port" text DEFAULT '587' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "smtp_security" text DEFAULT 'starttls' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "smtp_user" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "smtp_password" text DEFAULT '' NOT NULL;