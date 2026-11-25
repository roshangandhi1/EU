/**
 * Phone-safe entry point: the schools model, domain rules and strings, with no database
 * code. The Android app imports this as "@eu/schools/mobile" (alias "@eu/schools/rules"); nothing here may import @eu/db.
 */
export * from "./model";
export * from "./evidence";
export * from "./capacity";
export * from "./enrolment";
export * from "./attendance";
export * from "./fees";
export * from "./fee-schedule";
export * from "./marks";
export { schools as schoolsEn } from "./i18n/en";
export { schools as schoolsFr } from "./i18n/fr";
