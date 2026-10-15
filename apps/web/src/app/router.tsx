import { Navigate, createBrowserRouter } from "react-router-dom";
import type { AppPermission } from "@/app/navigation";
import { navigation } from "@/app/navigation";
import { PageLoader } from "@/components/ui/page-loader";
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
import { ActivateAccountPage } from "@/pages/ActivateAccountPage";
import { LoginPage } from "@/pages/LoginPage";
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

function ProtectedShell() {
  const { session, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas p-6">
        <PageLoader label="Loading account…" className="w-full max-w-md border-0 bg-transparent shadow-none" />
      </div>
    );
  }
  if (!session || session.mfaPending) {
    return <Navigate to="/login" replace />;
  }
  return <AppShell permissions={session.permissions as readonly AppPermission[]} />;
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/activate", element: <ActivateAccountPage /> },
  {
    path: "/",
    element: <ProtectedShell />,
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
