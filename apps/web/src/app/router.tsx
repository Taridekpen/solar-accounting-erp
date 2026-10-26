import { Navigate, createBrowserRouter } from "react-router-dom";
import type { AppPermission } from "@/app/navigation";
import { navigation } from "@/app/navigation";
import { useAuth } from "@/features/auth/auth-context";
import { AppShell } from "@/layouts/AppShell";
import { AccountingPage } from "@/pages/AccountingPage";
import { ChartOfAccountsPage } from "@/pages/ChartOfAccountsPage";
import { CustomersPage } from "@/pages/CustomersPage";
import { DashboardDetailPage } from "@/pages/DashboardDetailPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { BranchesPage } from "@/pages/BranchesPage";
import { DepartmentsPage } from "@/pages/DepartmentsPage";
import { BankingPage } from "@/pages/BankingPage";
import { EmployeesPage } from "@/pages/EmployeesPage";
import { ExpensesPage } from "@/pages/ExpensesPage";
import { InventoryPage } from "@/pages/InventoryPage";
import { ModulePlaceholderPage } from "@/pages/ModulePlaceholderPage";
import { ProjectsPage } from "@/pages/ProjectsPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { ClosingPage } from "@/pages/ClosingPage";
import { PayrollPage } from "@/pages/PayrollPage";
import { PurchasesPage } from "@/pages/PurchasesPage";
import { SalesPage } from "@/pages/SalesPage";
import { SuppliersPage } from "@/pages/SuppliersPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { ImportsPage } from "@/pages/ImportsPage";
import { UsersPage } from "@/pages/UsersPage";

function pageFor(path: string) {
  if (path === "/branches") {
    return <BranchesPage />;
  }
  if (path === "/settings") {
    return <SettingsPage />;
  }
  if (path === "/imports") {
    return <ImportsPage />;
  }
  if (path === "/users") {
    return <UsersPage />;
  }
  if (path === "/accounting") {
    return <AccountingPage />;
  }
  if (path === "/chart-of-accounts") {
    return <ChartOfAccountsPage />;
  }
  if (path === "/customers") {
    return <CustomersPage />;
  }
  if (path === "/sales") {
    return <SalesPage />;
  }
  if (path === "/suppliers") {
    return <SuppliersPage />;
  }
  if (path === "/purchases") {
    return <PurchasesPage />;
  }
  if (path === "/inventory") {
    return <InventoryPage />;
  }
  if (path === "/expenses") {
    return <ExpensesPage />;
  }
  if (path === "/banking") {
    return <BankingPage />;
  }
  if (path === "/projects") {
    return <ProjectsPage />;
  }
  if (path === "/reports") {
    return <ReportsPage />;
  }
  if (path === "/closing") {
    return <ClosingPage />;
  }
  if (path === "/payroll") {
    return <PayrollPage />;
  }
  return <ModulePlaceholderPage path={path} />;
}

function OpenShell() {
  const { session } = useAuth();
  const permissions = session?.permissions.length
    ? (session.permissions as readonly AppPermission[])
    : "all";
  return <AppShell permissions={permissions} />;
}

export const router = createBrowserRouter([
  { path: "/login", element: <Navigate to="/" replace /> },
  { path: "/activate", element: <Navigate to="/" replace /> },
  {
    path: "/",
    element: <OpenShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "dashboard/details/:metric", element: <DashboardDetailPage /> },
      ...navigation
        .filter((item) => item.to !== "/")
        .map((item) => ({
          path: item.to.slice(1),
          element: pageFor(item.to),
        })),
      { path: "departments", element: <DepartmentsPage /> },
      { path: "employees", element: <EmployeesPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
