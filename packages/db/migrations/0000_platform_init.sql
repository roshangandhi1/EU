CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"record_id" text NOT NULL,
	"scope_id" text,
	"op" text NOT NULL,
	"user_id" text NOT NULL,
	"device_id" text,
	"device_time" timestamp with time zone,
	"server_time" timestamp with time zone DEFAULT now() NOT NULL,
	"clock_suspect" boolean DEFAULT false NOT NULL,
	"mutation_id" uuid,
	"old_values" jsonb,
	"new_values" jsonb,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "change_log" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"record_id" text NOT NULL,
	"scope_id" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"last_skew_ms" integer,
	"app_version" text,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"ok" boolean NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"device_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"stream" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	"lat" double precision,
	"lng" double precision,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity" text NOT NULL,
	"record_id" text NOT NULL,
	"scope_id" text NOT NULL,
	"field" text NOT NULL,
	"server_value" jsonb,
	"client_value" jsonb,
	"mutation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"device_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sync_mutations" (
	"mutation_id" uuid PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"user_id" text NOT NULL,
	"entity" text NOT NULL,
	"record_id" text NOT NULL,
	"status" text NOT NULL,
	"result" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"locale" text DEFAULT 'fr' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_record" ON "audit_log" USING btree ("entity","record_id");--> statement-breakpoint
CREATE INDEX "role_assignments_user" ON "role_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sites_kind" ON "sites" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "sync_conflicts_open" ON "sync_conflicts" USING btree ("status","scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));