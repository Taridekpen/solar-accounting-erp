import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { fetchSession, type SessionView } from "@/features/auth/api";

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
  const value = useMemo<AuthContextValue>(
    () => ({
      session: session.data,
      isLoading: session.isLoading,
      refresh: async () => {
        await queryClient.invalidateQueries({ queryKey: ["session"] });
      },
    }),
    [queryClient, session.data, session.isLoading],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
