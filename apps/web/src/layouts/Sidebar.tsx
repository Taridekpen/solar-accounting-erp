import { NavLink } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen, SunMedium } from "lucide-react";
import { visibleNavigation, type AppPermission } from "@/app/navigation";
import { useUi } from "@/stores/ui-context";
import { cn } from "@/utils/cn";

export function Sidebar({ permissions }: { permissions: "all" | readonly AppPermission[] }) {
  const { sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNavOpen } = useUi();
  const items = visibleNavigation(permissions);
  const operations = items.filter((item) => item.group === "operations");
  const records = items.filter((item) => item.group === "records");

  return (
    <>
      {mobileNavOpen ? (
        <button
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}
      <aside
        data-testid="app-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-dvh max-h-dvh w-64 flex-col overflow-hidden bg-sidebar text-sidebar-foreground transition-transform lg:static lg:h-full lg:max-h-none lg:translate-x-0",
          sidebarCollapsed && "lg:w-[4.5rem]",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
            <SunMedium className="h-5 w-5" />
          </div>
          {sidebarCollapsed ? null : (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">AFRO TEL SOLAR</p>
            </div>
          )}
        </div>
        <nav className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-3 py-4" aria-label="Primary">
          <NavGroup items={operations} collapsed={sidebarCollapsed} onNavigate={() => setMobileNavOpen(false)} />
          <div className="border-t border-white/10 pt-4">
            <NavGroup items={records} collapsed={sidebarCollapsed} onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </nav>
        <button
          type="button"
          className="no-print m-3 hidden shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-muted hover:bg-white/5 lg:flex"
          onClick={toggleSidebar}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {sidebarCollapsed ? <span className="sr-only">Expand sidebar</span> : <span>Collapse</span>}
        </button>
      </aside>
    </>
  );
}

function NavGroup({
  items,
  collapsed,
  onNavigate,
}: {
  items: ReturnType<typeof visibleNavigation>;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            end={item.to === "/"}
            title={item.label}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground hover:bg-white/5",
                isActive && "bg-primary font-medium text-white hover:bg-primary",
                collapsed && "justify-center px-2",
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
