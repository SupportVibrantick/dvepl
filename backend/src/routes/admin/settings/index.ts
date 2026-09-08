import { FastifyInstance, FastifyPluginOptions } from "fastify";
import readSettingsRoute from "./read";
import updateSettingsRoute from "./update";
import testSmtpRoute from "./test-smtp";
import sendTestEmailRoute from "./send-test-email";
import sendPoEmailRoute from "./send-po-email";
import sendVendorFollowUpEmailRoute from "./send-vendor-follow-up-email";
import sendPoWhatsappRoute from "./send-po-whatsapp";
import testWhatsappRoute from "./test-whatsapp";
import backupRestoreRoutes from "./backup";

async function adminSettingsRouteGroup(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  fastify.register(readSettingsRoute, { prefix: "/read" });
  fastify.register(updateSettingsRoute, { prefix: "/update" });
  fastify.register(testSmtpRoute, { prefix: "/" });
  fastify.register(sendTestEmailRoute, { prefix: "/" });
  fastify.register(sendPoEmailRoute, { prefix: "/" });
  fastify.register(sendPoWhatsappRoute, { prefix: "/" });
  fastify.register(sendVendorFollowUpEmailRoute, { prefix: "/" });
  fastify.register(testWhatsappRoute, { prefix: "/" });
  fastify.register(backupRestoreRoutes, { prefix: "/" });
}

export default adminSettingsRouteGroup;
