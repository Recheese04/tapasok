import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../../src/api/client";
import { Body, Card, Empty, ErrorState, IconChip, Loading, ScreenHeader, Badge } from "../../src/components/ui";
import { fmtDate } from "../../src/format";
import { useOrg } from "../../src/org/OrgContext";
import { space, type } from "../../src/theme";
import { useLoad } from "../../src/useLoad";

const CATEGORY: Record<string, string> = { MINUTES: "Minutes", ATTENDANCE_SHEET: "Attendance sheet", RESOLUTION: "Resolution", EVENT_DOCUMENT: "Event document", OTHER: "Other" };
const size = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Organization records (the list only). Uploading and downloading files is a web feature for now. */
export default function Documents() {
  const router = useRouter();
  const { org } = useOrg();
  const orgId = org?.id ?? "";
  const { data, error, loading, refreshing, reload, refresh } = useLoad(() => api.orgDocuments(orgId), [orgId]);
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Documents" subtitle={org?.name} back={() => router.back()} />
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
        <Body tabs={false} refreshing={refreshing} onRefresh={refresh}>
          {data?.documents.length === 0 ? <Empty icon="document-text-outline" title="No documents yet" text="Minutes, resolutions and event records appear here." /> : data?.documents.map((d) => (
            <Card key={d.id} style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
              <IconChip name="document-text" tone="success" />
              <View style={{ flex: 1 }}>
                <Text style={type.h2} numberOfLines={2}>{d.title}</Text>
                <Text style={type.small} numberOfLines={1}>{d.fileName} · {size(d.sizeBytes)} · {fmtDate(d.at)}</Text>
              </View>
              <Badge label={CATEGORY[d.category] ?? d.category} tone="muted" />
            </Card>
          ))}
          <Text style={type.small}>To upload or download files, use the Tapasok website.</Text>
        </Body>
      )}
    </View>
  );
}
