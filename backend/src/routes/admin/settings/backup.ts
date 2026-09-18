import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { adminLogs } from "../../../services/logger/contextLogger";
import { encrypt, maskApiKey } from "../../../utils/encryption";

async function backupRestoreRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  // Export backup
  fastify.get(
    "/backup/export",
    {
      schema: {
        tags: ["Settings"],
        summary: "Export Settings Backup",
        description: "Returns the complete company settings and database configurations.",
      },
      preHandler: [fastify.verifyToken],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        let companyId = (request.admin as any)?.companyId;
        if (!companyId) {
          const firstCompany = await fastify.prisma.company.findFirst();
          if (firstCompany) companyId = firstCompany.id;
        }

        const storedSettings = companyId
          ? await fastify.prisma.companySettings.findUnique({ where: { companyId } })
          : null;
        const settings: any = storedSettings?.data || {};

        // Merge database values
        if (companyId) {
          const dbConfig = await fastify.prisma.notificationConfiguration.findUnique({
            where: { companyId }
          });
          if (dbConfig) {
            if (!settings.smtpSettings) settings.smtpSettings = {};
            settings.smtpSettings.host = dbConfig.smtpHost || settings.smtpSettings.host || "";
            settings.smtpSettings.port = dbConfig.smtpPort || settings.smtpSettings.port || 587;
            settings.smtpSettings.username = dbConfig.smtpUsername || settings.smtpSettings.username || "";
            settings.smtpSettings.password = dbConfig.smtpPassword || settings.smtpSettings.password || "";
            settings.smtpSettings.secure = dbConfig.smtpPort === 465;

            if (!settings.emailSettings) settings.emailSettings = {};
            settings.emailSettings.address = dbConfig.smtpFromEmail || settings.emailSettings.address || "";
            settings.emailSettings.name = dbConfig.smtpFromName || settings.emailSettings.name || "";

            if (!settings.gatewaySettings) settings.gatewaySettings = {};
            settings.gatewaySettings.apiKey = dbConfig.whatsappApiKey ? maskApiKey(dbConfig.whatsappApiKey) : "";
            settings.gatewaySettings.campaignName = dbConfig.whatsappCampaignName || "";
            settings.gatewaySettings.number = dbConfig.whatsappNumber || "";
          }
        }

        await fastify.prisma.auditLog.create({
          data: {
            userId: (request.admin as any)?.id ?? null,
            module: "Settings",
            recordId: (request.admin as any)?.email || "settings-backup",
            entityName: (request.admin as any)?.email || "settings-backup",
            action: "BACKUP_EXPORT",
            details: `Exported settings backup`,
            status: "SUCCESS",
            newValue: { type: "settings", timestamp: new Date().toISOString() },
            ipAddress: request.ip,
            userAgent: request.headers["user-agent"],
          },
        }).catch((err) => adminLogs.error("Failed to log backup export", { error: err }));

        return reply.status(200).send({
          success: true,
          data: {
            timestamp: new Date().toISOString(),
            ...settings,
          },
        });
      } catch (error: any) {
        adminLogs.error("Export backup failed", { error });
        return reply.status(500).send({
          success: false,
          message: "Failed to export backup."
        });
      }
    }
  );

  // Import backup
  fastify.post(
    "/backup/import",
    {
      schema: {
        tags: ["Settings"],
        summary: "Import Settings Backup",
        description: "Restores settings and database configuration from backup JSON.",
      },
      preHandler: [fastify.verifyToken],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const data = request.body as any;
        if (!data) {
          return reply.status(400).send({
            success: false,
            message: "Invalid backup data."
          });
        }

        let companyId = (request.admin as any)?.companyId;
        if (!companyId) {
          const firstCompany = await fastify.prisma.company.findFirst();
          if (firstCompany) companyId = firstCompany.id;
        }

        // Restore Notification Configuration in the database
        if (companyId) {
          const emailEnabled = !!(
            data.emailSettings?.orderGen ||
            data.emailSettings?.gatePass ||
            data.emailSettings?.paymentRel ||
            data.emailSettings?.clientNotify
          );
          const whatsappEnabled = !!(
            data.waSettings?.orderGen ||
            data.waSettings?.gatePass ||
            data.waSettings?.paymentRel ||
            data.waSettings?.clientNotify
          );

          let providerEnum: any = null;
          const p = data.gatewaySettings?.provider?.toUpperCase();
          if (p === "SMTP" || p === "META" || p === "TWILIO" || p === "WATI" || p === "AISENSY") {
            providerEnum = p;
          }

          const smtpPortVal = data.smtpSettings?.port 
            ? parseInt(String(data.smtpSettings.port), 10) 
            : null;

          const rawApiKey = data.gatewaySettings?.apiKey;
          const encryptedApiKey = rawApiKey ? encrypt(rawApiKey) : null;

          const upsertData = {
            emailEnabled,
            smtpHost: data.smtpSettings?.host || null,
            smtpPort: isNaN(smtpPortVal as any) ? null : smtpPortVal,
            smtpUsername: data.smtpSettings?.username || null,
            smtpPassword: data.smtpSettings?.password || null,
            smtpFromEmail: data.emailSettings?.address || null,
            smtpFromName: data.emailSettings?.name || null,
            whatsappEnabled,
            whatsappProvider: providerEnum,
            whatsappEndpoint: data.gatewaySettings?.instanceId || null,
            whatsappCampaignName: data.gatewaySettings?.campaignName || null,
            whatsappNumber: data.gatewaySettings?.number || null,
          };

          await fastify.prisma.notificationConfiguration.upsert({
            where: { companyId },
            update: {
              ...upsertData,
              ...(encryptedApiKey ? { whatsappApiKey: encryptedApiKey } : {}),
            },
            create: {
              ...upsertData,
              companyId,
              ...(encryptedApiKey ? { whatsappApiKey: encryptedApiKey } : {}),
            }
          });
        }

        if (companyId) {
          const { timestamp, ...settings } = data;
          await fastify.prisma.companySettings.upsert({
            where: { companyId },
            create: { companyId, data: settings },
            update: { data: settings },
          });
        }

        return reply.status(200).send({
          success: true,
          message: "Backup restored successfully.",
          data
        });
      } catch (error: any) {
        adminLogs.error("Import backup failed", { error });
        return reply.status(500).send({
          success: false,
          message: error.message || "Failed to restore backup."
        });
      }
    }
  );
}

export default backupRestoreRoutes;
