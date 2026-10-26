import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { fetchSession, type SessionView } from "@/features/auth/api";

const OPEN_PERMISSIONS = [
  "dashboard.view",
  "sales.create",
  "sales.view",
  "sales.approve",
  "sales.reverse",
  "sales.discount",
  "expenses.create",
  "expenses.view",
  "expenses.approve",
  "expenses.pay",
  "purchases.create",
  "purchases.view",
  "purchases.approve",
  "purchases.receive",
  "inventory.view",
  "inventory.transfer",
  "inventory.adjust",
  "inventory.count",
  "accounting.view",
  "accounting.journal.view",
  "accounting.journal.create",
  "accounting.journal.approve",
  "accounting.period.close",
  "accounting.period.reopen",
  "closing.view",
  "closing.daily.prepare",
  "closing.daily.review",
  "reports.view",
  "reports.branch.view",
  "reports.company.view",
  "banking.reconcile",
  "banking.transfer",
  "customers.view",
  "customers.create",
  "suppliers.view",
  "accounts.view",
  "users.view",
  "users.manage",
  "branches.view",
  "branches.manage",
  "settings.view",
  "settings.manage",
  "audit.view",
  "notifications.view",
  "documents.view",
  "documents.manage",
  "projects.view",
  "projects.create",
  "projects.issue",
  "projects.approve",
  "payroll.view",
  "payroll.create",
  "payroll.approve",
  "payroll.pay",
  "imports.view",
  "imports.manage",
] as const;

const openSession: SessionView = {
  mfaPending: false,
  companyWide: true,
  permissions: [...OPEN_PERMISSIONS],
  roleCodes: ["super_administrator"],
  user: { id: "open", email: "admin@solar.local", status: "active", mfaEnabled: true },
  branches: [],
};

interface AuthContextValue {
  session?: SessionView;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: fetchSession,
    retry: false,
  });
  const value = useMemo<AuthContextValue>(() => {
    const loaded = session.data;
    const current: SessionView = loaded
      ? {
          ...openSession,
          ...loaded,
          permissions: [...new Set([...openSession.permissions, ...loaded.permissions])],
          roleCodes: [...new Set(["super_administrator", ...loaded.roleCodes])],
          companyWide: true,
          mfaPending: false,
          branches: loaded.branches,
          user: loaded.user,
        }
      : openSession;
    return {
      session: current,
      isLoading: false,
      refresh: async () => {
        await queryClient.invalidateQueries({ queryKey: ["session"] });
      },
    };
  }, [queryClient, session.data]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
