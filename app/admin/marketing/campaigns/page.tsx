import UtmBuilder from "./UtmBuilder";

export default function MarketingCampaignsPage() {
  return <main className="adminPage"><div className="container adminContainer">
    <div className="adminTopbar"><div><p className="eyebrow">التسويق</p><h1>الحملات</h1></div></div>
    <UtmBuilder />
  </div></main>;
}
