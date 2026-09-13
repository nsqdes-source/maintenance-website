"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./LocationPicker.module.css";

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

function ManualCoordinates({ value, onChange }: { value: Coordinates | null; onChange: (value: Coordinates | null) => void }) {
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  if (value && (Number(latitude) !== value.latitude || Number(longitude) !== value.longitude)) {
    setLatitude(String(value.latitude));
    setLongitude(String(value.longitude));
  }

  function update(nextLatitude: string, nextLongitude: string) {
    setLatitude(nextLatitude);
    setLongitude(nextLongitude);
    if (!nextLatitude.trim() || !nextLongitude.trim()) {
      onChange(null);
      return;
    }
    const coordinates = { latitude: Number(nextLatitude), longitude: Number(nextLongitude) };
    onChange(Number.isFinite(coordinates.latitude) && Number.isFinite(coordinates.longitude) ? coordinates : null);
  }

  return <div className="detailFields">
    <label>خط العرض<input type="number" min="-90" max="90" step="any" value={latitude} onChange={event => update(event.target.value, longitude)} /></label>
    <label>خط الطول<input type="number" min="-180" max="180" step="any" value={longitude} onChange={event => update(latitude, event.target.value)} /></label>
  </div>;
}
export default function LocationPicker({ value, onChange }: { value: Coordinates | null; onChange: (value: Coordinates | null) => void }) {
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const markerRef = useRef<MarkerInstance | null>(null);
  const [error, setError] = useState(apiKey ? "" : "خريطة Google غير مهيأة محليًا؛ أدخل الإحداثيات يدويًا أو استخدم موقعك الحالي.");
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
        else if (window.google?.maps) markerRef.current = new window.google.maps.Marker({ position, map: mapRef.current });
      }
    }, () => setError("تعذر تحديد موقعك الحالي. يمكنك اختيار الموقع يدويًا على الخريطة."), { enableHighAccuracy: true, timeout: 10000 });
  }

  return <div className={styles.locationPicker}>
    <input type="hidden" name="latitude" value={value?.latitude ?? ""} />
    <input type="hidden" name="longitude" value={value?.longitude ?? ""} />
    <div className={styles.actions}><button type="button" className="button secondary" onClick={useCurrentLocation}>استخدام موقعي الحالي</button><span className={styles.hint}>حدد الموقع على الخريطة أو أدخل إحداثياته يدويًا.</span></div>
    {apiKey && <div ref={mapElement} className={styles.map} aria-label="خريطة تحديد موقع الخدمة" />}
    <p className={styles.hint}>الإحداثيات اليدوية</p>
    <ManualCoordinates value={value} onChange={onChange} />
    {value && <p className={styles.hint} dir="ltr">{value.latitude.toFixed(6)}, {value.longitude.toFixed(6)}</p>}
    {loading && <p className={styles.hint}>جاري تحميل الخريطة...</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </div>;
}
