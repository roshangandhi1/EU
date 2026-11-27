ALTER TABLE "school_schools" ADD COLUMN "levels" jsonb;--> statement-breakpoint
ALTER TABLE "school_terms" ADD COLUMN "kind" text DEFAULT 'trimester' NOT NULL;