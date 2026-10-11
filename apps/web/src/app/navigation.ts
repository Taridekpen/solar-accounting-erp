import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Building2,
  LayoutDashboard,
  Landmark,
  Package,
  Sun,
  Receipt,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Truck,
  Users,
  UserCog,
  BarChart3,
  CalendarCheck,
  ListTree,
  Wallet,
  Upload,
} from "lucide-react";

export type AppPermission =
  | "dashboard.view"
  | "sales.view"
  | "purchases.view"
  | "inventory.view"
  | "expenses.view"
  | "banking.reconcile"
  | "projects.view"
  | "accounting.view"
  | "reports.view"
  | "closing.view"
  | "payroll.view"
  | "branches.view"
  | "customers.view"
  | "suppliers.view"
  | "accounts.view"
  | "users.view"
  | "settings.view"
  | "audit.view"
  | "notifications.view"
  | "documents.view"
  | "imports.view";

export interface NavItem {
  label: string;
  to: string;
  permission: AppPermission;
  icon: LucideIcon;
  group: "operations" | "records";
  section: string;
}

export const navigation: NavItem[] = [
  { label: "Dashboard", to: "/", permission: "dashboard.view", icon: LayoutDashboard, group: "operations", section: "Section 5" },
  { label: "Sales", to: "/sales", permission: "sales.view", icon: ShoppingCart, group: "operations", section: "Section 6" },
  { label: "Purchases", to: "/purchases", permission: "purchases.view", icon: ShoppingBag, group: "operations", section: "Section 7" },
  { label: "Inventory", to: "/inventory", permission: "inventory.view", icon: Package, group: "operations", section: "Section 8" },
  { label: "Expenses", to: "/expenses", permission: "expenses.view", icon: Receipt, group: "operations", section: "Section 9" },
  { label: "Banking", to: "/banking", permission: "banking.reconcile", icon: Landmark, group: "operations", section: "Section 10" },
  { label: "Projects", to: "/projects", permission: "projects.view", icon: Sun, group: "operations", section: "Section 11" },
  { label: "Accounting", to: "/accounting", permission: "accounting.view", icon: BookOpen, group: "operations", section: "Section 4" },
  { label: "Reports", to: "/reports", permission: "reports.view", icon: BarChart3, group: "operations", section: "Section 12" },
  { label: "Closing", to: "/closing", permission: "closing.view", icon: CalendarCheck, group: "operations", section: "Section 13" },
  { label: "Payroll", to: "/payroll", permission: "payroll.view", icon: Wallet, group: "operations", section: "Section 14" },
  { label: "Branches", to: "/branches", permission: "branches.view", icon: Building2, group: "records", section: "Section 2" },
  { label: "Customers", to: "/customers", permission: "customers.view", icon: Users, group: "records", section: "Section 6" },
  { label: "Suppliers", to: "/suppliers", permission: "suppliers.view", icon: Truck, group: "records", section: "Section 7" },
  { label: "Chart of Accounts", to: "/chart-of-accounts", permission: "accounts.view", icon: ListTree, group: "records", section: "Section 4" },
  { label: "Users & Roles", to: "/users", permission: "users.view", icon: UserCog, group: "records", section: "Section 3" },
  { label: "Settings", to: "/settings", permission: "settings.view", icon: Settings, group: "records", section: "Section 15" },
  { label: "Data Import", to: "/imports", permission: "imports.view", icon: Upload, group: "records", section: "Section 16" },
];

export function visibleNavigation(permissions: "all" | readonly string[]): NavItem[] {
  if (permissions === "all") {
    return navigation;
  }
  const allowed = new Set(permissions);
  return navigation.filter((item) => allowed.has(item.permission));
}
