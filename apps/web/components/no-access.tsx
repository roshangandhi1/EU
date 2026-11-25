import Link from "next/link";
import { t, type Locale } from "@eu/core/i18n";
import { Icon } from "@/components/icons";

/**
 * The one "no access" state for signed-in pages: what happened, what to do, and a way home.
 * `reason` is the page's own sentence (e.g. "You don't have access to the boreholes.").
 */
export function NoAccess({ locale, reason }: { locale: Locale; reason?: string }) {
  const u = (k: string) => t(locale, `ui.noAccess.${k}`);
  return (
    <div className="empty-state no-access" role="status">
      <div className="es-icon"><Icon name="lock" size={28} /></div>
      <h1>{u("title")}</h1>
      {reason && <p className="strong">{reason}</p>}
      <p>{u("body")}</p>
      <div className="es-actions"><Link className="btn" href={`/${locale}`}><Icon name="home" size={16} />{u("home")}</Link></div>
    </div>
  );
}
