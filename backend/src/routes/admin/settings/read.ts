import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { adminLogs } from "../../../services/logger/contextLogger";
import { decrypt, maskApiKey } from "../../../utils/encryption";

async function readSettingsRoute(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  fastify.get(
    "/",
    {
      schema: {
        tags: ["Settings"],
        summary: "Read Settings",
        description: "Returns all company settings.",
      },
      preHandler: [
        fastify.verifyToken
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const companyId = request.user.companyId;

        const storedSettings = await fastify.prisma.companySettings.findUnique({ where: { companyId } });
        const settings: any = storedSettings?.data || {};

        // Query database notification configuration
        if (companyId) {
          const dbConfig = await fastify.prisma.notificationConfiguration.findUnique({
            where: { companyId }
          });

          if (dbConfig) {
            // Merge database values back into SMTP, WhatsApp & email notifications settings format
            if (!settings.smtpSettings) settings.smtpSettings = {};
            settings.smtpSettings.title = dbConfig.smtpFromName || settings.smtpSettings.title || "";
            settings.smtpSettings.host = dbConfig.smtpHost || settings.smtpSettings.host || "";
            settings.smtpSettings.port = dbConfig.smtpPort || settings.smtpSettings.port || 587;
            settings.smtpSettings.username = dbConfig.smtpUsername || settings.smtpSettings.username || "";
            settings.smtpSettings.password = dbConfig.smtpPassword || settings.smtpSettings.password || "";
            settings.smtpSettings.secure = dbConfig.smtpPort === 465;

            if (!settings.emailSettings) settings.emailSettings = {};
            settings.emailSettings.address = dbConfig.smtpFromEmail || settings.emailSettings.address || "";
            settings.emailSettings.name = dbConfig.smtpFromName || settings.emailSettings.name || "";
            
            // Set enabled states
            const isEmailEnabled = dbConfig.emailEnabled;
            if (typeof settings.emailSettings.orderGen !== "boolean") settings.emailSettings.orderGen = isEmailEnabled;
            if (typeof settings.emailSettings.gatePass !== "boolean") settings.emailSettings.gatePass = isEmailEnabled;
            if (typeof settings.emailSettings.paymentRel !== "boolean") settings.emailSettings.paymentRel = isEmailEnabled;
            if (typeof settings.emailSettings.clientNotify !== "boolean") settings.emailSettings.clientNotify = isEmailEnabled;

            if (!settings.waSettings) settings.waSettings = {};
            const isWaEnabled = dbConfig.whatsappEnabled;
            if (typeof settings.waSettings.orderGen !== "boolean") settings.waSettings.orderGen = isWaEnabled;
            if (typeof settings.waSettings.gatePass !== "boolean") settings.waSettings.gatePass = isWaEnabled;
            if (typeof settings.waSettings.paymentRel !== "boolean") settings.waSettings.paymentRel = isWaEnabled;
            if (typeof settings.waSettings.clientNotify !== "boolean") settings.waSettings.clientNotify = isWaEnabled;

            if (!settings.gatewaySettings) settings.gatewaySettings = {};
            settings.gatewaySettings.provider = dbConfig.whatsappProvider?.toLowerCase() || (settings.gatewaySettings.provider === "twilio" ? null : settings.gatewaySettings.provider) || "aisensy";
            let maskedKey = "";
            if (dbConfig.whatsappApiKey) {
              try {
                maskedKey = maskApiKey(decrypt(dbConfig.whatsappApiKey));
              } catch {
                maskedKey = maskApiKey(dbConfig.whatsappApiKey);
              }
            }
            settings.gatewaySettings.apiKey = maskedKey || settings.gatewaySettings.apiKey || "";
            settings.gatewaySettings.instanceId = dbConfig.whatsappEndpoint || settings.gatewaySettings.instanceId || "";
            settings.gatewaySettings.baseUrl = dbConfig.whatsappEndpoint || settings.gatewaySettings.baseUrl || "";
            settings.gatewaySettings.secretKey = settings.gatewaySettings.secretKey || "";
            settings.gatewaySettings.enabled = dbConfig.whatsappEnabled;
            settings.gatewaySettings.campaignName = dbConfig.whatsappCampaignName || settings.gatewaySettings.campaignName || "";
            settings.gatewaySettings.number = dbConfig.whatsappNumber || settings.gatewaySettings.number || "";
          }
        }

        return reply.status(200).send({
          success: true,
          message: "Settings loaded successfully.",
          data: settings,
        });
      } catch (error: any) {
        adminLogs.error("Read Settings failed", { error });
        return reply.status(500).send({
          success: false,
          message: "Server error while reading settings.",
        });
      }
    }
  );
}

export default readSettingsRoute;
