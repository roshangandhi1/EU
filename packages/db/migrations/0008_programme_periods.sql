CREATE TABLE "programme_outcomes" (
	"code" text PRIMARY KEY NOT NULL,
	"sort" integer NOT NULL,
	"target_en" text NOT NULL,
	"target_fr" text NOT NULL,
	"reported_en" text,
	"reported_fr" text,
	"reported_on" date,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programme_period_indicators" (
	"period_n" integer NOT NULL,
	"code" text NOT NULL,
	"target" numeric DEFAULT 0 NOT NULL,
	"validated" numeric,
	"note_en" text,
	"note_fr" text,
	CONSTRAINT "programme_period_indicators_period_n_code_pk" PRIMARY KEY("period_n","code")
);
--> statement-breakpoint
CREATE TABLE "programme_periods" (
	"n" integer PRIMARY KEY NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"tpa_from" date,
	"tpa_to" date,
	"note_en" text,
	"note_fr" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "programme_period_indicators" ADD CONSTRAINT "programme_period_indicators_period_n_programme_periods_n_fk" FOREIGN KEY ("period_n") REFERENCES "public"."programme_periods"("n") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "programme_periods" ("n","starts_on","ends_on","status","tpa_from","tpa_to","note_en","note_fr") VALUES (1,'2026-01-01','2026-10-16','validated','2026-10-12','2026-10-16','Third-party assessment by Expertise France. Request for payment No 1 sent on 26 Oct 2026.','Évaluation tierce par Expertise France. Demande de paiement n° 1 envoyée le 26 oct. 2026.'),(2,'2026-10-17','2027-10-16','open',NULL,NULL,'Forecast budget requested in full as further pre-financing (request for payment No 1, 26 Oct 2026).','Budget prévisionnel demandé en totalité en préfinancement (demande de paiement n° 1, 26 oct. 2026).');
--> statement-breakpoint
INSERT INTO "programme_period_indicators" ("period_n","code","target","validated","note_en","note_fr") VALUES
(1,'1.1.1',30,2,NULL,NULL),
(2,'1.1.1',65,NULL,'The assessor asks for a technical sheet per borehole (drilling log, flow rate, acceptance report, geotagged photos) and a list of trained community representatives.','L''évaluateur demande une fiche technique par forage (journal de forage, débit, PV de réception, photos géolocalisées) et la liste des représentants communautaires formés.'),
(1,'1.2.1',1,1,NULL,NULL),
(2,'1.2.1',0,NULL,NULL,NULL),
(1,'1.2.2',0,1,NULL,NULL),
(2,'1.2.2',0,NULL,NULL,NULL),
(1,'1.2.3',300,520,NULL,NULL),
(2,'1.2.3',480,NULL,'The next assessment visits a sample of farmers certified in year 1 to check they apply the techniques in the field. Record each module separately and certify only after all three.','La prochaine évaluation vérifie auprès d''un échantillon de producteurs certifiés en année 1 la mise en pratique au champ. Enregistrer chaque module séparément et ne certifier qu''après les trois.'),
(1,'2.1.1',200,0,NULL,NULL),
(2,'2.1.1',500,NULL,'The next assessment checks the first hectares planted. Provide the polygons of the 100 ha delineated, at 300 native seedlings per hectare or more.','La prochaine évaluation vérifie les premiers hectares plantés. Fournir les polygones des 100 ha délimités, à 300 plants natifs par hectare au moins.'),
(1,'2.2.1',100,39,NULL,NULL),
(2,'2.2.1',260,NULL,'The next assessment checks establishment of the 39 ha paid in year 1: living clumps of at least 320 per hectare (GoCongo''s specification is 400). Payment is adjusted if establishment falls short; replant gaps.','La prochaine évaluation vérifie l''établissement des 39 ha payés en année 1 : au moins 320 touffes vivantes par hectare (la spécification GoCongo est de 400). Le paiement est ajusté si l''établissement est insuffisant ; regarnir les vides.'),
(1,'3.1.1',1,1,NULL,NULL),
(2,'3.1.1',1,NULL,NULL,NULL),
(1,'3.1.2',0,1,NULL,NULL),
(2,'3.1.2',1,NULL,NULL,NULL),
(1,'3.1.3',0,0,NULL,NULL),
(2,'3.1.3',2,NULL,NULL,NULL),
(1,'3.1.4',0,0,NULL,NULL),
(2,'3.1.4',500,NULL,NULL,NULL),
(1,'3.2.1',2,2,NULL,NULL),
(2,'3.2.1',3,NULL,NULL,NULL),
(1,'3.2.2',400,470,NULL,NULL),
(2,'3.2.2',1130,NULL,NULL,NULL),
(1,'4.1.1',1,1,NULL,NULL),
(2,'4.1.1',1,NULL,NULL,NULL);
--> statement-breakpoint
INSERT INTO "programme_outcomes" ("code","sort","target_en","target_fr","reported_en","reported_fr","reported_on") VALUES
('1.1',1,'To be defined by the baseline survey (2026)','À définir par l''enquête de base (2026)','500+ people at Luniemu','500+ personnes à Luniemu','2026-10-16'),
('1.2',2,'To be defined by the baseline survey (2026)','À définir par l''enquête de base (2026)','Initial baseline survey: calorie intake far below requirement, sometimes as low as 300 a day','Enquête de base initiale : apport calorique très inférieur aux besoins, parfois 300 calories par jour','2026-10-16'),
('2.1',3,'3,000 hectares by 2030','3 000 hectares d''ici 2030','0 ha regenerated; 100 ha delineated','0 ha régénéré ; 100 ha délimités','2026-10-16'),
('3.1',4,'Measured once the TVET centre is finished and intake begins','Mesuré une fois le centre EFTP achevé et les admissions ouvertes','0','0','2026-10-16'),
('3.2',5,'To be defined by the baseline survey','À définir par l''enquête de base','0 (TVET centre not yet finished)','0 (centre EFTP pas encore achevé)','2026-10-16');
