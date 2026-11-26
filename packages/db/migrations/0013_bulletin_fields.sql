ALTER TABLE "school_grading_schemes" ADD COLUMN "domains" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "school_grading_schemes" ADD COLUMN "letters" jsonb DEFAULT '["E","TB","B","AB","M"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "school_marks" ADD COLUMN "letter" text;--> statement-breakpoint
ALTER TABLE "school_schools" ADD COLUMN "ministry_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "school_schools" ADD COLUMN "province" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "school_schools" ADD COLUMN "city" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "school_schools" ADD COLUMN "commune" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "school_students" ADD COLUMN "id_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "school_students" ADD COLUMN "perm_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "school_students" ADD COLUMN "birth_place" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "school_subjects" ADD COLUMN "domain" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "school_subjects" ADD COLUMN "branch" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "school_subjects" ADD COLUMN "optional" boolean DEFAULT false NOT NULL;