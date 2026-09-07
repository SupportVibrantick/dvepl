import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyEnv from "@fastify/env";
import fastifyJwt from "@fastify/jwt";
import formbody from "@fastify/formbody";
import path from "path";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";


//Logger
import { adminLogs as AdminLogger } from "./services/logger/contextLogger";
import { checkAndSendTaskReminders } from "./utils/taskScheduler";

//Route Groups
import adminRouteGroup from "./routes/admin/index";

//Plugins
import authPlugin from "./plugins/authPlugin";
import prismaPlugin from "./plugins/prismaPlugin";
import utilsPlugin from "./plugins/utilsPlugin";

async function buildApp() {
  const fastify = Fastify({
    routerOptions: {
      ignoreTrailingSlash: true,
    },
    logger: {
      level: "info",
      transport: {
        target: "pino-pretty",
        options: {
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      },
    },
  });

  // Plugins
  fastify.register(authPlugin);
  fastify.register(prismaPlugin);
  fastify.register(utilsPlugin);
  fastify.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50 MB
    },
  });
  fastify.register(fastifyStatic, {
    root: path.join(__dirname, "../uploads"),
    prefix: "/uploads/",
  });

  fastify.register(fastifyJwt, {
    secret: process.env.JWT_ACCESS_SECRET || "SecretKey",
  });

  // Register plugins
  fastify.register(cors, {
    origin: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
    credentials: true,
  });

  
  fastify.get("/", async () => {
    return {
      success: true,
      status: "healthy",
      message: "DVEPL Backend API is running",
      timestamp: new Date().toISOString(),
    };
  });

  fastify.addHook("onRequest", async (req, reply) => {
    if (req.url.startsWith("/")) {
      AdminLogger.info(`Api viewed from: ${req.ip}`);
    }
  });

  fastify.register(formbody);

  // ✅ Register environment variables
  const schema = {
    type: "object",
    required: ["PORT"],
    properties: {
      PORT: { type: "number", default: 8000 },
      NODE_ENV: { type: "string", default: "development" },
      APP_NAME: { type: "string", default: "FastifyApp" },
    },
  };

  await fastify.register(fastifyEnv, {
    dotenv: {
      path: path.join(__dirname, "../.env"),
      debug: true,
    },
    schema,
  });

  // Register routes
  fastify.register(adminRouteGroup, { prefix: "/admin" });

  // ✅ Wait until Fastify is fully ready (plugins loaded)
  await fastify.ready();

  // Start background task reminder scheduler
  try {
    void checkAndSendTaskReminders(fastify.prisma);
    setInterval(() => {
      void checkAndSendTaskReminders(fastify.prisma);
    }, 60 * 60 * 1000);
  } catch (error: any) {
    fastify.log.error(error, "Failed to start task reminder scheduler:");
  }

  return fastify;
}

export default buildApp;
