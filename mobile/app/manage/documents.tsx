import { View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../../src/api/client";
import { Notice } from "../../src/components/kit";
import { Badge, Body, Empty, ErrorState, ListGroup, ListItem, Loading, ScreenHeader, type IconName, type Tone } from "../../src/components/ui";
import { fmtDate } from "../../src/format";
import { useOrg } from "../../src/org/OrgContext";
import { useLoad } from "../../src/useLoad";

const CATEGORY: Record<string, [string, IconName, Tone]> = {
  MINUTES: ["Minutes", "document-text", "primary"], ATTENDANCE_SHEET: ["Attendance sheet", "checkmark-done", "success"], RESOLUTION: ["Resolution", "ribbon", "violet"],
  EVENT_DOCUMENT: ["Event document", "calendar", "accent"], OTHER: ["Other", "document", "neutral"],
};
const size = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Organization records (the list only). Uploading and downloading files is a website feature for now. */
export default function Documents() {
  const router = useRouter();
  const { org } = useOrg();
  const orgId = org?.id ?? "";
  const { data, error, loading, refreshing, reload, refresh } = useLoad(() => api.orgDocuments(orgId), [orgId]);
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader eyebrow={org?.name} title="Documents" back={() => router.back()} />
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} onRetry={reload} /> : (
        <Body tabs={false} refreshing={refreshing} onRefresh={refresh}>
          {data?.documents.length === 0 ? <Empty icon="folder-open-outline" title="No documents yet" text="Minutes, resolutions and event records appear here." tone="success" /> : (
            <ListGroup>
              {data!.documents.map((d) => {
                const [label, icon, tone] = CATEGORY[d.category] ?? CATEGORY.OTHER;
                return <ListItem key={d.id} icon={icon} tone={tone} title={d.title} subtitle={`${d.fileName} · ${size(d.sizeBytes)}`} meta={fmtDate(d.at)} right={<Badge label={label} tone={tone} />} />;
              })}
            </ListGroup>
          )}
          <Notice icon="desktop-outline" tone="info" title="Upload and download on the website" text={data?.canManage ? "You can add or remove documents on the Tapasok website." : "Open a document on the Tapasok website."} />
        </Body>
      )}
    </View>
  );
}
