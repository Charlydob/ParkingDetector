export const MODULE_REGISTRY = [
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

export const IMPLEMENTED_MODULE_IDS = MODULE_REGISTRY
  .filter((module) => module.implemented)
  .map((module) => module.id);

export function isKnownModule(moduleId) {
  return MODULE_REGISTRY.some((module) => module.id === moduleId);
}
