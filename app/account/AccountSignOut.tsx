"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AccountSignOut() {
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <button className="button secondary" type="button" onClick={handleSignOut} disabled={pending}>
      {pending ? "جاري تسجيل الخروج..." : "تسجيل الخروج"}
    </button>
  );
}
