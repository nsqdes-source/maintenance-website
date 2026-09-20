import type { Metadata } from "next";
import ServiceLandingPage from "../ServiceLandingPage";
import { getService } from "../service-content";

export const metadata: Metadata = {
  title: "صيانة وتنظيف مكيفات في مكة | معين",
  description: "خدمات معين لتنظيف وصيانة مكيفات السبليت والشباك في مكة، وتشخيص ضعف التبريد والتسريب والأعطال قبل الإصلاح.",
  alternates: { canonical: "/services/ac" },
};

export default function AcServicePage() {
  return <ServiceLandingPage service={getService("ac")} />;
}
