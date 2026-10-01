CREATE TABLE "registrations" (
	"id" serial PRIMARY KEY,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"instagram" text,
	"status" text DEFAULT 'eingegangen' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "registrations_created_at_idx" ON "registrations" ("created_at");