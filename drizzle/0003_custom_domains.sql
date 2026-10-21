ALTER TABLE "profile" ADD COLUMN "custom_domain" text;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "domain_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_custom_domain_unique" UNIQUE("custom_domain");