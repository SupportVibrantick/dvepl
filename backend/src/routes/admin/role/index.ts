import { FastifyInstance, FastifyPluginOptions } from "fastify";

import createRoleRoute from "./create";
import getAllRolesRoute from "./read";
import readRoleByIdRoute from "./readbyId";
import updateRoleRoute from "./update";
import deleteRoleRoute from "./delete";
import syncPortalRolesRoute from "./syncPortal";

async function adminRoleRouteGroup(
  fastify: FastifyInstance,
  options: FastifyPluginOptions,
) {
  fastify.register(createRoleRoute, {
    prefix: "/create",
  });

  fastify.register(getAllRolesRoute, {
    prefix: "/read",
  });
  fastify.register(readRoleByIdRoute, {
    prefix: "/read",
  });
  fastify.register(updateRoleRoute, {
    prefix: "/update",
  });
  fastify.register(deleteRoleRoute, {
    prefix: "/delete",
  });
  fastify.register(syncPortalRolesRoute, {
    prefix: "/sync-portal",
  });
}

export default adminRoleRouteGroup;
