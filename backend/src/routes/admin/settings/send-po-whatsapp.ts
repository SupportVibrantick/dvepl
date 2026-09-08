import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { PurchaseOrderStatus } from "@prisma/client";
import { z } from "zod";
import { adminLogs } from "../../../services/logger/contextLogger";
import { NotificationService } from "../../../services/notification/notification.service";

const sendPoWhatsappSchema = z.object({
  vendorId: z.string().uuid().optional(),
  poNumber: z.string().min(1),
  phone: z.string().min(5),
  vendorName: z.string().optional(),
  grandTotal: z.string().optional(),
  itemsSummary: z.string().optional(),
  dueDate: z.string().optional(),
  messageText: z.string().optional(),
});

async function sendPoWhatsappRoute(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  fastify.post(
    "/send-po-whatsapp",
    {
      schema: {
        tags: ["Settings", "Purchase Order"],
        summary: "Send Purchase Order via WhatsApp",
        description: "Sends a Purchase Order notification to a vendor via AiSensy WhatsApp API.",
      },
      preHandler: [
        fastify.verifyToken
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validation = sendPoWhatsappSchema.safeParse(request.body);

        if (!validation.success) {
          return reply.status(400).send({
            success: false,
            message: "A valid phone number and PO number are required.",
            errors: validation.error.issues,
          });
        }

        const {
          vendorId,
          poNumber,
          phone,
          vendorName,
          grandTotal,
          itemsSummary,
          dueDate,
          messageText,
        } = validation.data;

        const companyId = request.user.companyId;

        // Verify if Purchase Order exists in DB
        let purchaseOrder: any = null;
        if (companyId) {
          purchaseOrder = await fastify.prisma.purchaseOrder.findFirst({
            where: {
              companyId,
              poNo: poNumber,
              deletedAt: null,
              ...(vendorId ? { vendorId } : {}),
            },
            include: {
              vendor: true,
            },
          });
        }

        const resolvedVendorName =
          vendorName || purchaseOrder?.vendor?.name || "Vendor Partner";

        // Query settings to determine specific configured PO campaign
        let targetCampaign = "";
        try {
          const companySettings = await fastify.prisma.companySettings.findUnique({
            where: { companyId },
          });
          const gw = (companySettings?.data as any)?.gatewaySettings || {};
          targetCampaign = gw.poCampaign || "";
        } catch {}

        const todayFormatted = new Date().toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });

        // Template parameters matching payment_reminder_01 (Payments campaign): {{1}} Name, {{2}} Amount, {{3}} Phone
        const templateParams = [
          resolvedVendorName,          // {{1}} Vendor name
          grandTotal || "pending",     // {{2}} Grand total amount
          phone.trim(),                // {{3}} Contact phone number
        ];

        // Send via WhatsApp Notification Service
        // Uses "Payments" campaign (payment_reminder_01) - LIVE, text-only, no PDF required
        await NotificationService.sendWhatsAppNotification(
          {
            to: phone.trim(),
            userName: resolvedVendorName,
            campaignName: targetCampaign || "Payments",
            templateParams,
            eventCode: "PURCHASE_ORDER_SENT",
            relatedModule: "PURCHASE_ORDER",
            relatedRecordId: purchaseOrder?.id || undefined,
          },
          companyId
        );

        // Update PO status to SENT if PO is tracked in database
        if (purchaseOrder?.id) {
          await fastify.prisma.purchaseOrder.update({
            where: { id: purchaseOrder.id },
            data: {
              status: PurchaseOrderStatus.SENT,
              sentAt: new Date(),
            },
          });
        }

        return reply.status(200).send({
          success: true,
          message: `Purchase Order WhatsApp notification sent successfully to ${phone}!`,
          data: {
            destination: phone,
            poNumber,
            vendorName: resolvedVendorName,
          },
        });
      } catch (error: any) {
        adminLogs.error("Send PO WhatsApp failed", { error: error.message });
        return reply.status(200).send({
          success: false,
          message: error.message || "Failed to send WhatsApp message to vendor.",
        });
      }
    }
  );
}

export default sendPoWhatsappRoute;
