import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { adminLogs } from "../../../services/logger/contextLogger";
import { WhatsappService } from "../../../services/notification/whatsapp.service";

async function testWhatsappRoute(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  fastify.post(
    "/test-whatsapp",
    {
      schema: {
        tags: ["Settings"],
        summary: "Test WhatsApp Connection",
        description: "Tests the WhatsApp gateway API connection with AiSensy.",
      },
      preHandler: [
        fastify.verifyToken
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { provider, apiKey, campaignName, number } = request.body as any;

        if (!provider) {
          return reply.status(400).send({
            success: false,
            message: "Provider is required.",
          });
        }

        if (provider.toUpperCase() !== "AISENSY") {
          return reply.status(400).send({
            success: false,
            message: "Only AiSensy provider is supported for WhatsApp testing.",
          });
        }

        let effectiveApiKey = apiKey;
        const isMaskedKey = !effectiveApiKey || effectiveApiKey.includes("****");

        if (isMaskedKey) {
          const companyId = request.user?.companyId;
          const config = await fastify.prisma.notificationConfiguration.findFirst({
            where: companyId ? { companyId } : {},
          });

          if (!config?.whatsappApiKey) {
            return reply.status(400).send({
              success: false,
              message: "AiSensy API key is required. Please enter a valid API key.",
            });
          }

          effectiveApiKey = WhatsappService["decryptApiKey"](config.whatsappApiKey);
        }

        const result = await WhatsappService.verifyWithCredentials({
          apiKey: effectiveApiKey,
          campaignName,
          number,
        });

        return reply.status(200).send({
          success: true,
          message: result.message,
        });
      } catch (error: any) {
        adminLogs.error("WhatsApp Gateway connection failed", {
          error: error.message,
        });

        const rawMessage = error.message || "";
        const isUnauthorized = rawMessage.includes("401") || rawMessage.toLowerCase().includes("unauthorized");
        const statusCode = isUnauthorized ? 400 : 500;
        const userMessage = isUnauthorized
          ? "Invalid AiSensy API Key. Please verify your API key in AiSensy dashboard."
          : (rawMessage || "Failed to connect to WhatsApp Gateway.");

        return reply.status(statusCode).send({
          success: false,
          message: userMessage,
        });
      }
    }
  );
}

export default testWhatsappRoute;
