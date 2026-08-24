export type ModuleId =
  | "parking"
  | "checkout"
  | "checkin"
  | "housekeeping"
  | "access"
  | "messaging"
  | "payments"
  | "energy"
  | "maintenance";

export type TenantRole = "tenant_admin" | "staff";
export type GlobalRole = "platform_admin";

export interface ModuleDefinition {
  id: ModuleId;
  label: string;
  section: "operations" | "management" | "system";
  implemented: boolean;
}

export const MODULE_REGISTRY: ModuleDefinition[] = [
  { id: "parking", label: "Parking", section: "operations", implemented: true },
  { id: "checkout", label: "Checkout", section: "operations", implemented: true },
  { id: "checkin", label: "Check-in", section: "operations", implemented: false },
  { id: "housekeeping", label: "Housekeeping", section: "operations", implemented: false },
  { id: "access", label: "Access Control", section: "system", implemented: false },
  { id: "messaging", label: "Messaging", section: "system", implemented: false },
  { id: "payments", label: "Payments", section: "system", implemented: false },
  { id: "energy", label: "Energy", section: "system", implemented: false },
  { id: "maintenance", label: "Maintenance", section: "management", implemented: false },
];
