"use server";

import { createClient } from "@/lib/supabase/server";

export type RequestState = {
  success: boolean;
  message: string;
};

export async function submitServiceRequest(
  _previousState: RequestState,
  formData: FormData
): Promise<RequestState> {
  const customerName = String(formData.get("customer_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const serviceType = String(formData.get("service_type") ?? "").trim();
  const problemDescription = String(formData.get("problem_description") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();

  if (!customerName || !phone || !serviceType || !problemDescription || !city || !address) {
    return { success: false, message: "يرجى تعبئة جميع الحقول المطلوبة." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("service_requests").insert({
    customer_name: customerName,
    phone,
    service_type: serviceType,
    problem_description: problemDescription,
    city,
    address,
  });

  if (error) {
    console.error("Service request error:", error);
    return { success: false, message: "تعذر إرسال الطلب حاليًا. يرجى المحاولة مرة أخرى." };
  }

  return { success: true, message: "تم استلام طلبك بنجاح. سنتواصل معك قريبًا." };
}
