CREATE TABLE "access_request" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"link" text,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invited_at" timestamp with time zone,
	"joined_at" timestamp with time zone,
	CONSTRAINT "access_request_email_unique" UNIQUE("email"),
	CONSTRAINT "access_request_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE INDEX "access_request_status_idx" ON "access_request" USING btree ("status");