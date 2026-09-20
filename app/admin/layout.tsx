import { Suspense } from "react";
import AdminNavigation from "./AdminNavigation";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={children}><AdminNavigation>{children}</AdminNavigation></Suspense>;
}
