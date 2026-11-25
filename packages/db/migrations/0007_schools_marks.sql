CREATE TABLE "school_grading_schemes" (
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
	"name" text NOT NULL,
	"terms" jsonb NOT NULL,
	"exam_factor" double precision DEFAULT 2 NOT NULL,
	"pass_percent" integer DEFAULT 50 NOT NULL,
	"mentions" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_marks" (
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
	"student_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"period" text NOT NULL,
	"score" double precision,
	"absent" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_subjects" (
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
	"level" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"max_points" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "school_marks_class_period" ON "school_marks" USING btree ("class_id","period");--> statement-breakpoint
CREATE INDEX "school_subjects_scope_level" ON "school_subjects" USING btree ("scope_id","level");