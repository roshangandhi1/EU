import { redirect } from "next/navigation";
import { DEFAULT_LOCALE } from "@eu/core/i18n";

export default function Root() {
  redirect(`/${DEFAULT_LOCALE}`);
}
