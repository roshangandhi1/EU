CREATE TABLE "school_device_tags" (
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
	"phone_id" text NOT NULL,
	"tag" text NOT NULL
);
