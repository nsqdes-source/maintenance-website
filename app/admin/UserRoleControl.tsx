"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const ROLE_OPTIONS = [
  { value: "customer", label: "عميل" },
  { value: "technician", label: "فني" },
  { value: "maintenance_manager", label: "مدير صيانة" },
  { value: "admin_manager", label: "مدير إداري" },
  { value: "super_admin", label: "مدير عام" },
];

type UserRoleControlProps = {
  userId: string;
  initialRole: string;
};

export default function UserRoleControl({ userId, initialRole }: UserRoleControlProps) {
  const router = useRouter();
  const [role, setRole] = useState(initialRole);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSave() {
    if (role === initialRole) return;

    setIsSaving(true);
    setMessage("");
    setError("");

    const supabase = createClient();
    const { error: updateError } = await supabase.rpc("admin_update_user_role", {
      target_user_id: userId,
      new_role: role,
    });

    if (updateError) {
      setError("تعذر تحديث دور المستخدم.");
      setIsSaving(false);
      return;
    }

    setMessage("تم تحديث الدور.");
    setIsSaving(false);
    router.refresh();
  }

  return (
    <div className="roleControl">
      <select
        value={role}
        onChange={(event) => {
          setRole(event.target.value);
          setMessage("");
          setError("");
        }}
        disabled={isSaving}
        aria-label="دور المستخدم"
      >
        {ROLE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button className="button primary compactButton" type="button" onClick={handleSave} disabled={isSaving || role === initialRole}>
        {isSaving ? "جارٍ الحفظ..." : "حفظ"}
      </button>
      {message ? <span className="inlineSuccess">{message}</span> : null}
      {error ? <span className="inlineError">{error}</span> : null}
    </div>
  );
}
