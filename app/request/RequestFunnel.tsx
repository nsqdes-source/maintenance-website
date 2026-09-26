"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/app/components/LocaleContext";
import LocationPicker from "./LocationPicker";
import { getAttribution, trackFunnelEvent } from "@/lib/attribution";

type Option = {
  value: string;
  ar: string;
  en: string;
  arHint?: string;
  enHint?: string;
};

type Coordinates = {
  latitude: number;
  longitude: number;
};

type Profile = {
  full_name: string | null;
  phone: string | null;
};

type CatalogCategory = {
  id: string;
  name: string;
  service_key: string;
  sort_order: number;
};

type CatalogService = {
  id: string;
  service_catalog_item_id: string;
  name: string;
  description: string;
  gross_price: number;
  is_visit_service: boolean;
  sort_order: number;
};

type Props = {
  initialCategories: CatalogCategory[];
  initialServices: CatalogService[];
};

const phonePattern = /^0\d{9}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const launchCity = "مكة المكرمة";

const periods: Option[] = [
  {
    value: "morning",
    ar: "صباحًا",
    en: "Morning",
    arHint: "8 ص – 12 م",
    enHint: "8 AM – 12 PM",
  },
  {
    value: "afternoon",
    ar: "ظهرًا",
    en: "Afternoon",
    arHint: "12 م – 4 م",
    enHint: "12 PM – 4 PM",
  },
  {
    value: "evening",
    ar: "مساءً",
    en: "Evening",
    arHint: "4 م – 9 م",
    enHint: "4 PM – 9 PM",
  },
];

function todayValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

export default function RequestFunnel({
  initialCategories,
  initialServices,
}: Props) {
  const locale = useLocale();
  const router = useRouter();

  const t = (ar: string, en: string) => (locale === "ar" ? ar : en);

  const label = (option?: Option) =>
    option ? (locale === "ar" ? option.ar : option.en) : "—";

  const [step, setStep] = useState(1);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);

  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [profile, setProfile] = useState<Profile>({
    full_name: null,
    phone: null,
  });

  const [categoryId, setCategoryId] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [address, setAddress] = useState("");
  const [location, setLocation] = useState<Coordinates | null>(null);

  const [date, setDate] = useState("");
  const [period, setPeriod] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [today] = useState(() => todayValue());

  const previews = useMemo(
    () =>
      photos.map((file) => ({
        file,
        url: URL.createObjectURL(file),
      })),
    [photos]
  );

  const activeServices = useMemo(
    () =>
      initialServices.filter(
        (service) => service.service_catalog_item_id === categoryId
      ),
    [initialServices, categoryId]
  );

  const selectedCategory = initialCategories.find(
    (category) => category.id === categoryId
  );

  const selectedServices = selectedServiceIds
    .map((id) => initialServices.find((service) => service.id === id))
    .filter((service): service is CatalogService => Boolean(service));

  const orderTotal = selectedServices.reduce((total, service) => {
    const quantity = quantities[service.id] ?? 1;
    return total + Number(service.gross_price || 0) * quantity;
  }, 0);

  useEffect(
    () => () => {
      previews.forEach((item) => URL.revokeObjectURL(item.url));
    },
    [previews]
  );

  useEffect(() => {
    trackFunnelEvent("start_request");
  }, []);

  useEffect(() => {
    if (location) {
      trackFunnelEvent("select_location");
    }
  }, [location]);

  useEffect(() => {
    if (period) {
      trackFunnelEvent("select_preferred_time", { period });
    }
  }, [period]);

  useEffect(() => {
    if (photos.length) {
      trackFunnelEvent("upload_photo", {
        photo_count: photos.length,
      });
    }
  }, [photos.length]);

  useEffect(() => {
    let active = true;

    (async () => {
      const supabase = createClient();

      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (!active) return;

      if (error) {
        if (error.name !== "AuthSessionMissingError") {
          console.error("Auth user lookup error:", error);
        }

        setLoadingUser(false);
        return;
      }

      setUserId(user?.id ?? null);
      setUserEmail(user?.email ?? "");

      if (user) {
        const { data, error: profileError } = await supabase
          .from("profiles")
          .select("full_name, phone")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) {
          console.error("Customer profile lookup error:", profileError);
        }

        if (active && data) {
          setProfile(data);
        }
      }

      setLoadingUser(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  function photoError(files: File[]) {
    if (files.length > 5) {
      return t(
        "يمكن إرفاق خمس صور كحد أقصى.",
        "You can attach up to five images."
      );
    }

    if (
      files.some(
        (file) =>
          !["image/jpeg", "image/png", "image/webp"].includes(file.type)
      )
    ) {
      return t(
        "الصيغ المدعومة هي JPEG وPNG وWebP.",
        "Supported formats are JPEG, PNG and WebP."
      );
    }

    if (files.some((file) => file.size > 5 * 1024 * 1024)) {
      return t(
        "يجب ألا يتجاوز حجم الصورة 5 ميجابايت.",
        "Each image must be 5 MB or smaller."
      );
    }

    return "";
  }

  function chooseCategory(id: string) {
    setCategoryId(id);
    setSelectedServiceIds([]);
    setQuantities({});
    setMessage("");

    const category = initialCategories.find((item) => item.id === id);

    if (category) {
      trackFunnelEvent("select_service", {
        service: category.name,
      });
    }
  }

  function toggleService(id: string) {
    setSelectedServiceIds((current) => {
      if (current.includes(id)) {
        return current.filter((serviceId) => serviceId !== id);
      }

      return [...current, id];
    });

    setQuantities((current) => ({
      ...current,
      [id]: current[id] ?? 1,
    }));

    setMessage("");
  }

  function changeQuantity(id: string, value: number) {
    const safeQuantity = Math.min(100, Math.max(1, value || 1));

    setQuantities((current) => ({
      ...current,
      [id]: safeQuantity,
    }));
  }

  function nextStep() {
    if (
      step === 1 &&
      (!categoryId || selectedServiceIds.length === 0)
    ) {
      return setMessage(
        t(
          "اختر تصنيف الخدمة وخدمة واحدة على الأقل قبل المتابعة.",
          "Choose a service category and at least one service before continuing."
        )
      );
    }

    if (step === 2 && !description.trim()) {
      return setMessage(
        t(
          "اكتب وصف المشكلة قبل المتابعة.",
          "Describe the issue before continuing."
        )
      );
    }

    if (step === 3 && (!address.trim() || !location)) {
      return setMessage(
        t(
          "أدخل العنوان وحدد الموقع قبل المتابعة.",
          "Enter the address and select the location before continuing."
        )
      );
    }

    if (step === 4 && (!date || date < today || !period)) {
      return setMessage(
        t(
          "اختر تاريخًا متاحًا وفترة زمنية.",
          "Choose an available date and time period."
        )
      );
    }

    setMessage("");
    setStep((current) => Math.min(current + 1, 5));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const customerName = userId
      ? (profile.full_name ?? "").trim()
      : name.trim();

    const customerPhone = userId
      ? (profile.phone ?? "").trim()
      : phone.trim();

    const customerEmail = (userId ? userEmail : email)
      .trim()
      .toLowerCase();

    if (!customerName || !phonePattern.test(customerPhone)) {
      return setMessage(
        t(
          "تحقق من الاسم ورقم الجوال.",
          "Check the name and phone number."
        )
      );
    }

    if (customerEmail && !emailPattern.test(customerEmail)) {
      return setMessage(
        t(
          "تحقق من البريد الإلكتروني أو اتركه فارغًا.",
          "Check the email or leave it empty."
        )
      );
    }

    if (
      !location ||
      !categoryId ||
      selectedServiceIds.length === 0 ||
      !description.trim() ||
      !address.trim() ||
      !date ||
      date < today ||
      !period
    ) {
      return setMessage(
        t(
          "راجع الحقول المطلوبة في الخطوات السابقة.",
          "Review the required fields in previous steps."
        )
      );
    }

    const invalidPhotos = photoError(photos);

    if (invalidPhotos) {
      return setMessage(invalidPhotos);
    }

    setPending(true);
    setMessage("");

    const supabase = createClient();
    const attribution = getAttribution();

    const catalogServices = selectedServices.map((service) => ({
      id: service.id,
      quantity: quantities[service.id] ?? 1,
    }));

    const issueType = selectedServices
      .map((service) => service.name)
      .join("، ");

    const { data, error } = await supabase
      .rpc("submit_service_request_v4", {
        input_name: customerName,
        input_phone: customerPhone,
        input_email: customerEmail,

        input_catalog_item_id: categoryId,
        input_catalog_services: catalogServices,

        input_issue_type: issueType,
        input_problem: description.trim(),

        input_city: launchCity,
        input_address: address.trim(),
        input_latitude: location.latitude,
        input_longitude: location.longitude,

        input_preferred_date: date,
        input_preferred_time_period: period,

        input_landing_page: attribution.landingPage,
        input_referrer: attribution.referrer,

        input_utm_source: attribution.utmSource,
        input_utm_medium: attribution.utmMedium,
        input_utm_campaign: attribution.utmCampaign,
        input_utm_content: attribution.utmContent,
        input_utm_term: attribution.utmTerm,

        input_gclid: attribution.gclid,
        input_wbraid: attribution.wbraid,
        input_gbraid: attribution.gbraid,

        input_first_touch_at: attribution.firstTouchAt || null,
      })
      .single();

    if (error || !data) {
      console.error("Service request error:", error);

      setMessage(
        t(
          "تعذر إرسال الطلب حاليًا. حاول مرة أخرى.",
          "We could not submit the request. Try again."
        )
      );

      setPending(false);
      return;
    }

    const request = data as {
      request_id: string;
      request_upload_token: string;
    };

    let uploaded = 0;

    for (const file of photos) {
      const extension =
        file.type === "image/png"
          ? "png"
          : file.type === "image/webp"
            ? "webp"
            : "jpg";

      const path =
        `${request.request_id}/` +
        `${request.request_upload_token}/` +
        `${crypto.randomUUID()}.${extension}`;

      const upload = await supabase.storage
        .from("request-images")
        .upload(path, file, {
          contentType: file.type,
        });

      if (upload.error) {
        break;
      }

      const attachment = await supabase.rpc(
        "attach_service_request_image",
        {
          target_request_id: request.request_id,
          target_upload_token: request.request_upload_token,
          target_storage_path: path,
          target_content_type: file.type,
        }
      );

      if (attachment.error) {
        break;
      }

      uploaded++;
    }

    const query = new URLSearchParams({
      id: request.request_id,
    });

    if (uploaded < photos.length) {
      query.set("upload", "partial");
    }

    trackFunnelEvent("generate_lead", {
      service: selectedCategory?.name ?? "",
      catalog_services: selectedServiceIds.join(","),
      photo_count: uploaded,
    });

    router.push(`/request/success?${query.toString()}`);
  }

  const selectedPeriod = periods.find(
    (item) => item.value === period
  );

  const steps = [
    t("الخدمة", "Service"),
    t("التفاصيل", "Details"),
    t("الموقع", "Location"),
    t("الموعد", "Schedule"),
    t("الإرسال", "Submit"),
  ];

  return (
    <form
      onSubmit={submit}
      className="request-form requestWizard"
    >
      <div className="requestWizardHeader">
        <p className="eyebrow">
          {t("طلب خدمة جديدة", "New service request")}
        </p>

        <h1>
          {t(
            "نرتب طلبك خطوة بخطوة",
            "We will guide you step by step"
          )}
        </h1>
      </div>

      <ol
        className="requestSteps"
        aria-label={t("مراحل الطلب", "Request steps")}
      >
        {steps.map((item, index) => (
          <li
            key={item}
            className={
              step === index + 1
                ? "active"
                : step > index + 1
                  ? "complete"
                  : ""
            }
          >
            <span>
              {step > index + 1 ? "✓" : index + 1}
            </span>

            <small>{item}</small>
          </li>
        ))}
      </ol>

      <section
        className="wizardPanel"
        hidden={step !== 1}
      >
        <h2>
          {t(
            "ما الخدمة التي تحتاجها؟",
            "Which service do you need?"
          )}
        </h2>

        <p>
          {t(
            "اختر تصنيف الخدمة أولًا، ثم اختر خدمة واحدة أو أكثر. الأسعار المعروضة شاملة الضريبة.",
            "Choose a category first, then select one or more services. Displayed prices include VAT."
          )}
        </p>

        <div className="serviceChoiceGrid">
          {initialCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={
                categoryId === category.id
                  ? "serviceChoice selected"
                  : "serviceChoice"
              }
              aria-pressed={categoryId === category.id}
              onClick={() => chooseCategory(category.id)}
            >
              <strong>{category.name}</strong>
            </button>
          ))}
        </div>

        {categoryId ? (
          <>
            <div className="form-group issueTypeGroup">
              <label>
                {t(
                  "الخدمات المتاحة *",
                  "Available services *"
                )}
              </label>
            </div>

            {activeServices.length > 0 ? (
              <div className="serviceChoiceGrid">
                {activeServices.map((service) => {
                  const selected =
                    selectedServiceIds.includes(service.id);

                  return (
                    <button
                      key={service.id}
                      type="button"
                      className={
                        selected
                          ? "serviceChoice selected"
                          : "serviceChoice"
                      }
                      aria-pressed={selected}
                      onClick={() =>
                        toggleService(service.id)
                      }
                    >
                      <strong>{service.name}</strong>

                      {service.description ? (
                        <small>
                          {service.description}
                        </small>
                      ) : null}

                      <span>
                        {Number(
                          service.gross_price
                        ).toFixed(2)}{" "}
                        ر.س
                      </span>

                      {service.is_visit_service ? (
                        <small>
                          {t(
                            "خدمة زيارة",
                            "Visit service"
                          )}
                        </small>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="appointmentNotice">
                {t(
                  "لا توجد خدمات مفعلة ضمن هذا التصنيف حاليًا.",
                  "There are currently no active services in this category."
                )}
              </div>
            )}

            {selectedServices.length > 0 ? (
              <div className="reviewSummary">
                {selectedServices.map((service) => (
                  <div key={service.id}>
                    <span>{service.name}</span>

                    <strong>
                      {Number(
                        service.gross_price
                      ).toFixed(2)}{" "}
                      ر.س
                    </strong>

                    <label>
                      {t("الكمية", "Quantity")}

                      <input
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        value={
                          quantities[service.id] ?? 1
                        }
                        onChange={(event) =>
                          changeQuantity(
                            service.id,
                            Number(event.target.value)
                          )
                        }
                      />
                    </label>
                  </div>
                ))}

                <div>
                  <span>
                    {t(
                      "الإجمالي شامل الضريبة",
                      "Total including VAT"
                    )}
                  </span>

                  <strong>
                    {orderTotal.toFixed(2)} ر.س
                  </strong>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      <section
        className="wizardPanel"
        hidden={step !== 2}
      >
        <h2>
          {t(
            "صف المشكلة وأضف صورًا",
            "Describe the issue and add photos"
          )}
        </h2>

        <p>
          {t(
            "التفاصيل والصور تساعدنا على فهم الحالة قبل التواصل معك.",
            "Details and photos help us understand the situation."
          )}
        </p>

        <div className="form-group">
          <label htmlFor="problem_description">
            {t(
              "وصف المشكلة *",
              "Issue description *"
            )}
          </label>

          <textarea
            id="problem_description"
            value={description}
            onChange={(event) =>
              setDescription(event.target.value)
            }
            rows={5}
            placeholder={t(
              "متى بدأت المشكلة؟ وما الذي لاحظته؟",
              "When did it start, and what did you notice?"
            )}
          />
        </div>

        <div className="form-group photoUploadField">
          <label htmlFor="photos">
            {t(
              "صور المشكلة (اختياري، حتى 5)",
              "Issue photos (optional, up to 5)"
            )}
          </label>

          <input
            id="photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(event) => {
              const files = Array.from(
                event.target.files ?? []
              );

              const error = photoError(files);

              if (error) {
                setMessage(error);
              } else {
                setPhotos(files);
                setMessage("");
              }
            }}
          />

          <small>
            {t(
              "JPEG أو PNG أو WebP، بحد أقصى 5 ميجابايت للصورة.",
              "JPEG, PNG or WebP, up to 5 MB each."
            )}
          </small>
        </div>

        {previews.length ? (
          <div className="photoPreviewGrid">
            {previews.map((item, index) => (
              <figure
                key={`${item.file.name}-${item.file.lastModified}`}
              >
                <img
                  src={item.url}
                  alt={t(
                    `معاينة الصورة ${index + 1}`,
                    `Photo ${index + 1} preview`
                  )}
                />

                <button
                  type="button"
                  onClick={() =>
                    setPhotos((current) =>
                      current.filter(
                        (_, currentIndex) =>
                          currentIndex !== index
                      )
                    )
                  }
                  aria-label={t(
                    "حذف الصورة",
                    "Remove photo"
                  )}
                >
                  ×
                </button>

                <figcaption>
                  {item.file.name}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : null}
      </section>

      <section
        className="wizardPanel"
        hidden={step !== 3}
      >
        <h2>
          {t(
            "أين تحتاج الخدمة؟",
            "Where do you need the service?"
          )}
        </h2>

        <p>
          {t(
            "نخدم حاليًا داخل مكة المكرمة. أدخل العنوان وحدد الموقع الدقيق.",
            "We currently serve Makkah. Enter the address and exact location."
          )}
        </p>

        <div className="launchCityNotice">
          <span>⌖</span>

          <div>
            <strong>
              {t("مدينة الخدمة", "Service city")}
            </strong>

            <small>
              {t("مكة المكرمة", "Makkah")}
            </small>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="address">
            {t("العنوان *", "Address *")}
          </label>

          <textarea
            id="address"
            value={address}
            onChange={(event) =>
              setAddress(event.target.value)
            }
            rows={3}
            placeholder={t(
              "الحي، الشارع، رقم المبنى، وأقرب معلم",
              "District, street, building number and landmark"
            )}
          />
        </div>

        <div className="form-group">
          <label>
            {t(
              "موقع الخدمة *",
              "Service location *"
            )}
          </label>

          <LocationPicker
            value={location}
            onChange={setLocation}
          />
        </div>
      </section>

      <section
        className="wizardPanel"
        hidden={step !== 4}
      >
        <h2>
          {t(
            "اختر الموعد المفضل",
            "Choose your preferred schedule"
          )}
        </h2>

        <p>
          {t(
            "هذا موعد مبدئي، وسيتواصل معك فريق معين لتأكيد توفره.",
            "This is preliminary. Mueen will contact you to confirm availability."
          )}
        </p>

        <div className="form-group">
          <label htmlFor="preferred_date">
            {t(
              "التاريخ المفضل *",
              "Preferred date *"
            )}
          </label>

          <input
            id="preferred_date"
            type="date"
            min={today}
            value={date}
            onChange={(event) =>
              setDate(event.target.value)
            }
          />
        </div>

        <fieldset className="timePeriodField">
          <legend>
            {t(
              "الفترة المفضلة *",
              "Preferred time period *"
            )}
          </legend>

          <div className="timePeriodGrid">
            {periods.map((item) => (
              <label
                key={item.value}
                className={
                  period === item.value
                    ? "selected"
                    : ""
                }
              >
                <input
                  type="radio"
                  name="preferred_time_period"
                  value={item.value}
                  checked={period === item.value}
                  onChange={(event) =>
                    setPeriod(event.target.value)
                  }
                />

                <span>
                  <strong>{label(item)}</strong>

                  <small>
                    {locale === "ar"
                      ? item.arHint
                      : item.enHint}
                  </small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="appointmentNotice">
          {t(
            "الموعد لا يصبح مؤكدًا إلا بعد مراجعة الطلب وتواصل فريق معين معك.",
            "The appointment is confirmed only after Mueen reviews your request and contacts you."
          )}
        </div>
      </section>

      <section
        className="wizardPanel"
        hidden={step !== 5}
      >
        <h2>
          {t(
            "بيانات التواصل ومراجعة الطلب",
            "Contact details and review"
          )}
        </h2>

        <p>
          {t(
            "رقم الجوال مطلوب والبريد الإلكتروني اختياري.",
            "Phone is required and email is optional."
          )}
        </p>

        {!userId && !loadingUser ? (
          <div className="contactFields">
            <div className="form-group">
              <label htmlFor="customer_name">
                {t("الاسم *", "Name *")}
              </label>

              <input
                id="customer_name"
                value={name}
                onChange={(event) =>
                  setName(event.target.value)
                }
                autoComplete="name"
              />
            </div>

            <div className="form-group">
              <label htmlFor="phone">
                {t(
                  "رقم الجوال *",
                  "Phone number *"
                )}
              </label>

              <input
                id="phone"
                value={phone}
                onChange={(event) =>
                  setPhone(event.target.value)
                }
                type="tel"
                placeholder="05xxxxxxxx"
                autoComplete="tel"
                dir="ltr"
                inputMode="numeric"
                maxLength={10}
              />
            </div>

            <div className="form-group contactEmail">
              <label htmlFor="customer_email">
                {t(
                  "البريد الإلكتروني (اختياري)",
                  "Email (optional)"
                )}
              </label>

              <input
                id="customer_email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                type="email"
                placeholder="name@example.com"
                autoComplete="email"
              />
            </div>
          </div>
        ) : (
          <div className="accountSummary">
            <strong>
              {profile.full_name || userEmail}
            </strong>

            <span>{profile.phone || "—"}</span>
            <span>{userEmail}</span>
          </div>
        )}

        <div className="reviewSummary">
          <div>
            <span>
              {t(
                "تصنيف الخدمة",
                "Service category"
              )}
            </span>

            <strong>
              {selectedCategory?.name || "—"}
            </strong>
          </div>

          {selectedServices.map((service) => (
            <div key={service.id}>
              <span>
                {service.name} ×{" "}
                {quantities[service.id] ?? 1}
              </span>

              <strong>
                {(
                  Number(service.gross_price) *
                  (quantities[service.id] ?? 1)
                ).toFixed(2)}{" "}
                ر.س
              </strong>
            </div>
          ))}

          <div>
            <span>
              {t(
                "الإجمالي شامل الضريبة",
                "Total including VAT"
              )}
            </span>

            <strong>
              {orderTotal.toFixed(2)} ر.س
            </strong>
          </div>

          <div>
            <span>{t("المدينة", "City")}</span>

            <strong>
              {t("مكة المكرمة", "Makkah")}
            </strong>
          </div>

          <div>
            <span>
              {t(
                "الموعد المفضل",
                "Preferred schedule"
              )}
            </span>

            <strong>
              {date && selectedPeriod
                ? `${date} · ${label(selectedPeriod)}`
                : "—"}
            </strong>
          </div>

          <div>
            <span>{t("الصور", "Photos")}</span>
            <strong>{photos.length}</strong>
          </div>
        </div>
      </section>

      {message ? (
        <div
          className="form-error"
          role="alert"
        >
          {message}
        </div>
      ) : null}

      <div className="wizardActions">
        {step > 1 ? (
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setMessage("");
              setStep((current) => current - 1);
            }}
          >
            {t("السابق", "Back")}
          </button>
        ) : (
          <span />
        )}

        {step < 5 ? (
          <button
            key="next-step"
            type="button"
            className="button primary"
            onClick={(event) => {
              event.preventDefault();
              nextStep();
            }}
          >
            {t("التالي", "Next")}
          </button>
        ) : (
          <button
            key="submit-request"
            type="submit"
            className="button primary"
            disabled={pending || loadingUser}
          >
            {loadingUser
              ? t(
                  "جاري تحميل بيانات الحساب...",
                  "Loading account..."
                )
              : pending
                ? t(
                    "جاري إرسال الطلب...",
                    "Submitting..."
                  )
                : t(
                    "إرسال طلب الخدمة",
                    "Submit request"
                  )}
          </button>
        )}
      </div>
    </form>
  );
}