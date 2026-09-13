"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AvatarImage() {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("avatar_path").eq("id", user.id).maybeSingle();
      if (!profile?.avatar_path) return;
      const { data } = await supabase.storage.from("avatars").createSignedUrl(profile.avatar_path, 3600);
      if (active && data?.signedUrl) setUrl(data.signedUrl);
    }
    void load();
    return () => { active = false; };
  }, []);
  return url ? <img src={url} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }} />
    : <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 22, height: 22, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" }}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.7-3.3 3.2-5 7-5s6.3 1.7 7 5" /></svg>;
}
