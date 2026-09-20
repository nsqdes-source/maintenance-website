import { createClient } from "@/lib/supabase/server";
import DriveSyncButton from "./DriveSyncButton";

export default async function RequestImages({ requestId, showDriveSync = false }: { requestId: string; showDriveSync?: boolean }) {
  const supabase = await createClient();
  const { data: attachments } = await supabase.from("service_request_attachments")
    .select("id,storage_path").eq("service_request_id", requestId).order("created_at");
  if (!attachments?.length) return null;
  const { data: synced } = showDriveSync ? await supabase.from("drive_syncs").select("source_id").eq("source_type", "request_image").in("source_id", attachments.map(item => item.id)) : { data: [] };
  const syncedIds = new Set((synced ?? []).map(item => item.source_id));
  const images = await Promise.all(attachments.map(async item => {
    const { data } = await supabase.storage.from("request-images").createSignedUrl(item.storage_path, 600);
    return { id: item.id, url: data?.signedUrl };
  }));
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
    {images.filter(item => item.url).map((item, index) =>
      <a key={item.id} href={item.url!} target="_blank" rel="noreferrer" aria-label={`فتح صورة الطلب ${index + 1}`}>
        <img src={item.url!} alt={`صورة الطلب ${index + 1}`} width={100} height={100} style={{ objectFit: "cover", borderRadius: 8 }} />
      </a>)}
    {showDriveSync ? images.map(item => <DriveSyncButton key={`drive-${item.id}`} type="request_image" id={item.id} synced={syncedIds.has(item.id)} />) : null}
  </div>;
}
