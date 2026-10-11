import type { DashboardPreset } from "@solar/shared";
import { setActiveBranchFilter } from "@/services/api-client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface UiContextValue {
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  preset: DashboardPreset;
  setPreset: (preset: DashboardPreset) => void;
  from: string;
  to: string;
  setCustomRange: (from: string, to: string) => void;
  selectedBranchIds: string[];
  setSelectedBranchIds: (branchIds: string[]) => void;
}

const UiContext = createContext<UiContextValue | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<"light" | "dark">(() =>
    localStorage.getItem("solar-theme") === "dark" ? "dark" : "light",
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [preset, setPreset] = useState<DashboardPreset>("this_month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedBranchIds, setSelectedBranchIdsState] = useState<string[]>([]);
  const setSelectedBranchIds = (branchIds: string[]) => {
    setActiveBranchFilter(branchIds);
    setSelectedBranchIdsState(branchIds);
  };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("solar-theme", theme);
  }, [theme]);

  useEffect(() => {
    setActiveBranchFilter(selectedBranchIds);
  }, [selectedBranchIds]);

  const value = useMemo<UiContextValue>(
    () => ({
      theme,
      setTheme: setThemeState,
      sidebarCollapsed,
      toggleSidebar: () => setSidebarCollapsed((current) => !current),
      mobileNavOpen,
      setMobileNavOpen,
      preset,
      setPreset,
      from,
      to,
      setCustomRange: (nextFrom, nextTo) => {
        setFrom(nextFrom);
        setTo(nextTo);
        setPreset("custom");
      },
      selectedBranchIds,
      setSelectedBranchIds,
    }),
    [theme, sidebarCollapsed, mobileNavOpen, preset, from, to, selectedBranchIds],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi() {
  const context = useContext(UiContext);
  if (!context) {
    throw new Error("useUi must be used within UiProvider");
  }
  return context;
}
