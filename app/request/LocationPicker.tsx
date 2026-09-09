"use client";

import { useEffect, useRef, useState } from "react";

type Coordinates = { latitude: number; longitude: number };
type LocationPickerProps = { value: Coordinates | null; onChange: (value: Coordinates | null) => void };

const defaultCenter = { lat: 21.5433, lng: 39.1728 };

export default function LocationPicker({ value, onChange }: LocationPickerProps) {
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) { setError("لم يتم إعداد مفتاح Google Maps في بيئة الموقع."); setLoading(false); return; }
    let cancelled = false;
    const initializeMap = () => {
      if (cancelled || !mapElement.current || !(window as any).google?.maps) return;
      const googleMaps = (window as any).google.maps;
      const center = value ? { lat: value.latitude, lng: value.longitude } : defaultCenter;
      mapRef.current = new googleMaps.Map(mapElement.current, { center, zoom: value ? 15 : 11, mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
      if (value) markerRef.current = new googleMaps.Marker({ position: center, map: mapRef.current });
      mapRef.current.addListener("click", (event: any) => {
        if (!event.latLng) return;
        const position = { lat: event.latLng.lat(), lng: event.latLng.lng() };
        if (markerRef.current) markerRef.current.setPosition(position);
        else markerRef.current = new googleMaps.Marker({ position, map: mapRef.current });
        onChange({ latitude: position.lat, longitude: position.lng });
        setError("");
      });
      setLoading(false);
    };
    if ((window as any).google?.maps) { initializeMap(); return () => { cancelled = true; }; }
    const existingScript = document.querySelector<HTMLScriptElement>("script[data-google-maps]");
    if (existingScript) {
      existingScript.addEventListener("load", initializeMap);
      return () => { cancelled = true; existingScript.removeEventListener("load", initializeMap); };
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true; script.defer = true; script.dataset.googleMaps = "true"; script.onload = initializeMap;
    script.onerror = () => { if (!cancelled) { setError("تعذر تحميل Google Maps."); setLoading(false); } };
    document.head.appendChild(script);
    return () => { cancelled = true; };
  }, []);

  function useCurrentLocation() {
    if (!navigator.geolocation) { setError("المتصفح لا يدعم تحديد الموقع."); return; }
    setError("");
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const position = { lat: coords.latitude, lng: coords.longitude };
      onChange({ latitude: coords.latitude, longitude: coords.longitude });
      if (mapRef.current) {
        mapRef.current.setCenter(position); mapRef.current.setZoom(16);
        if (markerRef.current) markerRef.current.setPosition(position);
        else markerRef.current = new (window as any).google.maps.Marker({ position, map: mapRef.current });
      }
    }, () => setError("تعذر تحديد موقعك الحالي. يمكنك اختيار الموقع يدويًا على الخريطة."), { enableHighAccuracy: true, timeout: 10000 });
  }

  return (
    <div className="location-picker">
      <input type="hidden" name="latitude" value={value?.latitude ?? ""} required />
      <input type="hidden" name="longitude" value={value?.longitude ?? ""} required />
      <div className="location-picker-actions">
        <button type="button" className="button secondary" onClick={useCurrentLocation} disabled={loading}>استخدام موقعي الحالي</button>
        <span className="form-hint">اضغط على الخريطة لتحديد موقع الخدمة.</span>
      </div>
      <div ref={mapElement} className="location-map" aria-label="خريطة تحديد موقع الخدمة" />
      {value && <p className="form-hint" dir="ltr">{value.latitude.toFixed(6)}, {value.longitude.toFixed(6)}</p>}
      {loading && <p className="form-hint">جاري تحميل الخريطة...</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
