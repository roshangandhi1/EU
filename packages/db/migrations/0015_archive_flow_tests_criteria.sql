CREATE TABLE "site_archives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" text NOT NULL,
	"kind" text NOT NULL,
	"stream" text NOT NULL,
	"name" text NOT NULL,
	"reason" text NOT NULL,
	"records" jsonb NOT NULL,
	"archived_by" text NOT NULL,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL,
	"restored_by" text,
	"restored_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "borehole_settings" ADD COLUMN "criteria" jsonb;--> statement-breakpoint
ALTER TABLE "borehole_attributes" ADD COLUMN "has_taps" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "borehole_visits" ADD COLUMN "undertaker" text;--> statement-breakpoint
CREATE INDEX "site_archives_site" ON "site_archives" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "site_archives_kind" ON "site_archives" USING btree ("kind","restored_at");