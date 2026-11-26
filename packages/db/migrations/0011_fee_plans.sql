CREATE TABLE "school_fee_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scope_id" text NOT NULL,
	"created_by" text NOT NULL,
	"device_id" text NOT NULL,
	"device_time" timestamp with time zone NOT NULL,
	"server_time" timestamp with time zone NOT NULL,
	"updated_server_time" timestamp with time zone NOT NULL,
	"edited_device_time" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"field_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"clock_suspect" boolean DEFAULT false NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"academic_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"levels" jsonb NOT NULL,
	"amount_cdf" integer NOT NULL,
	"frequency" text NOT NULL,
	"due_day" integer,
	"due_on" date,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL
);
--> statement-breakpoint
ALTER TABLE "school_fee_items" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "school_fee_items" ADD COLUMN "period_ends_on" date;--> statement-breakpoint
-- Trimester fees charge for their trimester: a pupil enrolling after it ended is not charged.
-- Bump version and updated_server_time so phones pull the new value.
UPDATE "school_fee_items" AS fi SET "period_ends_on" = t."ends_on", "version" = fi."version" + 1, "updated_server_time" = now()
FROM "school_terms" AS t WHERE fi."term_id" = t."id" AND fi."period_ends_on" IS NULL;
