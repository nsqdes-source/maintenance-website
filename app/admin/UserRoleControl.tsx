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

const SERVICE_OPTIONS = ["الكهرباء", "التكييف", "السباكة", "النجارة", "خدمات أخرى"];

type UserRoleControlProps = {
  userId: string;
  initialRole: string;
  isCurrentUser: boolean;
  initialTechnicianServices?: string[];
};

export default function UserRoleControl({ userId, initialRole, isCurrentUser, initialTechnicianServices = [] }: UserRoleControlProps) {
  const router = useRouter();
  const [role, setRole] = useState(initialRole);
  const [serviceTypes, setServiceTypes] = useState<string[]>(initialTechnicianServices);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSave() {
    if (isCurrentUser || (role === initialRole && role !== "technician")) return;
    if (role === "technician" && serviceTypes.length === 0) {
      setError("اختر خدمة واحدة على الأقل للفني.");
      return;
    }

    setIsSaving(true);
    setMessage("");
    setError("");

    const supabase = createClient();
    const { error: updateError } = await supabase.rpc("admin_update_user_role", {
      target_user_id: userId,
      new_role: role,
      new_service_types: role === "technician" ? serviceTypes : null,
    });

    if (updateError) {
      setError(updateError.message.includes("technician_has_active_assignments")
        ? "لا يمكن تغيير دور الفني قبل إنهاء الطلبات المسندة إليه."
        : "تعذر تحديث دور المستخدم.");
      setIsSaving(false);
      return;
    }

    setMessage("تم تحديث الدور.");
    setIsSaving(false);
    router.refresh();
  }

  function handleRoleChange(value: string) {
    setRole(value);
    setMessage("");
    setError("");
  }

  return (
    <div className="roleControl">
      <select value={role} onChange={(event) => handleRoleChange(event.target.value)} disabled={isSaving || isCurrentUser} aria-label="دور المستخدم">
        {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {role === "technician" && !isCurrentUser ? (
        <div className="userRoleServices">
          {SERVICE_OPTIONS.map((service) => (
            <label key={service}>
              <input type="checkbox" checked={serviceTypes.includes(service)} onChange={() => setServiceTypes((current) => current.includes(service) ? current.filter((item) => item !== service) : [...current, service])} disabled={isSaving} />
              {service}
            </label>
          ))}
        </div>
      ) : null}
      <button className="button primary compactButton" type="button" onClick={handleSave} disabled={isSaving || isCurrentUser || (role === initialRole && role !== "technician")}>
        {isSaving ? "جارٍ الحفظ..." : "حفظ"}
      </button>
      {isCurrentUser ? <span className="inlineHint">حسابك الحالي</span> : null}
      {message ? <span className="inlineSuccess">{message}</span> : null}
      {error ? <span className="inlineError">{error}</span> : null}
    </div>
  );
}
