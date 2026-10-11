import { useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../../src/api/client";
import type { EventItem } from "../../src/api/types";
import { useAuth } from "../../src/auth/AuthContext";
import { Badge, Body, Button, Card, Chips, DateBlock, Empty, ErrorState, Loading, ScreenHeader, Txt } from "../../src/components/ui";
import { dayLabel, fmtTimeRange } from "../../src/format";
import { colors, space } from "../../src/theme";
import { useLoad } from "../../src/useLoad";

function EventCard({ e, onPress }: { e: EventItem; onPress: () => void }) {
  const past = new Date(e.endsAt) < new Date();
  const live = !past && new Date(e.startsAt) <= new Date();
  return (
    <Card onPress={onPress} accessibilityLabel={`${e.title}, ${dayLabel(e.startsAt)}, ${e.organization}`} style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
      <DateBlock iso={e.startsAt} tone={e.status === "CANCELLED" ? "neutral" : past ? "neutral" : live ? "accent" : "primary"} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {live ? <Badge label="Happening now" tone="accent" dot /> : e.status === "CANCELLED" ? <Badge label="Cancelled" tone="danger" /> : past ? <Badge label="Ended" tone="neutral" /> : null}
        </View>
        <Txt variant="h3" numberOfLines={2}>{e.title}</Txt>
        <Txt variant="small" numberOfLines={1}>{dayLabel(e.startsAt)} · {fmtTimeRange(e.startsAt, e.endsAt)}</Txt>
        <Txt variant="small" color={colors.textMuted} numberOfLines={1}>{[e.venue, e.organization].filter(Boolean).join(" · ")}</Txt>
      </View>
    </Card>
  );
}

export default function Events() {
  const router = useRouter();
  const { me } = useAuth();
  const [when, setWhen] = useState<"upcoming" | "past">("upcoming");
  const { data, error, loading, refreshing, reload, refresh } = useLoad(() => api.events(when, 1), [when]);
  const [extra, setExtra] = useState<EventItem[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  useEffect(() => { setExtra([]); setPage(1); }, [data]);

  const all = [...(data?.events ?? []), ...extra];
  const canMore = !!data && all.length < data.total;
  async function loadMore() {
    setMore(true);
    try {
      const next = await api.events(when, page + 1);
      setExtra((x) => [...x, ...next.events]);
      setPage((p) => p + 1);
    } finally { setMore(false); }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader eyebrow="From your organizations" title="Events" avatar={me ? { first: me.firstName, last: me.lastName } : undefined} onAvatar={() => router.navigate("/account")}>
        <Chips onDark options={[{ value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }]} value={when} onChange={setWhen} />
      </ScreenHeader>
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
        <Body refreshing={refreshing} onRefresh={refresh}>
          {all.length === 0 ? (
            <Empty icon="calendar-clear-outline" title={when === "upcoming" ? "Nothing scheduled yet" : "No past events"} text={when === "upcoming" ? "When your organizations publish an event, it appears here." : "Events you could attend will be listed here once they end."} />
          ) : (
            <>
              <Txt variant="caption">{data!.total} {when === "upcoming" ? "upcoming" : "past"} event{data!.total === 1 ? "" : "s"}</Txt>
              {all.map((e) => <EventCard key={e.id} e={e} onPress={() => router.push(`/event/${e.id}`)} />)}
              {canMore ? <Button label="Load more" variant="ghost" loading={more} onPress={() => void loadMore()} /> : null}
            </>
          )}
        </Body>
      )}
    </View>
  );
}
