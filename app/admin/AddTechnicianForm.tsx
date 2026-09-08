"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type UserOption = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string;
};

type AddTechnicianFormProps = {
  users: UserOption[];
};

const SERVICE_OPTIONS = ["الكهرباء", "التكييف", "السباكة", "النجارة", "خدمات أخرى"];

export default function AddTechnicianForm({ users }: AddTechnicianFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function toggleService(service: string) {
    setServiceTypes((current) => current.includes(service)
      ? current.filter((item) => item !== service)
      : [...current, service]
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!userId) {
      setError("اختر مستخدمًا لإضافته كفني.");
      return;
    }
    if (!serviceTypes.length) {
      setError("اختر خدمة واحدة على الأقل.");
      return;
    }

    setPending(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("admin_add_technician", {
      target_profile_id: userId,
      target_service_types: serviceTypes,
      target_notes: notes.trim() || null,
    });

    if (rpcError) {
      console.error("Add technician error:", rpcError);
      setError("تعذر إضافة الفني. تأكد أن المستخدم غير مضاف كفني بالفعل.");
      setPending(false);
      return;
    }

    setMessage("تمت إضافة الفني بنجاح.");
    setUserId("");
    setServiceTypes([]);
    setNotes("");
    setPending(false);
    router.refresh();
  }

  return (
    <section className="addTechnicianSection" id="add-technician">
      <button className="button primary" type="button" onClick={() => setOpen((value) => !value)}>
        {open ? "إغلاق نموذج الإضافة" : "إضافة فني جديد"}
      </button>

      {open ? (
        <form className="addTechnicianForm" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="technician-user">المستخدم *</label>
            <select
              id="technician-user"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              disabled={pending}
              required
            >
              <option value="">اختر مستخدمًا مسجلًا</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {(user.full_name || "مستخدم بدون اسم") + (user.phone ? ` — ${user.phone}` : "")}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="serviceChoiceGroup">
            <legend>الخدمات *</legend>
            <div className="serviceChoiceGrid">
              {SERVICE_OPTIONS.map((service) => (
                <label key={service} className="serviceChoice">
                  <input
                    type="checkbox"
                    checked={serviceTypes.includes(service)}
                    onChange={() => toggleService(service)}
                    disabled={pending}
                  />
                  <span>{service}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="form-group">
            <label htmlFor="technician-notes">ملاحظات</label>
            <textarea
              id="technician-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={pending}
              rows={3}
              placeholder="ملاحظات عن الفني، الخبرة، أو نطاق العمل..."
            />
          </div>

          {error ? <div className="form-error" role="alert">{error}</div> : null}
          {message ? <div className="inlineSuccess" role="status">{message}</div> : null}

          <button className="button primary" type="submit" disabled={pending || users.length === 0}>
            {pending ? "جارٍ إضافة الفني..." : "حفظ وإضافة الفني"}
          </button>

          {users.length === 0 ? <p className="form-hint">لا يوجد مستخدمون متاحون حاليًا للإضافة. أنشئ حساب المستخدم أولًا ثم أضفه كفني.</p> : null}
        </form>
      ) : null}
    </section>
  );
}
