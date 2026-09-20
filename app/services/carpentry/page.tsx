import type { Metadata } from "next";
import ServiceLandingPage from "../ServiceLandingPage";
import { getService } from "../service-content";

export const metadata: Metadata = {
  title: "خدمات نجارة منزلية في مكة | معين",
  description: "خدمات معين لإصلاح وضبط الأبواب والخزائن والأدراج والمفصلات وأعمال النجارة المنزلية البسيطة في مكة.",
  alternates: { canonical: "/services/carpentry" },
};

export default function CarpentryServicePage() {
  return <ServiceLandingPage service={getService("carpentry")} />;
}
