"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./LocationPicker.module.css";
import { useLocale } from "@/app/components/LocaleContext";

type Coordinates = { latitude: number; longitude: number };
type LatLng = { lat: number; lng: number };
type MapInstance = {
  addListener: (name: string, callback: (event: { latLng?: { lat: () => number; lng: () => number } }) => void) => void;
  setCenter: (position: LatLng) => void;
  setZoom: (zoom: number) => void;
};
type MarkerInstance = { setPosition: (position: LatLng) => void };
type MapsApi = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapInstance;
  Marker: new (options: { position: LatLng; map: MapInstance }) => MarkerInstance;
};
declare global { interface Window { google?: { maps: MapsApi } } }

const defaultCenter = { lat: 21.5433, lng: 39.1728 };
const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export default function LocationPicker({ value, onChange }: { value: Coordinates | null; onChange: (value: Coordinates | null) => void }) {
  const locale = useLocale();
  const t = (ar: string, en: string) => locale === "ar" ? ar : en;
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const markerRef = useRef<MarkerInstance | null>(null);
  const [error, setError] = useState(apiKey ? "" : t("خريطة Google غير مهيأة محليًا؛ استخدم موقعك الحالي بعد إضافة مفتاح الخريطة.", "Google Maps is unavailable locally; add a map key to use your current location."));
  const [loading, setLoading] = useState(Boolean(apiKey));

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    const initializeMap = () => {
      if (cancelled || !mapElement.current || !window.google?.maps) return;
      const maps = window.google.maps;
      const center = value ? { lat: value.latitude, lng: value.longitude } : defaultCenter;
      const map = new maps.Map(mapElement.current, { center, zoom: value ? 15 : 11, mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
      mapRef.current = map;
      if (value) markerRef.current = new maps.Marker({ position: center, map });
      map.addListener("click", event => {
        if (!event.latLng) return;
        const position = { lat: event.latLng.lat(), lng: event.latLng.lng() };
        if (markerRef.current) markerRef.current.setPosition(position);
        else markerRef.current = new maps.Marker({ position, map });
        onChange({ latitude: position.lat, longitude: position.lng });
        setError("");
      });
      setLoading(false);
    };
    if (window.google?.maps) { initializeMap(); return () => { cancelled = true; }; }
    const existingScript = document.querySelector<HTMLScriptElement>("script[data-google-maps]");
    if (existingScript) {
      existingScript.addEventListener("load", initializeMap);
      return () => { cancelled = true; existingScript.removeEventListener("load", initializeMap); };
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true; script.defer = true; script.dataset.googleMaps = "true";
    script.onload = initializeMap;
    script.onerror = () => { if (!cancelled) { setError(t("تعذر تحميل Google Maps.", "Could not load Google Maps.")); setLoading(false); } };
    document.head.appendChild(script);
    return () => { cancelled = true; };
  }, []);

  function useCurrentLocation() {
    if (!navigator.geolocation) { setError(t("المتصفح لا يدعم تحديد الموقع.", "This browser does not support location access.")); return; }
    setError("");
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const position = { lat: coords.latitude, lng: coords.longitude };
      onChange({ latitude: coords.latitude, longitude: coords.longitude });
      if (mapRef.current) {
        mapRef.current.setCenter(position); mapRef.current.setZoom(16);
        if (markerRef.current) markerRef.current.setPosition(position);
        else if (window.google?.maps) markerRef.current = new window.google.maps.Marker({ position, map: mapRef.current });
      }
    }, () => setError(t("تعذر تحديد موقعك الحالي. يمكنك اختيار الموقع يدويًا على الخريطة.", "Could not get your location. Choose it manually on the map.")), { enableHighAccuracy: true, timeout: 10000 });
  }

  return <div className={styles.locationPicker}>
    <input type="hidden" name="latitude" value={value?.latitude ?? ""} />
    <input type="hidden" name="longitude" value={value?.longitude ?? ""} />
    <div className={styles.actions}><button type="button" className="button secondary" onClick={useCurrentLocation}>{t("استخدام موقعي الحالي", "Use my location")}</button><span className={styles.hint}>{t("حدد موقع الخدمة على الخريطة أو استخدم موقعك الحالي.", "Choose the service location on the map or use your current location.")}</span></div>
    {apiKey && <div ref={mapElement} className={styles.map} aria-label={t("خريطة تحديد موقع الخدمة", "Service location map")} />}
    {value && <p className={styles.hint} dir="ltr">{value.latitude.toFixed(6)}, {value.longitude.toFixed(6)}</p>}
    {loading && <p className={styles.hint}>{t("جاري تحميل الخريطة...", "Loading map...")}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </div>;
}
