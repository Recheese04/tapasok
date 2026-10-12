import { Pressable, StyleSheet, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { OrgOverview, OrgPayment } from "../api/types";
import { ago, peso, pesoShort } from "../format";
import { primaryRole, type Role } from "../roles";
import { colors, elevation, MIN_TOUCH, radius, space, tones } from "../theme";
import { Notice } from "./kit";
import { Badge, BarChart, Card, IconChip, ListGroup, ListItem, ProgressBar, SectionTitle, SegmentBar, Txt, type IconName, type Tone } from "./ui";

type Action = { key: string; label: string; icon: IconName; tone: Tone; href: Href };
type Metric = { label: string; value: string };

export const PAY_STATUS: Record<string, [string, Tone]> = { CONFIRMED: ["Confirmed", "success"], PENDING: ["Awaiting", "warning"], REJECTED: ["Rejected", "danger"] };
export const METHOD: Record<string, string> = { CASH: "Cash", GCASH: "GCash", BANK_TRANSFER: "Bank transfer", OTHER: "Other" };

/**
 * The organization-specific part of Home. What appears is decided by the capabilities the server returned for THIS
 * organization (never by a role name alone); order and emphasis follow the position: money first for the Treasurer and
 * Auditor, organization performance for the President, records for the Secretary, events for other officers.
 */
export function OfficerSection({ overview }: { overview: OrgOverview }) {
  const router = useRouter();
  const c = overview.capabilities;
  const role = primaryRole(overview.roles);
  const f = overview.finance;
  const orgName = overview.organization.acronym ?? overview.organization.name;
  const financeFirst = (role === "TREASURER" || role === "AUDITOR") && !!f;

  return (
    <View style={{ gap: space.md }}>
      <SectionTitle caption={roleCaption(role)}>{`${orgName} · Organization tools`}</SectionTitle>

      {financeFirst ? <FinanceHero overview={overview} /> : <OrgHero overview={overview} role={role} />}

      {c["fees.manage"] && (f?.pendingCount ?? 0) > 0 ? (
        <Notice icon="time" tone="warning" title={`${f!.pendingCount} payment${f!.pendingCount === 1 ? "" : "s"} to verify`} text={`${peso(f!.pendingVerification)} waiting for your confirmation`} onPress={() => router.push({ pathname: "/manage/finance", params: { tab: "pending" } })} />
      ) : null}
      {c["expenses.approve"] && (f?.pendingExpenseCount ?? 0) > 0 ? (
        <Notice icon="receipt" tone="danger" title={`${f!.pendingExpenseCount} expense${f!.pendingExpenseCount === 1 ? "" : "s"} to approve`} text={`${peso(f!.pendingExpenses)} waiting for your decision`} onPress={() => router.push({ pathname: "/manage/expenses", params: { filter: "PENDING" } })} />
      ) : null}
      {(overview.members?.pendingJoinRequests ?? 0) > 0 ? (
        <Notice icon="person-add" tone="info" title={`${overview.members!.pendingJoinRequests} join request${overview.members!.pendingJoinRequests === 1 ? "" : "s"}`} text="Review them on the Tapasok website" />
      ) : null}

      <ActionGrid actions={actionsFor(role, overview)} />

      {financeFirst && f?.byMonth ? (
        <Card style={{ gap: space.md }}>
          <ChartHeader title="Collections" caption="Confirmed payments · last 6 months" />
          <BarChart data={f.byMonth.map((m) => ({ label: m.label, value: Number(m.value) }))} format={pesoShort} accessibilityLabel="Collections by month" />
        </Card>
      ) : overview.attendance?.byMonth ? (
        <Card style={{ gap: space.md }}>
          <ChartHeader title="Check-ins" caption={`${overview.attendance.checkins30Days} in the last 30 days · ${overview.attendance.checkinsToday} today`} />
          <BarChart data={overview.attendance.byMonth} accessibilityLabel="Check-ins by month" />
        </Card>
      ) : null}

      {f && !financeFirst ? <FinanceStrip overview={overview} /> : null}

      {financeFirst && (f?.recent?.length ?? 0) > 0 ? (
        <>
          <SectionTitle action="See all" onAction={() => router.push({ pathname: "/manage/finance", params: { tab: "recent" } })}>Recent transactions</SectionTitle>
          <ListGroup>{f!.recent!.slice(0, 4).map((p) => <PaymentItem key={p.id} p={p} />)}</ListGroup>
        </>
      ) : null}
    </View>
  );
}

function roleCaption(role: Role) {
  return {
    PRESIDENT: "Organization performance and management",
    TREASURER: "Collections, balances and payment verification",
    AUDITOR: "Read-only financial oversight",
    SECRETARY: "Records, announcements and membership",
    ADVISER: "Oversight of members, attendance and finance",
    OFFICER: "Events and attendance",
    MEMBER: "",
  }[role];
}

function ChartHeader({ title, caption }: { title: string; caption: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
      <View style={{ flex: 1 }}>
        <Txt variant="h3">{title}</Txt>
        <Txt variant="small" color={colors.textMuted}>{caption}</Txt>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
        <Txt variant="small" color={colors.textMuted}>This month</Txt>
      </View>
    </View>
  );
}

export function PaymentItem({ p }: { p: OrgPayment }) {
  const st = PAY_STATUS[p.status] ?? [p.status, "neutral" as Tone];
  return (
    <ListItem
      icon={p.method === "CASH" ? "cash-outline" : "phone-portrait-outline"} tone={st[1]} title={p.member} subtitle={`${p.fee} · ${METHOD[p.method] ?? p.method} · ${ago(p.at)}`}
      right={<View style={{ alignItems: "flex-end", gap: 4 }}><Txt variant="bodyStrong" style={{ fontVariant: ["tabular-nums"] }}>{peso(p.amount)}</Txt><Badge label={st[0]} tone={st[1]} dot /></View>}
      accessibilityLabel={`${p.member}, ${peso(p.amount)}, ${st[0]}`}
    />
  );
}

/** Treasurer / Auditor hero: verified totals on navy, with the collection split. All figures come from the server's ledger. */
function FinanceHero({ overview }: { overview: OrgOverview }) {
  const router = useRouter();
  const f = overview.finance!;
  return (
    <Card variant="dark" onPress={() => router.push("/manage/finance")} accessibilityLabel={`Collected ${peso(f.collected)}. Open finance`} style={{ gap: space.lg, padding: space.xl }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Txt variant="caption" color={colors.onDarkMuted}>Total collected</Txt>
        {overview.capabilities["fees.manage"] ? <Badge label="Verified ledger" tone="success" icon="shield-checkmark" /> : <Badge label="Read-only" tone="neutral" icon="eye" />}
      </View>
      <View>
        <Txt variant="numberLg" color={colors.onDark} numberOfLines={1} adjustsFontSizeToFit>{peso(f.collected)}</Txt>
        <Txt variant="small" color={colors.onDarkMuted}>{f.collectionRate !== null ? `${f.collectionRate}% of ${peso(f.assessed)} assessed` : "Nothing assessed yet"}</Txt>
      </View>
      <SegmentBar onDark segments={[
        { label: "Collected", value: Number(f.collected), display: peso(f.collected), tone: "success" },
        { label: "Awaiting", value: Number(f.pendingVerification), display: peso(f.pendingVerification), tone: "accent" },
        { label: "Outstanding", value: Number(f.outstanding), display: peso(f.outstanding), tone: "danger" },
      ]} />
      <View style={s.heroFoot}>
        <HeroMetric label="Available balance" value={peso(f.available)} />
        <HeroMetric label="Approved expenses" value={peso(f.expenses)} />
      </View>
    </Card>
  );
}

/** Organization overview hero for the President, Secretary, Adviser and officers: the 3 numbers that matter to that position. */
function OrgHero({ overview, role }: { overview: OrgOverview; role: Role }) {
  const o = overview;
  const m: Metric[] = [];
  const members = o.members ? { label: "Members", value: String(o.members.count) } : null;
  const events = { label: "Upcoming events", value: String(o.events.upcoming) };
  const checkins = o.attendance ? { label: "Check-ins · 30d", value: String(o.attendance.checkins30Days) } : null;
  if (role === "SECRETARY") m.push(...[members, o.documents && { label: "Documents", value: String(o.documents.count) }, o.announcements && { label: "Posts published", value: String(o.announcements.published) }].filter(Boolean) as Metric[]);
  else if (role === "OFFICER") m.push(...[events, o.attendance && { label: "Check-ins today", value: String(o.attendance.checkinsToday) }, o.obligations && { label: "Open obligations", value: String(o.obligations.open) }].filter(Boolean) as Metric[]);
  else if (role === "ADVISER") m.push(...[members, checkins, o.evaluations && { label: "Open evaluations", value: String(o.evaluations.open) }].filter(Boolean) as Metric[]);
  else m.push(...[members, events, checkins].filter(Boolean) as Metric[]);
  const lead = m[0];
  const rest = m.slice(1);
  return (
    <Card variant="dark" style={{ gap: space.lg, padding: space.xl }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Txt variant="caption" color={colors.onDarkMuted}>{overview.organization.name}</Txt>
        <Badge label={roleTitle(overview)} tone="accent" icon="ribbon" />
      </View>
      {lead ? (
        <View>
          <Txt variant="numberLg" color={colors.onDark}>{lead.value}</Txt>
          <Txt variant="small" color={colors.onDarkMuted}>{lead.label}</Txt>
        </View>
      ) : null}
      {rest.length ? <View style={s.heroFoot}>{rest.map((x) => <HeroMetric key={x.label} {...x} />)}</View> : null}
    </Card>
  );
}

const roleTitle = (o: OrgOverview) => {
  const r = primaryRole(o.roles);
  return o.roles.find((x) => x.role === r)?.title ?? r.charAt(0) + r.slice(1).toLowerCase();
};

function HeroMetric({ label, value }: Metric) {
  return (
    <View style={{ flex: 1 }}>
      <Txt variant="number" color={colors.onDark}>{value}</Txt>
      <Txt variant="small" color={colors.onDarkMuted} numberOfLines={2}>{label}</Txt>
    </View>
  );
}

/** Compact collected / outstanding for positions where finance is secondary (President, Adviser). */
function FinanceStrip({ overview }: { overview: OrgOverview }) {
  const router = useRouter();
  const f = overview.finance!;
  return (
    <Card onPress={() => router.push("/manage/finance")} accessibilityLabel={`Finance: collected ${peso(f.collected)}, outstanding ${peso(f.outstanding)}`} style={{ gap: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <IconChip name="wallet" tone="accent" size={40} />
        <View style={{ flex: 1 }}>
          <Txt variant="h3">Finance</Txt>
          <Txt variant="small" color={colors.textMuted}>{f.collectionRate !== null ? `${f.collectionRate}% collected` : "Nothing assessed yet"}{overview.capabilities["fees.manage"] ? "" : " · read-only"}</Txt>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
      {f.collectionRate !== null ? <ProgressBar value={f.collectionRate} tone="success" /> : null}
      <View style={{ flexDirection: "row", gap: space.lg }}>
        <View style={{ flex: 1 }}><Txt variant="caption">Collected</Txt><Txt variant="h3" style={{ fontVariant: ["tabular-nums"] }}>{peso(f.collected)}</Txt></View>
        <View style={{ flex: 1 }}><Txt variant="caption">Outstanding</Txt><Txt variant="h3" color={Number(f.outstanding) > 0 ? colors.dangerInk : colors.successInk} style={{ fontVariant: ["tabular-nums"] }}>{peso(f.outstanding)}</Txt></View>
      </View>
    </Card>
  );
}

function actionsFor(role: Role, o: OrgOverview): Action[] {
  const c = o.capabilities;
  const all: Action[] = [];
  if (c["fees.manage"]) {
    all.push({ key: "verify", label: "Verify payments", icon: "shield-checkmark", tone: "warning", href: { pathname: "/manage/finance", params: { tab: "pending" } } });
    all.push({ key: "cash", label: "Record payment", icon: "cash", tone: "success", href: { pathname: "/manage/finance", params: { tab: "owing" } } });
  } else if (c["fees.view_org"]) {
    all.push({ key: "reports", label: "Financial records", icon: "bar-chart", tone: "accent", href: "/manage/finance" });
    all.push({ key: "balances", label: "Balances", icon: "list", tone: "danger", href: { pathname: "/manage/finance", params: { tab: "owing" } } });
  }
  if (c["expenses.record"]) all.push({ key: "expense", label: "Record expense", icon: "receipt", tone: "danger", href: { pathname: "/manage/expenses", params: { new: "1" } } });
  if (c["expenses.approve"]) all.push({ key: "approveExp", label: "Approve expenses", icon: "checkmark-done", tone: "danger", href: { pathname: "/manage/expenses", params: { filter: "PENDING" } } });
  else if (c["fees.view_org"] && !c["expenses.record"]) all.push({ key: "spending", label: "Expenses", icon: "receipt", tone: "danger", href: "/manage/expenses" });
  if (c["announcements.manage"]) all.push({ key: "ann", label: "New announcement", icon: "megaphone", tone: "teal", href: { pathname: "/manage/announcements", params: { new: "1" } } });
  if (c["events.manage"]) all.push({ key: "event", label: "New event", icon: "add-circle", tone: "violet", href: { pathname: "/manage/events", params: { new: "1" } } });
  if (c["events.manage"]) all.push({ key: "events", label: "Manage events", icon: "calendar", tone: "primary", href: "/manage/events" });
  if (c["documents.manage"]) all.push({ key: "docs", label: "Documents", icon: "folder-open", tone: "success", href: "/manage/documents" });
  if (c["members.basic"]) all.push({ key: "members", label: "Members", icon: "people", tone: "info", href: "/manage/members" });
  const order: Record<Role, string[]> = {
    PRESIDENT: ["approveExp", "event", "ann", "verify"],
    TREASURER: ["verify", "expense", "cash", "reports"],
    AUDITOR: ["reports", "spending", "balances", "members"],
    SECRETARY: ["ann", "docs", "event", "members"],
    ADVISER: ["reports", "spending", "members", "balances"],
    OFFICER: ["event", "events", "members"],
    MEMBER: [],
  };
  const rank = (k: string) => { const i = order[role].indexOf(k); return i === -1 ? 99 : i; };
  return all.sort((a, b) => rank(a.key) - rank(b.key)).slice(0, 4);
}

function ActionGrid({ actions }: { actions: Action[] }) {
  const router = useRouter();
  if (!actions.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
      {actions.map((a) => (
        <Pressable key={a.key} onPress={() => router.push(a.href)} accessibilityRole="button" accessibilityLabel={a.label} style={({ pressed }) => [s.action, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}>
          <View style={[s.actionIcon, { backgroundColor: tones[a.tone].soft }]}><Ionicons name={a.icon} size={20} color={tones[a.tone].solid} /></View>
          <Txt variant="smallStrong" style={{ flex: 1 }} numberOfLines={2}>{a.label}</Txt>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  heroFoot: { flexDirection: "row", gap: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.22)" },
  action: { flexBasis: "47%", flexGrow: 1, maxWidth: "49%", minHeight: MIN_TOUCH + 12, flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...elevation.sm },
  actionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
