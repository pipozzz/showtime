CREATE TABLE "report" (
	"id" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"reporter_user_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "hidden_reason" text;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_reporter_user_id_user_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_status_idx" ON "report" USING btree ("status");