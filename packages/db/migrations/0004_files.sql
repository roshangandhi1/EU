CREATE TABLE "files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"scope_id" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"blob_path" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"accuracy_m" double precision,
	"taken_at" timestamp with time zone NOT NULL,
	"clock_suspect" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"device_id" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "files_scope" ON "files" USING btree ("scope_id");