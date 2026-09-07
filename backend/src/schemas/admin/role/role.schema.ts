import { z } from "zod";

export const createRoleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Role name is required")
    .max(100),

  description: z
    .string()
    .trim()
    .optional(),

  permissionIds: z
    .array(z.string().uuid())
    .optional()
    .default([]),

  pageAccess: z.array(z.string()).optional(),
  actionPermissions: z.any().optional(),
});


export const updateRoleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Role name is required")
    .max(100)
    .optional(),
  description: z.string().optional().nullable(),
  permissionIds: z.array(z.string().uuid()).optional(),
  pageAccess: z.array(z.string()).optional(),
  actionPermissions: z.any().optional(),
});