import { FastifyInstance, FastifyPluginOptions } from "fastify";
import readAuditLogRoutes from "./read";
import writeAuditLogRoutes from "./write";

async function adminAuditLogRouteGroup(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  fastify.register(readAuditLogRoutes, { prefix: "/read" });
  fastify.register(writeAuditLogRoutes, { prefix: "/write" });
}

export default adminAuditLogRouteGroup;
