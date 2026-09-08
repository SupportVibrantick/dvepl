import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { adminLogs } from "../../../services/logger/contextLogger";
import { settingsSchema } from "../../../schemas/admin/settings/settings.schema";
import { encrypt } from "../../../utils/encryption";

async function updateSettingsRoute(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  fastify.post(
    "/",
    {
      schema: {
        tags: ["Settings"],
        summary: "Update Settings",
        description: "Updates company-wide settings.",
      },
      preHandler: [
        fastify.verifyToken
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validationResult = settingsSchema.safeParse(request.body);

        if (!validationResult.success) {
          adminLogs.error("Invalid settings data", {
            error: validationResult.error,
          });

          return reply.status(400).send({
            success: false,
            message: "Invalid settings data.",
            error: validationResult.error.issues,
          });
        }

        const companyId = request.user.companyId;

        // Upsert database notification configuration. Only touch it when this
        // settings payload actually carries notification-related data, and even
        // then merge with the existing row so unrelated partial saves (theme,
        // order fields, etc.) never wipe the SMTP / email-enabled config.
        const smtp = validationResult.data.smtpSettings ?? {};
        const emailFlags = (validationResult.data.emailSettings ?? {}) as Record<string, unknown>;
        const waFlags = (validationResult.data.waSettings ?? {}) as Record<string, unknown>;
        const gateway = validationResult.data.gatewaySettings ?? {};

        const hasNotificationData =
          Object.keys(smtp).length > 0 ||
          Object.keys(emailFlags).length > 0 ||
          Object.keys(waFlags).length > 0 ||
          Object.keys(gateway).length > 0;

        if (companyId && hasNotificationData) {
          const EMAIL_FLAG_KEYS = ["orders", "tasks", "payments", "delivery", "orderGen", "gatePass", "paymentRel", "clientNotify"];
          const WA_FLAG_KEYS = ["orderGen", "gatePass", "paymentRel", "clientNotify"];

          const existing = await fastify.prisma.notificationConfiguration.findUnique({ where: { companyId } });

          const hasSmtpValues = !!(smtp.host || smtp.port || smtp.username || smtp.password || smtp.title);
          const hasEmailFlags = EMAIL_FLAG_KEYS.some((k) => typeof emailFlags[k] === "boolean");
          const hasWaFlags = WA_FLAG_KEYS.some((k) => typeof waFlags[k] === "boolean");

          const effectiveHost = smtp.host || existing?.smtpHost || null;
          const smtpPortVal =
            smtp.port === undefined || smtp.port === null || smtp.port === ""
              ? existing?.smtpPort ?? null
              : parseInt(String(smtp.port), 10);
          const effectivePort = isNaN(smtpPortVal as any) ? null : smtpPortVal;

          const anyEmailFlag = EMAIL_FLAG_KEYS.some((k) => emailFlags[k] === true);
          const anyWaFlag = WA_FLAG_KEYS.some((k) => waFlags[k] === true);

          const emailEnabled = hasSmtpValues || hasEmailFlags
            ? !!((effectiveHost && effectivePort) || anyEmailFlag)
            : (existing?.emailEnabled ?? true);

          const whatsappEnabled =
            typeof gateway.enabled === "boolean"
              ? gateway.enabled
              : hasWaFlags
                ? anyWaFlag
                : (existing?.whatsappEnabled ?? false);

          let providerEnum: any = existing?.whatsappProvider ?? null;
          const p = gateway.provider?.toUpperCase();
          if (p === "SMTP" || p === "META" || p === "TWILIO" || p === "WATI" || p === "AISENSY") {
            providerEnum = p;
          }

          const rawApiKey = gateway.apiKey;
          const isMaskedApiKey = typeof rawApiKey === "string" && rawApiKey.includes("****");
          const encryptedApiKey = rawApiKey && !isMaskedApiKey ? encrypt(rawApiKey) : null;

          const updateData: any = { emailEnabled, whatsappEnabled };

          if (smtp.host) updateData.smtpHost = smtp.host;
          if (!isNaN(smtpPortVal as any)) updateData.smtpPort = smtpPortVal;
          if (smtp.username) updateData.smtpUsername = smtp.username;
          if (smtp.password) updateData.smtpPassword = smtp.password;
          if (smtp.username || emailFlags.address) updateData.smtpFromEmail = smtp.username || (emailFlags.address as string);
          if (smtp.title || emailFlags.name) updateData.smtpFromName = smtp.title || (emailFlags.name as string);
          if (providerEnum) updateData.whatsappProvider = providerEnum;
          if (gateway.instanceId || gateway.baseUrl) updateData.whatsappEndpoint = gateway.instanceId || gateway.baseUrl;
          if (gateway.campaignName) updateData.whatsappCampaignName = gateway.campaignName;
          if (gateway.number) updateData.whatsappNumber = gateway.number;
          if (encryptedApiKey) updateData.whatsappApiKey = encryptedApiKey;

          const createData = {
            ...updateData,
            companyId,
            smtpHost: updateData.smtpHost ?? null,
            smtpPort: updateData.smtpPort ?? null,
            smtpUsername: updateData.smtpUsername ?? null,
            smtpPassword: updateData.smtpPassword ?? null,
            smtpFromEmail: updateData.smtpFromEmail ?? null,
            smtpFromName: updateData.smtpFromName ?? null,
          };

          await fastify.prisma.notificationConfiguration.upsert({
            where: { companyId },
            update: updateData,
            create: createData,
          });
        }

        const existingSettings = await fastify.prisma.companySettings.findUnique({ where: { companyId } });
        const updatedSettings = {
          ...((existingSettings?.data as object) || {}),
          ...validationResult.data,
        };
        await fastify.prisma.companySettings.upsert({
          where: { companyId },
          create: { companyId, data: updatedSettings },
          update: { data: updatedSettings },
        });

        adminLogs.info("Settings updated successfully");

        return reply.status(200).send({
          success: true,
          message: "Settings updated successfully.",
          data: updatedSettings,
        });
      } catch (error: any) {
        adminLogs.error("Update Settings failed", { error });
        return reply.status(500).send({
          success: false,
          message: "Server error while saving settings.",
        });
      }
    }
  );
}

export default updateSettingsRoute;
