import { z } from "zod";

export const salesOrderItemSchema = z.object({
  itemCode: z.string().min(1, "Item code is required"),

  description: z.string().min(1, "Description is required"),

  unit: z.string().min(1, "Unit is required"),

  quantity: z.number().positive(),

  rate: z.number().nonnegative(),

  gstPercentage: z.number().min(0).max(100),

  

  remarks: z.string().optional().nullable(),
});

export const salesOrderSchema = z.object({
  companyId: z.string().uuid(),

  customerId: z.string().uuid().nullable().optional(),

  dveplCode: z.string().min(1, "DVEPL Code is required"),

  status: z.enum([
    "PENDING",
    "IN_PROGRESS",
    "COMPLETED",
    "ON_HOLD",
    "NEW_ORDER",
  ]),

  orderTakenById: z.string().uuid().nullable().optional(),

  // Multiple "Order Taken By" users (many-to-many)
  orderTakenByUserIds: z.array(z.string().uuid()).optional(),

  partyName: z.string().min(1, "Party name is required"),

  caNo: z.string().nullable().optional(),

  contactDetails: z.string().nullable().optional(),

  concernedPersons: z.array(z.string()).optional().default([]),

  orderConfirmDate: z.string().nullable().optional(),

  deliveryMonthTarget: z.string().nullable().optional(),

  poDate: z.string().nullable().optional(),

  drawingConcernedPerson: z.string().nullable().optional(),

  drawingApprovedDate: z.string().nullable().optional(),

  // Matches frontend value "APPROVED"
  drawingStatus: z
    .enum([
      "PENDING",
      "APPROVED",
      "REJECTED",
      "IN_PROGRESS",
    ])
    .nullable()
    .optional(),

  drawingRemarks: z.string().nullable().optional(),

  inspectionField: z.string().nullable().optional(),

  sendNotification: z.boolean().default(true),

  notifyEmail: z.boolean().default(false),

  notifyWhatsApp: z.boolean().default(false),

  remarks: z.string().nullable().optional(),

  items: z.array(salesOrderItemSchema).optional().default([]),
});

export type SalesOrderInput = z.infer<typeof salesOrderSchema>;