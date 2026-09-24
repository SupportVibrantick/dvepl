import { FastifyInstance, FastifyPluginOptions } from "fastify";

import createEmployeeRoute from "./create";
import readEmployeeRoutes from "./read";
import updateEmployeeRoutes from "./update";
import deleteEmployeeRoute from "./delete";
import syncEmployeeRoutes from "./sync";
import syncPortalStaffRoute from "./syncPortal"; // portal staff -> users sync

async function adminEmployeeRouteGroup(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  fastify.register(createEmployeeRoute, { prefix: "/create" });
  fastify.register(readEmployeeRoutes, { prefix: "/read" });
  fastify.register(updateEmployeeRoutes, { prefix: "/update" });
  fastify.register(deleteEmployeeRoute, { prefix: "/delete" });
  fastify.register(syncEmployeeRoutes, { prefix: "/sync" });
  fastify.register(syncPortalStaffRoute, { prefix: "/sync-portal" });
}

export default adminEmployeeRouteGroup;
