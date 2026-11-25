CREATE TABLE "school_absences" (
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
	"date" date NOT NULL,
	"reason" text DEFAULT 'unknown' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_academic_years" (
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
	"label" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_classes" (
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
	"level" integer NOT NULL,
	"section" text DEFAULT 'A' NOT NULL,
	"shift" text NOT NULL,
	"classroom_id" uuid
);
--> statement-breakpoint
CREATE TABLE "school_classrooms" (
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
	"seats_per_shift" integer NOT NULL,
	"basis" text NOT NULL,
	"commissioned_on" date NOT NULL,
	"decommissioned_on" date,
	"evidence_url" text
);
--> statement-breakpoint
CREATE TABLE "school_enrolments" (
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
	"academic_year_id" uuid NOT NULL,
	"enrolled_on" date NOT NULL,
	"left_on" date,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_exemptions" (
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
	"fee_item_id" uuid,
	"kind" text NOT NULL,
	"value" integer NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_fee_items" (
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
	"term_id" uuid,
	"name" text NOT NULL,
	"levels" jsonb NOT NULL,
	"amount_cdf" integer NOT NULL,
	"due_on" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_payments" (
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
	"paid_on" date NOT NULL,
	"amount_cdf" integer NOT NULL,
	"receipt_number" integer NOT NULL,
	"fee_item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_receipt_books" (
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
	"first_number" integer NOT NULL,
	"last_number" integer NOT NULL,
	"assigned_to" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_registers" (
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
	"class_id" uuid NOT NULL,
	"date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_schools" (
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
	"site_id" text NOT NULL,
	"code" text NOT NULL,
	"locale" text DEFAULT 'fr' NOT NULL,
	"shifts_running" jsonb NOT NULL,
	CONSTRAINT "school_schools_site_id_unique" UNIQUE("site_id")
);
--> statement-breakpoint
CREATE TABLE "school_students" (
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
	"student_number" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"post_name" text DEFAULT '' NOT NULL,
	"sex" text NOT NULL,
	"date_of_birth" date,
	"birth_year_estimate" integer,
	"guardian_name" text DEFAULT '' NOT NULL,
	"guardian_phone" text DEFAULT '' NOT NULL,
	"village" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_terms" (
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
	"number" integer NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL
);
--> statement-breakpoint
CREATE INDEX "school_absences_class_date" ON "school_absences" USING btree ("class_id","date");--> statement-breakpoint
CREATE INDEX "school_enrolments_class" ON "school_enrolments" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "school_payments_student" ON "school_payments" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "school_payments_receipt" ON "school_payments" USING btree ("scope_id","receipt_number");--> statement-breakpoint
CREATE INDEX "school_registers_class_date" ON "school_registers" USING btree ("class_id","date");--> statement-breakpoint
CREATE INDEX "school_students_scope" ON "school_students" USING btree ("scope_id");