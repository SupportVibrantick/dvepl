import { z } from "zod";

export const settingsSchema = z.object({
  orderFields: z.array(z.any()).optional(),
  addOrderFormFields: z.record(z.string(), z.boolean()).optional(),
  orderStageRequirements: z.record(z.string(), z.boolean()).optional(),
  orderDocuments: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1, "Document name is required"),
    isMandatory: z.boolean().default(false),
    description: z.string().optional(),
  })).optional(),
  concernedPersons: z.array(z.any()).optional(),
  waSettings: z.object({
    orderGen: z.boolean().optional(),
    gatePass: z.boolean().optional(),
    paymentRel: z.boolean().optional(),
    clientNotify: z.boolean().optional(),
    number: z.string().optional()
  }).optional(),
  emailSettings: z.object({
    orders: z.boolean().optional(),
    tasks: z.boolean().optional(),
    payments: z.boolean().optional(),
    delivery: z.boolean().optional(),
    orderGen: z.boolean().optional(),
    gatePass: z.boolean().optional(),
    paymentRel: z.boolean().optional(),
    clientNotify: z.boolean().optional(),
    address: z.string().optional(),
    name: z.string().optional()
  }).optional(),
  alertEvents: z.array(z.any()).optional(),
  autoSendDefaults: z.object({
    purchaseOrder: z.boolean().optional(),
    vendorClarification: z.boolean().optional(),
    qcRejectionAlert: z.boolean().optional()
  }).optional(),
  smtpSettings: z.object({
    title: z.string().optional(),
    host: z.string().optional(),
    port: z.any().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    secure: z.boolean().optional(),
    supportEmail: z.string().optional(),
    supportPhone: z.string().optional(),
    address: z.string().optional()
  }).optional(),
  captchaSettings: z.object({
    siteKey: z.string().optional(),
    secretKey: z.string().optional(),
    enabled: z.boolean().optional()
  }).optional(),
  gatewaySettings: z.object({
    provider: z.string().optional(),
    apiKey: z.string().optional(),
    campaignName: z.string().optional(),
    instanceId: z.string().optional(),
    baseUrl: z.string().optional(),
    secretKey: z.string().optional(),
    number: z.string().optional(),
    enabled: z.boolean().optional(),
    sandbox: z.boolean().optional()
  }).optional(),
  templates: z.array(z.any()).optional(),
  brandColor: z.string().optional(),
  bgColor: z.string().optional(),
  sidebarPos: z.string().optional(),
  backupHistory: z.array(z.any()).optional()
});
