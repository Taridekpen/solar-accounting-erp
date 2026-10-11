import { apiRequest } from "@/services/api-client";

export interface PageResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface BranchRecord {
  id: string;
  branchCode: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  managerId: string | null;
  managerName: string | null;
  isHeadOffice: boolean;
  status: "active" | "inactive";
  openingDate: string | null;
}

export interface CompanyRecord {
  id: string;
  legalName: string;
  tradingName: string | null;
  registrationNumber: string | null;
  taxIdentificationNumber: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  baseCurrency: string;
  timezone: string;
  fiscalYearStartMonth: number;
  purchaseApprovalLimit: string;
  logoUrl: string | null;
  inventoryCostingMethod: string;
  moneyRoundingMode: string;
  emailNotificationsEnabled: boolean;
  status: string;
}

export interface DepartmentRecord {
  id: string;
  code: string;
  name: string;
  status: "active" | "inactive";
  branchId: string | null;
  branchName: string | null;
}

export interface EmployeeRecord {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  branchId: string;
  branchName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  jobTitle: string | null;
  employmentStatus: string;
  hireDate: string | null;
  userId: string | null;
  userEmail: string | null;
}

function queryString(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function fetchBranches(search = "", page = 1) {
  return apiRequest<PageResult<BranchRecord>>(`/branches${queryString({ search, page, pageSize: 20 })}`);
}

export function createBranch(body: Record<string, unknown>) {
  return apiRequest<BranchRecord>("/branches", { method: "POST", body: JSON.stringify(body) });
}

export function updateBranch(id: string, body: Record<string, unknown>) {
  return apiRequest<BranchRecord>(`/branches/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function updateBranchStatus(id: string, status: "active" | "inactive") {
  return apiRequest<BranchRecord>(`/branches/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export function fetchCompany() {
  return apiRequest<CompanyRecord>("/company");
}

export function updateCompany(body: Record<string, unknown>) {
  return apiRequest<CompanyRecord>("/company", { method: "PATCH", body: JSON.stringify(body) });
}

export function fetchDepartments(search = "") {
  return apiRequest<PageResult<DepartmentRecord>>(`/departments${queryString({ search, pageSize: 50 })}`);
}

export function createDepartment(body: { code: string; name: string; branchId?: string }) {
  return apiRequest<DepartmentRecord>("/departments", { method: "POST", body: JSON.stringify(body) });
}

export function fetchEmployees(search = "") {
  return apiRequest<PageResult<EmployeeRecord>>(`/employees${queryString({ search, pageSize: 50 })}`);
}

export function createEmployee(body: Record<string, unknown>) {
  return apiRequest<EmployeeRecord>("/employees", { method: "POST", body: JSON.stringify(body) });
}

export function fetchEmployee(id: string) {
  return apiRequest<EmployeeRecord>(`/employees/${id}`);
}

export function updateEmployee(id: string, body: Record<string, unknown>) {
  return apiRequest<EmployeeRecord>(`/employees/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}
