ALTER TABLE "school_payments" ALTER COLUMN "receipt_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "school_payments" ADD COLUMN "receipt_code" text;--> statement-breakpoint
ALTER TABLE "school_schools" ADD COLUMN "paper_receipt_required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "school_payments_code" ON "school_payments" USING btree ("scope_id","receipt_code");--> statement-breakpoint
-- Payments recorded before system receipt numbers: their number becomes school code + paper number
-- (e.g. KIA-0042), which cannot clash with new numbers (those carry a device letter: KIA-W-0001).
-- Version bumped so phones pull the new value.
UPDATE "school_payments" AS p SET "receipt_code" = upper(s."code") || '-' || lpad(p."receipt_number"::text, 4, '0'), "version" = p."version" + 1, "updated_server_time" = now()
FROM "school_schools" AS s WHERE s."site_id" = p."scope_id" AND p."receipt_code" IS NULL AND p."receipt_number" IS NOT NULL;
