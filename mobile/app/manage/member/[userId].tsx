import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../../src/api/client";
import { Notice } from "../../../src/components/kit";
import {
  Avatar, Badge, Body, Card, Divider, Empty, ErrorState, KeyValue, ListGroup, ListItem, Loading, ProgressBar, ScreenHeader, SectionTitle, SegmentBar, Txt, type IconName, type Tone,
} from "../../../src/components/ui";
import { dayLabel, fmtDate, fmtTime, peso, roleLabel } from "../../../src/format";
import { useOrg } from "../../../src/org/OrgContext";
import { colors, space } from "../../../src/theme";
import { useLoad } from "../../../src/useLoad";

const ATT: Record<string, [string, Tone, IconName]> = {
  PRESENT: ["Present", "success", "checkmark-circle"], LATE: ["Late", "warning", "time"], ABSENT: ["Absent", "danger", "close-circle"], EXCUSED: ["Excused", "info", "document-text"],
};
const FEE: Record<string, [string, Tone]> = { PAID: ["Paid", "success"], PARTIAL: ["Partly paid", "warning"], UNPAID: ["Unpaid", "danger"], CREDIT: ["Credit", "info"] };
const OBL: Record<string, [string, Tone]> = { PENDING: ["Pending", "warning"], IN_PROGRESS: ["In progress", "info"], COMPLETED: ["Completed", "success"], CANCELLED: ["Cancelled", "neutral"], WAIVED: ["Waived", "neutral"] };

/** One member's record in the active organization. Each section appears only if the viewer's position allows it (server-decided). */
export default function MemberDetail() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { org } = useOrg();
  const orgId = org?.id ?? "";
  const { data, error, loading, refreshing, reload, refresh } = useLoad(() => api.orgMember(orgId, userId), [orgId, userId]);
  const first = data?.name.split(" ")[0] ?? "";
  const last = data?.name.split(" ").slice(-1)[0] ?? "";

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader eyebrow={org?.name} title={data?.name ?? "Member"} back={() => router.back()} />
      {loading && !data ? <Loading hero /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : data ? (
        <Body tabs={false} refreshing={refreshing} onRefresh={refresh}>
          <Card style={{ gap: space.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              <Avatar first={first} last={last} size={56} />
              <View style={{ flex: 1 }}>
                <Txt variant="h2" numberOfLines={2}>{data.name}</Txt>
                <Txt variant="small">{[data.studentNumber ?? "No student number", data.yearLevel ? `Year ${data.yearLevel}` : null].filter(Boolean).join(" · ")}</Txt>
                {data.email ? <Txt variant="small" color={colors.textMuted} numberOfLines={1}>{data.email}</Txt> : null}
              </View>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {data.positions.map((p, i) => <Badge key={i} label={roleLabel(p.role, p.title)} tone={p.role === "MEMBER" ? "neutral" : "violet"} icon={p.role === "MEMBER" ? "person" : "ribbon"} />)}
              <Badge label={`Member since ${fmtDate(data.memberSince)}`} tone="neutral" icon="calendar" />
            </View>
            {data.program ? <Txt variant="small">{data.program}</Txt> : null}
          </Card>

          {data.attendance ? <AttendanceBlock a={data.attendance} /> : null}

          {data.finance ? (
            <>
              <SectionTitle caption="Fees assessed by this organization">Fees</SectionTitle>
              <Card style={{ gap: space.sm }}>
                <KeyValue label="Assessed" value={peso(data.finance.due)} />
                <KeyValue label="Paid" value={peso(data.finance.paid)} color={colors.successInk} />
                {Number(data.finance.pending) > 0 ? <KeyValue label="Awaiting verification" value={peso(data.finance.pending)} color={colors.warningInk} /> : null}
                <Divider />
                <KeyValue label="Balance" value={peso(data.finance.balance)} strong color={Number(data.finance.balance) > 0 ? colors.dangerInk : colors.successInk} />
                {Number(data.finance.due) > 0 ? <ProgressBar value={(Number(data.finance.paid) / Number(data.finance.due)) * 100} /> : null}
              </Card>
              {data.finance.fees.length ? (
                <ListGroup>
                  {data.finance.fees.map((f) => {
                    const st = FEE[f.status] ?? [f.status, "neutral" as Tone];
                    return <ListItem key={f.id} title={f.title} subtitle={`Paid ${peso(f.paid)} of ${peso(f.due)}`} right={<View style={{ alignItems: "flex-end", gap: 4 }}><Txt variant="bodyStrong">{peso(f.balance)}</Txt><Badge label={st[0]} tone={st[1]} dot /></View>} />;
                  })}
                </ListGroup>
              ) : <Card><Empty icon="wallet-outline" title="No fees assessed" tone="success" /></Card>}
            </>
          ) : null}

          {data.obligations ? (
            <>
              <SectionTitle>Obligations</SectionTitle>
              {data.obligations.length ? (
                <ListGroup>
                  {data.obligations.map((o) => {
                    const st = OBL[o.status] ?? [o.status, "neutral" as Tone];
                    return <ListItem key={o.id} icon="list" tone={st[1]} title={o.title} subtitle={o.dueAt ? `Due ${fmtDate(o.dueAt)}` : "No due date"} right={<Badge label={st[0]} tone={st[1]} />} />;
                  })}
                </ListGroup>
              ) : <Card><Empty icon="checkmark-done-outline" title="No obligations" tone="success" /></Card>}
            </>
          ) : null}

          {!data.attendance && !data.finance ? (
            <Notice icon="lock-closed" tone="info" title="Limited view" text="Your position can see this member's details but not their attendance or fees." />
          ) : null}
        </Body>
      ) : null}
    </View>
  );
}

function AttendanceBlock({ a }: { a: NonNullable<import("../../../src/api/types").MemberDetail["attendance"]> }) {
  const c = a.counts;
  const total = c.PRESENT + c.LATE + c.ABSENT + c.EXCUSED;
  const tone: Tone = a.rate === null ? "neutral" : a.rate >= 80 ? "success" : a.rate >= 60 ? "warning" : "danger";
  return (
    <>
      <SectionTitle caption="Sessions of this organization's events">Attendance</SectionTitle>
      <Card variant="dark" style={{ gap: space.lg, padding: space.xl }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space.md }}>
          <View>
            <Txt variant="caption" color={colors.onDarkMuted}>Attendance rate</Txt>
            <Txt variant="numberLg" color={colors.onDark}>{a.rate === null ? "—" : `${a.rate}%`}</Txt>
          </View>
          {a.rate !== null ? <Badge label={a.rate >= 80 ? "Good standing" : a.rate >= 60 ? "Needs attention" : "Low attendance"} tone={tone} dot /> : null}
        </View>
        {total ? (
          <SegmentBar onDark segments={[
            { label: "Present", value: c.PRESENT, display: String(c.PRESENT), tone: "success" },
            { label: "Late", value: c.LATE, display: String(c.LATE), tone: "accent" },
            { label: "Absent", value: c.ABSENT, display: String(c.ABSENT), tone: "danger" },
            { label: "Excused", value: c.EXCUSED, display: String(c.EXCUSED), tone: "info" },
          ]} />
        ) : <Txt variant="small" color={colors.onDarkMuted}>No attendance recorded yet.</Txt>}
        <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-start" }}>
          <Ionicons name="information-circle-outline" size={16} color={colors.onDarkMuted} />
          <Txt variant="small" color={colors.onDarkMuted} style={{ flex: 1 }}>
            Present and late out of all sessions recorded{a.onTimeRate !== null ? ` · ${a.onTimeRate}% on time` : ""}. Excused sessions are not counted against them.
          </Txt>
        </View>
      </Card>
      {a.recent.length ? (
        <ListGroup>
          {a.recent.map((r) => {
            const st = ATT[r.status] ?? [r.status, "neutral" as Tone, "ellipse" as IconName];
            return <ListItem key={r.id} icon={st[2]} tone={st[1]} title={r.event} subtitle={`${r.session} · ${dayLabel(r.at)}, ${fmtTime(r.at)}`} right={<Badge label={st[0]} tone={st[1]} />} />;
          })}
        </ListGroup>
      ) : null}
    </>
  );
}
