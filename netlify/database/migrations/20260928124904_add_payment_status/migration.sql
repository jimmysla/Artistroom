ALTER TABLE "registrations" ADD COLUMN "amount_cents" integer;--> statement-breakpoint
ALTER TABLE "registrations" ALTER COLUMN "status" SET DEFAULT 'ausstehend';