import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../../src/api/client";
import { useAuth } from "../../src/auth/AuthContext";
import { Body, Chips, Empty, ErrorState, Loading, Row, ScreenHeader } from "../../src/components/ui";
import { fmtDate, fmtTime } from "../../src/format";
import { useLoad } from "../../src/useLoad";

export default function Events() {
  const router = useRouter();
  const { me } = useAuth();
  const [when, setWhen] = useState<"upcoming" | "past">("upcoming");
  const { data, error, loading, refreshing, reload, refresh } = useLoad(() => api.events(when), [when]);

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Events" subtitle="From your organizations" avatar={me ? { first: me.firstName, last: me.lastName } : undefined} onAvatar={() => router.navigate("/account")}>
        <Chips options={[{ value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }]} value={when} onChange={setWhen} />
      </ScreenHeader>
      {loading && !data ? (
        <Loading />
      ) : error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <Body refreshing={refreshing} onRefresh={refresh}>
          {data && data.events.length === 0 ? (
            <Empty icon="calendar-outline" title={when === "upcoming" ? "No upcoming events" : "No past events"} text="Pull down to refresh." />
          ) : (
            data?.events.map((e) => (
              <Row
                key={e.id}
                icon="calendar"
                tone="violet"
                title={e.title}
                sub={`${e.organization} · ${fmtDate(e.startsAt)}, ${fmtTime(e.startsAt)}${e.venue ? ` · ${e.venue}` : ""}`}
                onPress={() => router.push(`/event/${e.id}`)}
              />
            ))
          )}
        </Body>
      )}
    </View>
  );
}
