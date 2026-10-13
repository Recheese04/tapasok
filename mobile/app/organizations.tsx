import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { ApiError, api } from "../src/api/client";
import type { JoinableOrg } from "../src/api/types";
import { useOrg } from "../src/org/OrgContext";
import { useAuth } from "../src/auth/AuthContext";
import { Badge, Body, Button, Card, Empty, ErrorState, ListGroup, ListItem, Loading, ScreenHeader, SectionTitle, Txt } from "../src/components/ui";
import { useConfirm, useToast } from "../src/components/kit";
import { fmtDate, roleLabel } from "../src/format";
import { colors, fonts, space } from "../src/theme";
import { useLoad } from "../src/useLoad";

const SCOPE: Record<string, string> = { DEPARTMENTAL: "Departmental", COLLEGE_WIDE: "College-wide", UNIVERSITY_WIDE: "University-wide" };

export default function Organizations() {
  const router = useRouter();
  const { org: active, setActiveOrgId } = useOrg();
  const { data, error, loading, refreshing, reload, refresh } = useLoad(api.organizations);
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader eyebrow="Membership" title="My organizations" back={() => router.back()} />
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
        <Body tabs={false} refreshing={refreshing} onRefresh={refresh}>
          {data?.organizations.length === 0 ? <Empty icon="people-outline" title="No organizations yet" text="Join one below, or ask an officer to add you." /> : data?.organizations.map((o) => {
            const on = active?.id === o.id;
            const officer = o.positions.some((p) => p.role !== "MEMBER");
            return (
              <Card key={o.id} style={[{ gap: space.md }, on && { borderColor: colors.primary, borderWidth: 2 }]}>
                <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
                  <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: officer ? colors.navy900 : colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
                    <Txt style={{ fontFamily: fonts.extrabold, fontSize: 16 }} color={officer ? colors.accent : colors.primaryInk}>{(o.acronym ?? o.name).slice(0, 3).toUpperCase()}</Txt>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt variant="h3" numberOfLines={2}>{o.name}</Txt>
                    <Txt variant="small">{[SCOPE[o.scope] ?? null, `${o.memberCount} members`].filter(Boolean).join(" · ")}</Txt>
                  </View>
                </View>
                {o.description ? <Txt variant="body" color={colors.textSecondary} numberOfLines={4}>{o.description}</Txt> : null}
                <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                  {o.positions.map((p, i) => <Badge key={i} label={roleLabel(p.role, p.title)} tone={p.role === "MEMBER" ? "neutral" : "violet"} icon={p.role === "MEMBER" ? "person" : "ribbon"} />)}
                  {on ? <Badge label="Active on Home" tone="primary" icon="checkmark" /> : null}
                </View>
                {!on ? <Button label="Show on Home" variant="ghost" size="sm" onPress={() => { setActiveOrgId(o.id); router.navigate("/"); }} /> : null}
              </Card>
            );
          })}
          <JoinSection onJoined={() => void refresh()} />
        </Body>
      )}
    </View>
  );
}

const STATUS = {
  PENDING: { label: "Pending", tone: "warning" },
  APPROVED: { label: "Accepted", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
} as const;

/** Join an interest-based organization right away (no approval), and see any earlier join requests (history). */
function JoinSection({ onJoined }: { onJoined: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { refreshMe } = useAuth();
  const { data, reload } = useLoad(api.joinOptions);
  const [busy, setBusy] = useState<string | null>(null);
  if (!data) return null;

  const join = async (o: JoinableOrg) => {
    if (!(await confirm({ title: `Join ${o.name}?`, message: "You become a member right away.", confirmLabel: "Join", icon: "person-add-outline" }))) return;
    setBusy(o.id);
    try {
      const r = await api.joinOrganization(o.id);
      toast.show(`You joined ${r.organization ?? o.name}`);
      void reload(); void refreshMe(); onJoined(); // the new membership shows on Home and in the list above
    } catch (e) { toast.show(e instanceof ApiError ? e.message : "Something went wrong.", "error"); }
    finally { setBusy(null); }
  };
  const withdraw = async (id: string, name: string) => {
    if (!(await confirm({ title: "Withdraw this request?", message: `Your old request to join ${name} will be withdrawn. You can still join directly.`, confirmLabel: "Withdraw", tone: "danger" }))) return;
    try { await api.cancelJoinRequest(id); toast.show("Request withdrawn"); void reload(); }
    catch (e) { toast.show(e instanceof ApiError ? e.message : "Something went wrong.", "error"); }
  };
  return (
    <>
      <SectionTitle caption="Open to every student. You become a member right away.">Join an organization</SectionTitle>
      {data.organizations.length === 0 ? <Empty icon="people-outline" title="Nothing to join right now" text="You are already in every open organization, or none are open yet." /> : data.organizations.map((o) => (
        <Card key={o.id} style={{ gap: space.sm }}>
          <Txt variant="h3">{o.name}{o.acronym ? ` (${o.acronym})` : ""}</Txt>
          <Txt variant="small">{o.members} member{o.members === 1 ? "" : "s"}</Txt>
          {o.description ? <Txt variant="body" color={colors.textSecondary} numberOfLines={3}>{o.description}</Txt> : null}
          <Button label="Join" size="sm" icon="person-add" loading={busy === o.id} disabled={!!busy} onPress={() => void join(o)} />
        </Card>
      ))}
      {data.requests.length > 0 ? (
        <>
          <SectionTitle caption="From before joining became immediate">Earlier join requests</SectionTitle>
          <ListGroup>
            {data.requests.map((r) => {
              const st = STATUS[r.status];
              return (
                <ListItem key={r.id} title={r.organization}
                  subtitle={[`Sent ${fmtDate(r.createdAt)}`, r.note ? `“${r.note}”` : null].filter(Boolean).join(" · ")}
                  right={<Badge label={st.label} tone={st.tone} />}
                  onPress={r.status === "PENDING" ? () => void withdraw(r.id, r.organization) : undefined}
                  accessibilityLabel={r.status === "PENDING" ? `${r.organization}, pending. Tap to withdraw` : `${r.organization}, ${st.label}`} />
              );
            })}
          </ListGroup>
        </>
      ) : null}
    </>
  );
}
