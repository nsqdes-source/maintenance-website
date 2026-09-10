"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import "./RequestForm.module.css";

type FormStatus = {
  success: boolean;
  message: string;
};

type Coordinates = {
  latitude: number;
  longitude: number;
};

type GoogleMap = {
  setCenter: (position: Coordinates) => void;
  setZoom: (zoom: number) => void;
  addListener: (eventName: string, handler: (event: unknown) => void) => void;
};

type GoogleMarker = {
  setMap: (map: GoogleMap | null) => void;
};

declare global {
  interface Window {
    google?: {
      maps: {
        Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
        Marker: new (options: Record<string, unknown>) => GoogleMarker;
        event: {
          clearInstanceListeners: (instance: unknown) => void;
        };
      };
    };
  }
}

const DEFAULT_LOCATION: Coordinates = {
  latitude: 24.7136,
  longitude: 46.6753,
};

function loadGoogleMaps(): Promise<void> {
  if (window.google?.maps) return Promise.resolve();

  const existingScript = document.querySelector(
    'script[data-google-maps="true"]'
  ) as HTMLScriptElement | null;

  if (existingScript) {
    return new Promise((resolve, reject) => {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(), { once: true });
    });
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return Promise.reject(new Error("Google Maps API key is missing."));
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps failed to load."));
    document.head.appendChild(script);
  });
}

export default function RequestForm() {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markerRef = useRef<GoogleMarker | null>(null);
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState("");
  const [locationMessage, setLocationMessage] = useState("");
  const [status, setStatus] = useState<FormStatus>({
    success: false,
    message: "",
  });
  const [pending, setPending] = useState(false);

  function placeMarker(position: Coordinates) {
    if (!mapRef.current || !window.google?.maps) return;

    if (markerRef.current) {
      markerRef.current.setMap(null);
    }

    markerRef.current = new window.google.maps.Marker({
      map: mapRef.current,
      position,
    });

    mapRef.current.setCenter(position);
    mapRef.current.setZoom(16);
    setLocation(position);
    setLocationMessage("تم تحديد الموقع على الخريطة.");
  }

  useEffect(() => {
    let cancelled = false;

    async function initializeMap() {
      try {
        await loadGoogleMaps();
        if (cancelled || !mapElementRef.current || !window.google?.maps) return;

        const map = new window.google.maps.Map(mapElementRef.current, {
          center: DEFAULT_LOCATION,
          zoom: 5,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          gestureHandling: "greedy",
        });

        mapRef.current = map;
        map.addListener("click", (event: unknown) => {
          const mouseEvent = event as { latLng?: { lat: () => number; lng: () => number } };
          if (!mouseEvent.latLng) return;
          placeMarker({
            latitude: mouseEvent.latLng.lat(),
            longitude: mouseEvent.latLng.lng(),
          });
        });

        setMapLoading(false);
      } catch (error) {
        console.error("Google Maps error:", error);
        if (!cancelled) {
          setMapLoading(false);
          setMapError("تعذر تحميل الخريطة. تحقق من إعدادات Google Maps ثم أعد تحميل الصفحة.");
        }
      }
    }

    initializeMap();

    return () => {
      cancelled = true;
      if (markerRef.current) markerRef.current.setMap(null);
      mapRef.current = null;
    };
  }, []);

  function useCurrentLocation() {
    setLocationMessage("");

    if (!navigator.geolocation) {
      setLocationMessage("المتصفح لا يدعم تحديد الموقع تلقائيًا.");
      return;
    }

    setLocationMessage("جاري تحديد موقعك...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        placeMarker({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        setLocationMessage("لم نتمكن من تحديد موقعك. يمكنك اختيار الموقع بالضغط على الخريطة.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    setPending(true);
    setStatus({ success: false, message: "" });

    const formData = new FormData(form);

    const customerName = String(formData.get("customer_name") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const serviceType = String(formData.get("service_type") ?? "").trim();
    const problemDescription = String(
      formData.get("problem_description") ?? ""
    ).trim();
    const city = String(formData.get("city") ?? "").trim();
    const address = String(formData.get("address") ?? "").trim();

    if (
      !customerName ||
      !phone ||
      !serviceType ||
      !problemDescription ||
      !city ||
      !address
    ) {
      setStatus({
        success: false,
        message: "يرجى تعبئة جميع الحقول المطلوبة.",
      });
      setPending(false);
      return;
    }

    if (!location) {
      setStatus({
        success: false,
        message: "يرجى تحديد موقعك على الخريطة قبل إرسال الطلب.",
      });
      setPending(false);
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("service_requests").insert({
      customer_name: customerName,
      phone,
      service_type: serviceType,
      problem_description: problemDescription,
      city,
      address,
      latitude: location.latitude,
      longitude: location.longitude,
      customer_id: user?.id ?? null,
    });

    if (error) {
      console.error("Service request error:", error);
      setStatus({
        success: false,
        message: "تعذر إرسال الطلب حاليًا. يرجى المحاولة مرة أخرى.",
      });
      setPending(false);
      return;
    }

    setStatus({
      success: true,
      message: "تم استلام طلبك بنجاح. سنتواصل معك قريبًا.",
    });
    setPending(false);
    form.reset();
    setLocation(null);
    setLocationMessage("");
    if (markerRef.current) {
      markerRef.current.setMap(null);
      markerRef.current = null;
    }
    if (mapRef.current) {
      mapRef.current.setCenter(DEFAULT_LOCATION);
      mapRef.current.setZoom(5);
    }
  }

  if (status.success) {
    return (
      <div className="request-success">
        <h2>تم إرسال الطلب</h2>
        <p>{status.message}</p>
        <a href="/" className="button primary">
          العودة للرئيسية
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="request-form">
      <div className="form-group">
        <label htmlFor="customer_name">الاسم *</label>
        <input
          id="customer_name"
          name="customer_name"
          type="text"
          required
          placeholder="اكتب اسمك"
        />
      </div>

      <div className="form-group">
        <label htmlFor="phone">رقم الجوال *</label>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          placeholder="05xxxxxxxx"
          dir="ltr"
        />
      </div>

      <div className="form-group">
        <label htmlFor="service_type">نوع الخدمة *</label>
        <select
          id="service_type"
          name="service_type"
          required
          defaultValue=""
        >
          <option value="">اختر نوع الخدمة</option>
          <option value="الكهرباء">الكهرباء</option>
          <option value="التكييف">التكييف</option>
          <option value="السباكة">السباكة</option>
          <option value="النجارة">النجارة</option>
          <option value="خدمات أخرى">خدمات أخرى</option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="problem_description">وصف المشكلة *</label>
        <textarea
          id="problem_description"
          name="problem_description"
          required
          rows={5}
          placeholder="اشرح لنا المشكلة بالتفصيل"
        />
      </div>

      <div className="form-group">
        <label htmlFor="city">المدينة *</label>
        <input
          id="city"
          name="city"
          type="text"
          required
          placeholder="مثال: مكة المكرمة"
        />
      </div>

      <div className="form-group">
        <label htmlFor="address">العنوان *</label>
        <textarea
          id="address"
          name="address"
          required
          rows={3}
          placeholder="الحي، الشارع، رقم المبنى..."
        />
      </div>

      <div className="form-group location-group">
        <div className="location-header">
          <label>موقع الخدمة *</label>
          <button
            type="button"
            className="location-button"
            onClick={useCurrentLocation}
            disabled={mapLoading || Boolean(mapError)}
          >
            تحديد موقعي تلقائيًا
          </button>
        </div>
        <p className="location-hint">
          اضغط على الخريطة لتحديد موقع المنزل أو اضغط على زر تحديد موقعي تلقائيًا.
        </p>
        <div className="map-wrapper">
          <div ref={mapElementRef} className="request-map" aria-label="خريطة تحديد موقع الخدمة" />
          {mapLoading && <div className="map-overlay">جاري تحميل الخريطة...</div>}
          {mapError && <div className="map-overlay map-error">{mapError}</div>}
        </div>
        {locationMessage && <p className="location-status">{locationMessage}</p>}
        {location && (
          <p className="location-coordinates" dir="ltr">
            {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
          </p>
        )}
      </div>

      {status.message && (
        <div className="form-error" role="alert">
          {status.message}
        </div>
      )}

      <button type="submit" className="button primary" disabled={pending}>
        {pending ? "جاري إرسال الطلب..." : "إرسال طلب الخدمة"}
      </button>
    </form>
  );
}
