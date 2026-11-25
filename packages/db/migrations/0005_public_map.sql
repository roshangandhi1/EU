CREATE TABLE "public_map_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"layer" text NOT NULL,
	"published_by" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"as_at" text NOT NULL,
	"data" jsonb NOT NULL,
	"summary" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "public_map_layer_idx" ON "public_map_snapshots" USING btree ("layer","published_at");