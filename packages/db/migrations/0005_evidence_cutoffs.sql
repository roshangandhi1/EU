CREATE TABLE "evidence_cutoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"cutoff_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_decisions" (
	"cutoff_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"record_id" text NOT NULL,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"decided_by" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "pending_changes" integer;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "pending_photos" integer;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "status_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "evidence_decisions" ADD CONSTRAINT "evidence_decisions_cutoff_id_evidence_cutoffs_id_fk" FOREIGN KEY ("cutoff_id") REFERENCES "public"."evidence_cutoffs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_decisions_record" ON "evidence_decisions" USING btree ("cutoff_id","entity","record_id");