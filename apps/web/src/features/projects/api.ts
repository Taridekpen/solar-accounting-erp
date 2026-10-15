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

export interface ProjectMaterialRow {
  id: string;
  productName: string;
  sku: string;
  warehouseName: string;
  quantity: string;
  status: string;
  createdByUserId: string;
}

export interface ProjectMilestoneRow {
  id: string;
  name: string;
  amount: string;
  sequence: number;
  status: string;
  createdByUserId: string;
}

export interface ProjectDetail extends ProjectRecord {
  materials: ProjectMaterialRow[];
  milestones: ProjectMilestoneRow[];
}

export function fetchProjects() {
  return apiRequest<ProjectRecord[]>("/projects");
}

export function fetchProject(id: string) {
  return apiRequest<ProjectDetail>(`/projects/${id}`);
}

export function createProject(body: Record<string, unknown>) {
  return apiRequest<ProjectRecord>("/projects", { method: "POST", body: JSON.stringify(body) });
}

export function activateProject(id: string) {
  return apiRequest<ProjectDetail>(`/projects/${id}/activate`, { method: "POST" });
}

export function createMaterialRequest(projectId: string, body: { productId: string; warehouseId: string; quantity: string }) {
  return apiRequest<{ id: string; status: string }>(`/projects/${projectId}/materials`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function approveMaterial(projectId: string, requestId: string) {
  return apiRequest<{ id: string; status: string }>(`/projects/${projectId}/materials/${requestId}/approve`, {
    method: "POST",
  });
}

export function issueMaterial(projectId: string, requestId: string, accountingDate: string) {
  return apiRequest<ProjectRecord>(`/projects/${projectId}/materials/${requestId}/issue`, {
    method: "POST",
    body: JSON.stringify({ accountingDate }),
  });
}

export function addMilestone(projectId: string, body: { name: string; amount: string; sequence: number }) {
  return apiRequest<{ id: string; name: string; amount: string; status: string }>(`/projects/${projectId}/milestones`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function recognizeMilestone(projectId: string, milestoneId: string, accountingDate: string) {
  return apiRequest<ProjectRecord>(`/projects/${projectId}/milestones/${milestoneId}/recognize`, {
    method: "POST",
    body: JSON.stringify({ accountingDate }),
  });
}
