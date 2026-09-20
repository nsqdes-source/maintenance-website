"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
export default function PortalNavigation({kind}:{kind:"customer"|"technician"}){const path=usePathname();const links=kind==="customer"?[['/account','حسابي'],['/request','طلب خدمة'],['/account/edit','بياناتي']]:[['/technician','لوحة الفني'],['/account/edit','بياناتي']];return <aside className="portalSidebar"><strong>{kind==="customer"?"حساب العميل":"مساحة الفني"}</strong><nav>{links.map(([href,label])=><Link className={path===href?"active":""} href={href} key={href}>{label}</Link>)}</nav><button type="button" onClick={async()=>{await createClient().auth.signOut();window.location.href="/"}}>تسجيل الخروج</button></aside>}
