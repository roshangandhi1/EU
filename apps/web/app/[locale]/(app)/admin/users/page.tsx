import { redirect } from "next/navigation";
import { isLocale, t, type Locale } from "@eu/core/i18n";
import { ROLES } from "@eu/core";
import { currentPrincipal } from "@/lib/session";
import { permissions } from "@/lib/registry";
import { db } from "@/lib/http";
import { assignableSites, listUsers, ROLE_SCOPES } from "@/lib/users";
import { ConfirmButton, Field, Fields, FormFooter, Notice, PageHeader, RowMenu, Section, SubmitButton } from "@/components/ui";
import { Icon } from "@/components/icons";
import { usersAction } from "./actions";
import { NoAccess } from "@/components/no-access";
import { RowFilter } from "@/components/row-filter";
import { titled } from "@/lib/meta";

export const dynamic = "force-dynamic";
export const generateMetadata = titled("ui.users.title");

const STREAMS = ["schools", "boreholes", "bamboo", "miombo"] as const;

export default async function UsersPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ done?: string; err?: string; name?: string; email?: string; roleScope?: string; userLocale?: string }> }) {
  const { locale: l } = await params;
  if (!isLocale(l)) return null;
  const locale: Locale = l;
  const me = await currentPrincipal();
  if (!me) redirect(`/${locale}/login`);
  const u = (k: string) => t(locale, `ui.${k}`);
  if (!permissions.can(me.user, "users.manage", { stream: "platform" })) return <NoAccess locale={locale} reason={u("users.err.forbidden")} />;
  const sp = await searchParams;
  const sysAdmin = me.user.assignments.some((a) => a.role === "system_admin" && a.scope.type === "global");
  const [rows, siteList] = await Promise.all([listUsers(db()), assignableSites(db())]);
  const roleLabel = (r: string) => u(`roles.${r}`);
  const scopeLabel = (r: { scopeType: string; scopeValue: string | null; siteName?: string }) =>
    r.scopeType === "global" ? u("users.scopeGlobal") : r.scopeType === "stream" ? u(`streams.${r.scopeValue}`) : (r.siteName ?? r.scopeValue ?? "");

  // One select listing every valid (role, where) pair, grouped by role, so a wrong combination can't be picked.
  const options = ROLES.filter((r) => sysAdmin || (r !== "system_admin" && r !== "programme_manager")).map((role) => {
    const rule = ROLE_SCOPES[role];
    const opts: { value: string; label: string }[] = [];
    if (rule.kinds.includes("global") && sysAdmin) opts.push({ value: "global", label: u("users.scopeGlobal") });
    if (rule.kinds.includes("stream")) for (const s of STREAMS) opts.push({ value: `stream:${s}`, label: u(`streams.${s}`) });
    if (rule.kinds.includes("site")) for (const s of siteList.filter((x) => rule.siteKinds?.includes(x.kind))) opts.push({ value: `site:${s.id}`, label: s.name });
    return { role, opts };
  }).filter((g) => g.opts.length > 0);
  const f = (k: string) => t(locale, `ui.form.${k}`);
  const keep = sp.err ? sp : {};
  const RolePicker = ({ value = "" }: { value?: string }) => (
    <Field span={12} label={`${u("users.role")} · ${u("users.scope")}`}>
      <select name="roleScope" required defaultValue={value}>
        <option value="" disabled>—</option>
        {options.map((g) => (
          <optgroup key={g.role} label={roleLabel(g.role)}>
            {g.opts.map((o) => <option key={o.value} value={`${g.role}|${o.value}`}>{roleLabel(g.role)} — {o.label}</option>)}
          </optgroup>
        ))}
      </select>
    </Field>
  );

  return (
    <div data-stream="platform">
      <PageHeader icon={<Icon name="users" size={24} />} title={u("users.title")} subtitle={u("users.intro")} />
      {sp.done && <Notice tone="success">{u(`users.done.${sp.done}`)}</Notice>}
      {sp.err && <Notice tone="error">{u(`users.err.${sp.err}`)}</Notice>}

      <div className="split">
        <div className="table-wrap">
          <RowFilter target="user-rows" placeholder={u("users.search")} noMatch={u("users.noMatch")} shown={u("users.shown")} />
          <table className="dash users" id="user-rows">
            <thead><tr><th>{u("users.name")}</th><th>{u("users.roles")}</th><th>{u("users.lastLogin")}</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.active ? undefined : "inactive"} data-q={`${r.name} ${r.email}`}>
                  <td>
                    <div className="strong">{r.name}{r.id === me.user.id && <span className="muted"> ({u("users.you")})</span>}</div>
                    <div className="muted small">{r.email}</div>
                  </td>
                  <td>
                    <ul className="role-list">
                      {r.roles.map((ra) => (
                        <li key={ra.id}>
                          <span className="pill info">{roleLabel(ra.role)}</span> <span className="small">{scopeLabel(ra)}</span>
                          <form action={usersAction} className="inline">
                            <input type="hidden" name="locale" value={locale} /><input type="hidden" name="op" value="removeRole" /><input type="hidden" name="assignmentId" value={ra.id} />
                            <ConfirmButton icon="x" label={`${u("users.remove")} ${roleLabel(ra.role)}`} confirm={u("users.removeRoleConfirm")} yes={f("yesRemove")} no={f("keep")} />
                          </form>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td>{r.active ? <span className="pill good">{u("users.active")}</span> : <span className="pill bad">{u("users.inactive")}</span>}</td>
                  <td>
                    <RowMenu label={f("more")} wide>
                      <form action={addRoleAction(locale, r.id)}>
                        <Fields><RolePicker /></Fields>
                        <FormFooter><SubmitButton small icon="plus" pending={f("saving")}>{u("users.addRole")}</SubmitButton></FormFooter>
                      </form>
                      <form action={usersAction}>
                        <input type="hidden" name="locale" value={locale} /><input type="hidden" name="op" value="reset" /><input type="hidden" name="userId" value={r.id} />
                        <Fields><Field span={12} label={u("users.newPassword")} hint={u("users.passwordHint")}><input name="password" type="text" minLength={10} required autoComplete="off" /></Field></Fields>
                        <FormFooter><SubmitButton small variant="secondary" pending={f("saving")}>{u("users.resetPassword")}</SubmitButton></FormFooter>
                      </form>
                      {r.id !== me.user.id && (
                        <form action={usersAction}>
                          <input type="hidden" name="locale" value={locale} /><input type="hidden" name="op" value={r.active ? "deactivate" : "reactivate"} /><input type="hidden" name="userId" value={r.id} />
                          {r.active
                            ? <ConfirmButton text={u("users.deactivate")} label={`${u("users.deactivate")} ${r.name}`} icon="x" confirm={t(locale, "ui.users.deactivateConfirm", { name: r.name })} yes={u("users.yesDeactivate")} no={f("cancel")} />
                            : <SubmitButton small variant="primary">{u("users.reactivate")}</SubmitButton>}
                        </form>
                      )}
                    </RowMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Section icon="plus" title={u("users.add")} className="user-add">
          <form action={createAction(locale)}>
            <Fields>
              <Field span={12} label={u("users.name")}><input name="name" required minLength={2} autoComplete="off" defaultValue={keep.name ?? ""} /></Field>
              <Field span={12} label={u("users.email")}><input name="email" type="email" required autoComplete="off" placeholder="nom@gocongo.cd" defaultValue={keep.email ?? ""} /></Field>
              <Field span={12} label={u("users.password")} hint={u("users.passwordHint")}><input name="password" type="text" minLength={10} required autoComplete="off" /></Field>
              <RolePicker value={keep.roleScope ?? ""} />
              <Field span={12} label={t(locale, "common.language")}>
                <select name="userLocale" defaultValue={keep.userLocale === "en" ? "en" : "fr"}><option value="fr">Français</option><option value="en">English</option></select>
              </Field>
            </Fields>
            <FormFooter><SubmitButton icon="plus" pending={f("saving")}>{u("users.create")}</SubmitButton></FormFooter>
          </form>
        </Section>
      </div>
    </div>
  );
}

/** The role picker submits "role|scope"; split it before calling the shared action. */
function createAction(locale: string) {
  return async (fd: FormData) => {
    "use server";
    const [role, scope] = String(fd.get("roleScope") ?? "").split("|");
    fd.set("role", role ?? ""); fd.set("scope", scope ?? ""); fd.set("op", "create"); fd.set("locale", locale);
    await usersAction(fd);
  };
}
function addRoleAction(locale: string, userId: string) {
  return async (fd: FormData) => {
    "use server";
    const [role, scope] = String(fd.get("roleScope") ?? "").split("|");
    fd.set("role", role ?? ""); fd.set("scope", scope ?? ""); fd.set("op", "addRole"); fd.set("locale", locale); fd.set("userId", userId);
    await usersAction(fd);
  };
}
