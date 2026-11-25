// Importing the registry registers the schools strings with @eu/core/i18n.
import "@/lib/registry";

export const dynamic = "force-dynamic";

export default function SchoolsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
