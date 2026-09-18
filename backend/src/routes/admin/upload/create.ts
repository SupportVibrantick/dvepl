import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { createWriteStream, existsSync, mkdirSync } from "fs";
import { pipeline } from "stream/promises";
import path from "path";
import { adminLogs } from "../../../services/logger/contextLogger";

async function createUploadRoute(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  fastify.post(
    "/",
    {
      schema: {
        tags: ["Upload"],
        summary: "Upload File",
        description: "Uploads a single file and returns the file metadata and static URL.",
      },
      preHandler: [
        fastify.verifyToken,
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const fileData = await request.file();

        if (!fileData) {
          return reply.status(400).send({
            success: false,
            message: "No file uploaded.",
          });
        }

        const uploadsDir = path.join(__dirname, "../../../../uploads");

        // Ensure directory exists
        if (!existsSync(uploadsDir)) {
          mkdirSync(uploadsDir, { recursive: true });
        }

        const timestamp = Date.now();
        const sanitizeFilename = fileData.filename.replace(/[^a-zA-Z0-9.-]/g, "_");
        const uniqueFilename = `${timestamp}-${sanitizeFilename}`;
        const savePath = path.join(uploadsDir, uniqueFilename);

        // Stream file to path
        await pipeline(fileData.file, createWriteStream(savePath));

        const relativeUrl = `/uploads/${uniqueFilename}`;

        adminLogs.info("File uploaded successfully", {
          filename: uniqueFilename,
          url: relativeUrl,
        });

        await fastify.prisma.auditLog.create({
          data: {
            userId: (request as any).admin?.id ?? null,
            module: "Upload",
            recordId: fileData.filename,
            entityName: fileData.filename,
            action: "UPLOAD",
            details: `Uploaded file — ${fileData.filename}`,
            status: "SUCCESS",
            newValue: {
              fileName: fileData.filename,
              storedAs: uniqueFilename,
              url: relativeUrl,
              mimeType: fileData.mimetype,
            },
            ipAddress: request.ip,
            userAgent: request.headers["user-agent"],
          },
        }).catch((err) => adminLogs.error("Failed to log upload", { error: err }));

        return reply.status(201).send({
          success: true,
          message: "File uploaded successfully.",
          data: {
            fileName: fileData.filename,
            fileUrl: relativeUrl,
            mimeType: fileData.mimetype,
            // Fastify-multipart parses size as number of bytes transferred, if available
            // but request.file() stream doesn't easily expose file size directly without buffering,
            // so we can read it from the saved file.
          },
        });
      } catch (error: any) {
        adminLogs.error("File upload failed", { error });
        return reply.status(500).send({
          success: false,
          message: "Server Error during file upload.",
          details:
            process.env.NODE_ENV === "development" ? error.message : undefined,
        });
      }
    }
  );
}

export default createUploadRoute;
