import type { Metadata } from "next";
import ServiceLandingPage from "../ServiceLandingPage";
import { getService } from "../service-content";

export const metadata: Metadata = {
  title: "خدمات سباكة منزلية في مكة | معين",
  description: "خدمات معين لمعالجة التسريبات والانسدادات ومشكلات الخلاطات والصمامات وتدفق المياه في مكة.",
  alternates: { canonical: "/services/plumbing" },
};

export default function PlumbingServicePage() {
  return <ServiceLandingPage service={getService("plumbing")} />;
}
