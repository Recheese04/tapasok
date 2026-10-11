import { Pressable, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { OrgOverview } from "../api/types";
import { fmtDate, peso } from "../format";
import { primaryRole, type Role } from "../roles";
import { colors, MIN_TOUCH, radius, space, type } from "../theme";
import { ProgressBar, StatTile, TileGrid } from "./kit";
import { Badge, Card, IconChip, SectionTitle, type Tone } from "./ui";

type IconName = keyof typeof Ionicons.glyphMap;
type Action = { key: string; label: string; icon: IconName; tone: Tone; href: Href };

const PAY_TONE: Record<string, [string, Tone]> = { CONFIRMED: ["Confirmed", "success"], PENDING: ["Pending", "warning"], REJECTED: ["Rejected", "danger"] };

/**
 * The organization-specific part of Home. What appears is decided by the capabilities the server returned for THIS
 * organization (never by a role name alone), and its order and emphasis follow the person's position: money first for the
 * Treasurer and Auditor, events and members for the President, records for the Secretary, events for other officers.
 */
export function OfficerSection({ overview }: { overview: OrgOverview }) {
  const router = useRouter();
  const c = overview.capabilities;
  const role = primaryRole(overview.roles);
  const f = overview.finance;
  const financeFirst = role === "TREASURER" || role === "AUDITOR";
  const go = (href: Href) => () => router.push(href);

  return (
    <View style={{ gap: space.md }}>
      <SectionTitle>{`Organization tools · ${overview.organization.acronym ?? overview.organization.name}`}</SectionTitle>

      {f && financeFirst ? <FinanceHero overview={overview} /> : null}

      {c["fees.manage"] && (f?.pendingCount ?? 0) > 0 ? (
        <Card onPress={go({ pathname: "/manage/finance", params: { tab: "pending" } })} style={{ flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: colors.warningSoft, borderColor: "#F2D79B" }}>
          <IconChip name="time" tone="warning" />
          <View style={{ flex: 1 }}>
            <Text style={[type.h2, { color: colors.warning }]}>{f!.pendingCount} payment{f!.pendingCount === 1 ? "" : "s"} to verify</Text>
            <Text style={type.small}>{peso(f!.pendingVerification)} waiting for your confirmation</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.warning} />
        </Card>
      ) : null}

      <TileGrid>{tilesFor(role, overview, router.push)}</TileGrid>

      {f && !financeFirst ? <FinanceStrip overview={overview} /> : null}

      <ActionGrid actions={actionsFor(role, overview)} />

      {f && financeFirst && (f.recent?.length ?? 0) > 0 ? (
        <>
          <SectionTitle action="See all" onAction={go("/manage/finance")}>Recent payments</SectionTitle>
          <Card style={{ paddingVertical: space.sm }}>
            {f.recent!.slice(0, 3).map((p, i) => {
              const st = PAY_TONE[p.status] ?? [p.status, "muted" as Tone];
              return (
                <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                  <View style={{ flex: 1 }}>
                    <Text style={type.body} numberOfLines={1}>{p.member}</Text>
                    <Text style={type.small} numberOfLines={1}>{p.fee} · {fmtDate(p.at)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text style={[type.h2, { fontVariant: ["tabular-nums"] }]}>{peso(p.amount)}</Text>
                    <Badge label={st[0]} tone={st[1]} />
                  </View>
                </View>
              );
            })}
          </Card>
        </>
      ) : null}
    </View>
  );
}

/** Large collected-money summary: the Treasurer's and Auditor's first screen. All figures come from the server's ledger. */
function FinanceHero({ overview }: { overview: OrgOverview }) {
  const router = useRouter();
  const f = overview.finance!;
  return (
    <Card onPress={() => router.push("/manage/finance")} accessibilityLabel="Open finance" style={{ gap: space.md }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={type.caption}>COLLECTED</Text>
        {!overview.capabilities["fees.manage"] ? <Badge label="Read-only" tone="muted" /> : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
        <Text style={[type.display, { fontVariant: ["tabular-nums"] }]} adjustsFontSizeToFit numberOfLines={1}>{peso(f.collected)}</Text>
        {f.collectionRate !== null ? <Text style={[type.small, { color: colors.success, fontWeight: "700" }]}>{f.collectionRate}% of assessed</Text> : null}
      </View>
      {f.collectionRate !== null ? <ProgressBar value={f.collectionRate} /> : null}
      <View style={{ flexDirection: "row", gap: space.md }}>
        <Mini label="Assessed" value={peso(f.assessed)} />
        <Mini label="Outstanding" value={peso(f.outstanding)} color={Number(f.outstanding) > 0 ? colors.orange : colors.success} />
        <Mini label="Awaiting" value={peso(f.pendingVerification)} />
      </View>
    </Card>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={type.caption}>{label}</Text>
      <Text style={[type.h2, { color: color ?? colors.text, fontVariant: ["tabular-nums"] }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

/** Compact collected / outstanding strip for positions where finance is secondary (President, Adviser). */
function FinanceStrip({ overview }: { overview: OrgOverview }) {
  const router = useRouter();
  const f = overview.finance!;
  return (
    <Card onPress={() => router.push("/manage/finance")} accessibilityLabel="Open finance" style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
      <IconChip name="wallet" tone="orange" />
      <View style={{ flex: 1, flexDirection: "row", gap: space.md }}>
        <Mini label="Collected" value={peso(f.collected)} />
        <Mini label="Outstanding" value={peso(f.outstanding)} color={Number(f.outstanding) > 0 ? colors.orange : colors.success} />
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Card>
  );
}

function tilesFor(role: Role, o: OrgOverview, push: (h: Href) => void) {
  const T = (key: string, icon: IconName, tone: Tone, label: string, value: number | string, href?: Href, sub?: string) => (
    <StatTile key={key} icon={icon} tone={tone} label={label} value={String(value)} sub={sub} onPress={href ? () => push(href) : undefined} />
  );
  const members = o.members, att = o.attendance, f = o.finance;
  const out = [];
  const events = T("events", "calendar", "violet", "Upcoming events", o.events.upcoming, o.capabilities["events.manage"] ? "/manage/events" : "/events");
  const memberTile = members ? T("members", "people", "blue", "Members", members.count, "/manage/members") : null;
  const requests = members && members.pendingJoinRequests !== null ? T("requests", "person-add", "teal", "Join requests", members.pendingJoinRequests, undefined, "Review on the web") : null;
  switch (role) {
    case "PRESIDENT":
      out.push(memberTile, events, att && T("checkins", "checkmark-done", "success", "Check-ins · 30 days", att.checkins30Days), requests ?? (o.obligations && T("obligations", "list", "orange", "Open obligations", o.obligations.open)));
      break;
    case "SECRETARY":
      out.push(memberTile, requests, o.documents && T("docs", "document-text", "success", "Documents", o.documents.count, "/manage/documents"), events);
      break;
    case "TREASURER":
    case "AUDITOR":
      if (f) out.push(T("owing", "alert-circle", "orange", "Members with balance", f.membersWithBalance, "/manage/finance"), T("assessed", "people", "blue", "Members assessed", f.membersAssessed));
      break;
    case "ADVISER":
      out.push(memberTile, att && T("checkins", "checkmark-done", "success", "Check-ins · 30 days", att.checkins30Days), o.evaluations && T("evals", "clipboard", "violet", "Open evaluations", o.evaluations.open), o.obligations && T("obligations", "list", "orange", "Open obligations", o.obligations.open));
      break;
    default: // OFFICER
      out.push(events, att && T("today", "checkmark-done", "success", "Check-ins today", att.checkinsToday), o.obligations && T("obligations", "list", "orange", "Open obligations", o.obligations.open), o.events.drafts !== null && T("drafts", "create", "blue", "Draft events", o.events.drafts, "/manage/events"));
  }
  return out.filter(Boolean);
}

function actionsFor(role: Role, o: OrgOverview): Action[] {
  const c = o.capabilities;
  const all: Action[] = [];
  if (c["fees.manage"]) {
    all.push({ key: "verify", label: "Verify payments", icon: "shield-checkmark", tone: "orange", href: { pathname: "/manage/finance", params: { tab: "pending" } } });
    all.push({ key: "cash", label: "Record payment", icon: "cash", tone: "success", href: { pathname: "/manage/finance", params: { tab: "owing" } } });
  } else if (c["fees.view_org"]) {
    all.push({ key: "reports", label: "Financial records", icon: "document-text", tone: "orange", href: "/manage/finance" });
  }
  if (c["announcements.manage"]) all.push({ key: "ann", label: "New announcement", icon: "megaphone", tone: "teal", href: { pathname: "/manage/announcements", params: { new: "1" } } });
  if (c["events.manage"]) all.push({ key: "event", label: "New event", icon: "add-circle", tone: "violet", href: { pathname: "/manage/events", params: { new: "1" } } });
  if (c["documents.manage"]) all.push({ key: "docs", label: "Documents", icon: "folder-open", tone: "success", href: "/manage/documents" });
  if (c["members.basic"]) all.push({ key: "members", label: "Members", icon: "people", tone: "blue", href: "/manage/members" });
  const order: Record<Role, string[]> = {
    PRESIDENT: ["event", "ann", "verify", "members", "cash", "docs", "reports"],
    TREASURER: ["verify", "cash", "reports", "members"],
    AUDITOR: ["reports", "members"],
    SECRETARY: ["ann", "docs", "event", "members"],
    ADVISER: ["reports", "members"],
    OFFICER: ["event", "members"],
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
        <Pressable
          key={a.key} onPress={() => router.push(a.href)} accessibilityRole="button" accessibilityLabel={a.label}
          style={({ pressed }) => ({ flexBasis: "47%", flexGrow: 1, minHeight: MIN_TOUCH + 8, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: space.md, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.blueSoft, opacity: pressed ? 0.8 : 1 })}
        >
          <Ionicons name={a.icon} size={20} color={colors.blue} />
          <Text style={{ flex: 1, color: colors.blue, fontWeight: "700", fontSize: 13 }} numberOfLines={2}>{a.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
