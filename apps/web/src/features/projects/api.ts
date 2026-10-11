import { apiRequest } from "@/services/api-client";

export interface ProjectRecord {
  id: string;
  projectNumber: string;
  name: string;
  customerName: string;
  branchId: string;
  projectType: string;
  status: string;
  location: string;
  contractValue: string;
  estimatedCost: string;
  budget: string;
  actualCost: string;
  recognizedRevenue: string;
  recognizedCost: string;
  grossProfit: string;
  contractOutstanding: string;
  costVariance: string;
  estimatedCompletionMargin: string;
  startDate: string;
  expectedCompletionDate: string;
}

export function fetchProjects() {
  return apiRequest<ProjectRecord[]>("/projects");
}

export function createProject(body: Record<string, unknown>) {
  return apiRequest<ProjectRecord>("/projects", { method: "POST", body: JSON.stringify(body) });
}
