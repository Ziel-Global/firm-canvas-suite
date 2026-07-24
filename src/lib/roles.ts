/**
 * Internal (staff) roles for the firm admin app.
 * `client` remains a DB / portal role but is never assignable or listed here —
 * clients use a separate portal, not this app.
 */

export const STAFF_ROLES = [
  "super_admin",
  "admin",
  "senior_lawyer",
  "junior_lawyer",
  "support",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

/** Roles selectable when creating a staff user (super_admin is not self-serve). */
export const CREATE_USER_ROLES = [
  "admin",
  "senior_lawyer",
  "junior_lawyer",
  "support",
] as const;

export type CreateUserRole = (typeof CREATE_USER_ROLES)[number];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  senior_lawyer: "Senior Lawyer",
  junior_lawyer: "Junior Lawyer",
  support: "Support",
};

export function isStaffRole(role: string | null | undefined): role is StaffRole {
  return (
    role === "super_admin" ||
    role === "admin" ||
    role === "senior_lawyer" ||
    role === "junior_lawyer" ||
    role === "support"
  );
}
