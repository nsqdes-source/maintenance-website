"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import LocationPicker from "./LocationPicker";
import { useLocale } from "@/app/components/LocaleContext";

type FormStatus = { success: boolean; message: string };
type CustomerProfile = { full_name: string | null; phone: string | null };
type Coordinates = { latitude: number; longitude: number };

const phonePattern = /^0\d{9}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cities = ["مكة المكرمة", "جدة", "الطائف"];

export default function RequestForm() {
  const locale = useLocale();
  const t = (ar: string, en: string) => locale === "ar" ? ar : en;
  const [status, setStatus] = useState<FormStatus>({ success: false, message: "" });
  const [pending, setPending] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [profile, setProfile] = useState<CustomerProfile>({ full_name: null, phone: null });
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [step, setStep] = useState(1);
  const [serviceType, setServiceType] = useState("");

  useEffect(() => {
    let active = true;
    async function loadUser() {
      const supabase = createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (!active) return;
      if (userError) { if (userError.name !== "AuthSessionMissingError") console.error("Auth user lookup error:", userError); setUserId(null); setUserEmail(""); setLoadingUser(false); return; }
      setUserId(user?.id ?? null); setUserEmail(user?.email ?? "");
      if (user) {
        const { data, error: profileError } = await supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle();
        if (profileError) console.error("Customer profile lookup error:", profileError);
        if (active && data) setProfile(data);
      }
      setLoadingUser(false);
    }
    loadUser();
    return () => { active = false; };
  }, []);

  function advanceStep() {
    if (step === 2) {
      const description = (document.getElementById("problem_description") as HTMLTextAreaElement | null)?.value.trim();
      if (!description) {
        setStatus({ success: false, message: t("اكتب وصف المشكلة قبل المتابعة.", "Describe the issue before continuing.") });
        return;
      }
    }
    if (step === 3) {
      const city = (document.getElementById("city") as HTMLSelectElement | null)?.value;
      const address = (document.getElementById("address") as HTMLTextAreaElement | null)?.value.trim();
      if (!city || !address || !location) {
        setStatus({ success: false, message: t("اختر المدينة، وأدخل العنوان، وحدد الموقع على الخريطة قبل المتابعة.", "Choose a city, enter the address, and select the location on the map before continuing.") });
        return;
      }
    }
    if (step === 4 && !userId) {
      const name = (document.getElementById("customer_name") as HTMLInputElement | null)?.value.trim();
      const phone = (document.getElementById("phone") as HTMLInputElement | null)?.value.trim();
      const email = (document.getElementById("customer_email") as HTMLInputElement | null)?.value.trim();
      if (!name || !phone || !email) {
        setStatus({ success: false, message: t("أدخل بيانات التواصل قبل المتابعة.", "Enter your contact details before continuing.") });
        return;
      }
      if (!phonePattern.test(phone) || !emailPattern.test(email)) {
        setStatus({ success: false, message: t("تحقق من رقم الجوال والبريد الإلكتروني قبل المتابعة.", "Check the phone number and email address before continuing.") });
        return;
      }
    }
    setStatus({ success: false, message: "" });
    setStep(value => value + 1);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true); setStatus({ success: false, message: "" });
    const formData = new FormData(form);
    const customerName = userId ? (profile.full_name ?? "").trim() : String(formData.get("customer_name") ?? "").trim();
    const phone = userId ? (profile.phone ?? "").trim() : String(formData.get("phone") ?? "").trim();
    const email = userId ? userEmail.trim().toLowerCase() : String(formData.get("customer_email") ?? "").trim().toLowerCase();
    const selectedServiceType = String(formData.get("service_type") ?? "").trim();
    const problemDescription = String(formData.get("problem_description") ?? "").trim();
    const city = String(formData.get("city") ?? "").trim();
    const address = String(formData.get("address") ?? "").trim();
    const latitude = Number(formData.get("latitude"));
    const longitude = Number(formData.get("longitude"));

    if (!customerName || !phone || !email || !selectedServiceType || !problemDescription || !city || !address || !location || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setStatus({ success: false, message: t("يرجى تعبئة جميع الحقول المطلوبة وتحديد موقع الخدمة على الخريطة.", "Complete all required fields and choose a location on the map.") }); setPending(false); return;
    }
    if (userId && (!profile.full_name?.trim() || !phonePattern.test(profile.phone ?? "") || !emailPattern.test(email))) {
      setStatus({ success: false, message: t("بيانات حسابك غير مكتملة أو غير صحيحة. حدّث بيانات الحساب أولًا ثم أعد إرسال الطلب.", "Your account details are incomplete. Update your profile before submitting.") }); setPending(false); return;
    }
    if (!phonePattern.test(phone)) { setStatus({ success: false, message: t("رقم الجوال يجب أن يتكون من 10 أرقام ويبدأ بـ 0.", "The phone number must have 10 digits and start with 0.") }); setPending(false); return; }
    if (!emailPattern.test(email)) { setStatus({ success: false, message: t("يرجى إدخال بريد إلكتروني صحيح.", "Enter a valid email address.") }); setPending(false); return; }
    if (!cities.includes(city)) { setStatus({ success: false, message: t("يرجى اختيار مدينة صحيحة من القائمة.", "Choose a city from the list.") }); setPending(false); return; }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) { setStatus({ success: false, message: t("إحداثيات الموقع غير صحيحة.", "The location coordinates are invalid.") }); setPending(false); return; }

    const supabase = createClient();
    const photos = formData.getAll("photos").filter((item): item is File => item instanceof File && item.size > 0);
    if (photos.length > 5 || photos.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      setStatus({ success: false, message: t("يمكن إرفاق خمس صور كحد أقصى بصيغة JPEG أو PNG أو WebP، بحجم 5 ميجابايت لكل صورة.", "You can attach up to five JPEG, PNG or WebP images, each up to 5 MB.") }); setPending(false); return;
    }
    const { data: submitted, error } = await supabase.rpc("submit_service_request_with_images", {
      input_name: customerName, input_phone: phone, input_email: email, input_service: selectedServiceType,
      input_problem: problemDescription, input_city: city, input_address: address,
      input_latitude: latitude, input_longitude: longitude,
    }).single();
    if (error || !submitted) { console.error("Service request error:", error); setStatus({ success: false, message: t("تعذر إرسال الطلب حاليًا. يرجى المحاولة مرة أخرى.", "We could not submit your request. Please try again.") }); setPending(false); return; }
    const submission = submitted as { request_id: string; request_upload_token: string };
    let uploaded = 0;
    for (const file of photos) {
      const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${submission.request_id}/${submission.request_upload_token}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("request-images").upload(path, file, { contentType: file.type });
      if (uploadError) break;
      const { error: attachError } = await supabase.rpc("attach_service_request_image", {
        target_request_id: submission.request_id, target_upload_token: submission.request_upload_token,
        target_storage_path: path, target_content_type: file.type,
      });
      if (attachError) break;
      uploaded++;
    }
    if (uploaded < photos.length) {
      setStatus({ success: true, message: t(`تم إنشاء الطلب وإرفاق ${uploaded} من ${photos.length} صور. يرجى التواصل معنا بشأن الصور المتبقية.`, `The request was created with ${uploaded} of ${photos.length} images. Please contact us about the remaining images.`) });
      setPending(false);
      return;
    }
    setStatus({ success: true, message: t("تم استلام طلبك بنجاح. سنتواصل معك قريبًا.", "Your request was received. We will contact you soon.") }); setPending(false);
    if (!userId) { form.reset(); setLocation(null); }
  }

  if (status.success) return <div className="request-success"><h2>{t("تم إرسال الطلب", "Request submitted")}</h2><p>{status.message}</p><Link href="/" className="button primary">{t("العودة للرئيسية", "Back to home")}</Link></div>;

  return (
    <form onSubmit={handleSubmit} className="request-form requestWizard">
      <div className="requestWizardHeader"><p className="eyebrow">{t("طلب خدمة جديدة", "New service request")}</p><h1>{t("نرتب طلبك خطوة بخطوة", "We will guide you step by step")}</h1></div>
      <ol className="requestSteps" aria-label={t("مراحل الطلب", "Request steps")}>{[t("الخدمة", "Service"), t("المشكلة", "Issue"), t("الموقع", "Location"), t("بياناتك", "Your details"), t("المراجعة", "Review")].map((label, index) => <li key={label} className={step === index + 1 ? "active" : step > index + 1 ? "complete" : ""}><span>{index + 1}</span><small>{label}</small></li>)}</ol>
      <input type="hidden" name="service_type" value={serviceType} />
      <section className="wizardPanel" hidden={step !== 1}><h2>{t("اختر نوع الخدمة", "Choose a service")}</h2><p>{t("اختر الخدمة الأقرب إلى طلبك", "Choose the service that best matches your request")}</p><div className="serviceChoiceGrid">{[
        ["الكهرباء", "⚡", "Electrical"], ["التكييف", "❄", "Air conditioning"], ["السباكة", "💧", "Plumbing"], ["النجارة", "🔨", "Carpentry"], ["خدمات أخرى", "✦", "Other services"]
      ].map(([value, icon, en]) => <button key={value} type="button" className={serviceType === value ? "serviceChoice selected" : "serviceChoice"} onClick={() => setServiceType(value)}><span>{icon}</span>{locale === "ar" ? value : en}</button>)}</div></section>
      <section className="wizardPanel" hidden={step !== 2}><h2>{t("اشرح المشكلة", "Describe the issue")}</h2><p>{t("كلما زادت التفاصيل والصور أصبح توجيه الفني أدق.", "More details and photos help us assign the right technician.")}</p>
        <div className="form-group"><label htmlFor="problem_description">{t("وصف المشكلة *", "Issue description *")}</label><textarea id="problem_description" name="problem_description" required rows={5} placeholder={t("اشرح لنا المشكلة بالتفصيل", "Describe the issue in detail")} /></div>
      <div className="form-group"><label htmlFor="photos">{t("صور المشكلة (حتى 5)", "Issue photos (up to 5)")}</label><input id="photos" name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple /></div></section>
      <section className="wizardPanel" hidden={step !== 3}><h2>{t("حدد موقع الخدمة", "Choose the service location")}</h2><p>{t("أدخل العنوان ثم اختر الموقع الدقيق على الخريطة.", "Enter the address and choose the exact point on the map.")}</p>
      <div className="form-group"><label htmlFor="city">{t("المدينة *", "City *")}</label><select id="city" name="city" required defaultValue=""><option value="">{t("اختر المدينة", "Choose a city")}</option>{cities.map((city) => <option key={city} value={city}>{locale === "en" ? ({ "مكة المكرمة": "Makkah", "جدة": "Jeddah", "الطائف": "Taif" } as Record<string,string>)[city] : city}</option>)}</select></div>
      <div className="form-group"><label htmlFor="address">{t("العنوان *", "Address *")}</label><textarea id="address" name="address" required rows={3} placeholder={t("الحي، الشارع، رقم المبنى...", "District, street, building number...")} /></div>
      <div className="form-group"><label>{t("موقع الخدمة *", "Service location *")}</label><LocationPicker value={location} onChange={setLocation} /></div></section>
      <section className="wizardPanel" hidden={step !== 4}><h2>{t("بيانات التواصل", "Contact details")}</h2><p>{userId ? t("سنستخدم بيانات حسابك للتواصل معك.", "We will use your account details to contact you.") : t("أدخل بيانات التواصل الخاصة بك.", "Enter your contact details.")}</p>{!userId && !loadingUser ? <><div className="form-group"><label htmlFor="customer_name">{t("الاسم *", "Name *")}</label><input id="customer_name" name="customer_name" type="text" required placeholder={t("اكتب اسمك", "Enter your name")} autoComplete="name" /></div><div className="form-group"><label htmlFor="phone">{t("رقم الجوال *", "Phone number *")}</label><input id="phone" name="phone" type="tel" required placeholder="05xxxxxxxx" autoComplete="tel" dir="ltr" inputMode="numeric" maxLength={10} pattern="0[0-9]{9}" /></div><div className="form-group"><label htmlFor="customer_email">{t("البريد الإلكتروني *", "Email *")}</label><input id="customer_email" name="customer_email" type="email" required placeholder="name@example.com" autoComplete="email" /></div></> : <div className="accountSummary"><strong>{profile.full_name || userEmail}</strong><span>{profile.phone || "—"}</span><span>{userEmail}</span></div>}</section>
      <section className="wizardPanel" hidden={step !== 5}><h2>{t("مراجعة وإرسال", "Review and submit")}</h2><p>{t("راجع بياناتك ثم أرسل الطلب. ستصل للإدارة ليتم إسناده للفني المناسب.", "Review your details, then submit. The request will be assigned to the right technician.")}</p><div className="reviewSummary"><span>{t("الخدمة", "Service")}: <strong>{serviceType || "—"}</strong></span><span>{t("الموقع", "Location")}: <strong>{location ? t("محدد على الخريطة", "Selected on map") : "—"}</strong></span></div></section>
      {status.message && <div className={status.success ? "form-success" : "form-error"} role="alert">{status.message}</div>}
      <div className="wizardActions">{step > 1 ? <button type="button" className="button secondary" onClick={() => setStep(value => value - 1)}>{t("السابق", "Back")}</button> : null}{step < 5 ? <button type="button" className="button primary" disabled={step === 1 && !serviceType} onClick={advanceStep}>{t("التالي", "Next")}</button> : <button type="submit" className="button primary" disabled={pending || loadingUser}>{loadingUser ? t("جاري تحميل بيانات الحساب...", "Loading account...") : pending ? t("جاري إرسال الطلب...", "Submitting...") : t("إرسال طلب الخدمة", "Submit request")}</button>}</div>
    </form>
  );
}
