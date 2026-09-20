import type { Metadata } from "next";
import ServiceLandingPage from "../ServiceLandingPage";
import { getService } from "../service-content";

export const metadata: Metadata = {
  title: "خدمات كهربائية منزلية في مكة | معين",
  description: "خدمات معين للمقابس والمفاتيح والإنارة والقواطع والأعطال الكهربائية المنزلية في مكة ضمن نطاق واضح.",
  alternates: { canonical: "/services/electrical" },
};

export default function ElectricalServicePage() {
  return <ServiceLandingPage service={getService("electrical")} />;
}
