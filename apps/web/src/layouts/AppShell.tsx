import { Outlet } from "react-router-dom";
import type { AppPermission } from "@/app/navigation";
import { Header } from "@/layouts/Header";
import { Sidebar } from "@/layouts/Sidebar";

export function AppShell({ permissions = "all" }: { permissions?: "all" | readonly AppPermission[] }) {
  return (
    <div className="flex h-dvh max-h-dvh overflow-hidden bg-canvas">
      <Sidebar permissions={permissions} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
