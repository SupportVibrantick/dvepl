import nodemailer from "nodemailer";
import { prisma } from "../../lib/prisma";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export class EmailService {
  static async getConfiguration(companyId?: string) {
    const config = await prisma.notificationConfiguration.findFirst({
      where: companyId ? { companyId } : {},
    });

    if (!config) {
      throw new Error("Notification configuration not found.");
    }

    if (!config.emailEnabled) {
      throw new Error("Email notifications are disabled.");
    }

    if (
      !config.smtpHost ||
      !config.smtpPort ||
      !config.smtpUsername ||
      !config.smtpPassword ||
      !config.smtpFromEmail
    ) {
      throw new Error("SMTP configuration is incomplete.");
    }

    return config;
  }

  static async createTransporter(companyId?: string) {
    const config = await this.getConfiguration(companyId);

    return nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: {
        user: config.smtpUsername,
        pass: config.smtpPassword,
      },
    });
  }

  static async send(
    options: SendEmailOptions,
    companyId?: string,
    eventCode?: string,
    relatedModule?: string,
    relatedRecordId?: string
  ) {
    const config = await this.getConfiguration(companyId);

    const transporter = await this.createTransporter(companyId);

    let info: any = null;
    let status: 'SENT' | 'FAILED' = 'SENT';
    let errorMsg: string | null = null;

    try {
      const fromEmail = this.resolveFromEmail(config);
      info = await transporter.sendMail({
        from: `"${config.smtpFromName || "DVEPL"}" <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
    } catch (e: any) {
      status = 'FAILED';
      errorMsg = e.message || String(e);
      throw e;
    } finally {
      try {
        await prisma.notificationLog.create({
          data: {
            eventCode: eventCode || "TEST_EMAIL",
            channel: "EMAIL",
            recipient: options.to,
            subject: options.subject,
            message: options.html.replace(/<[^>]*>/g, '').trim(),
            status: status,
            error: errorMsg,
            relatedModule: relatedModule || null,
            relatedRecordId: relatedRecordId || null,
          }
        });
      } catch (dbError) {
        console.error("Failed to write to notificationLog:", dbError);
      }
    }

    return info;
  }

  static async verify(companyId?: string) {
    const transporter = await this.createTransporter(companyId);

    await transporter.verify();

    return true;
  }

  private static resolveFromEmail(config: {
    smtpFromEmail?: string | null;
    smtpUsername?: string | null;
    smtpHost?: string | null;
  }): string {
    const fromDomain = config.smtpFromEmail?.split("@")[1]?.toLowerCase();
    const userDomain = config.smtpUsername?.split("@")[1]?.toLowerCase();
    const hostDomain = config.smtpHost?.toLowerCase()
      .replace(/^smtp\./, "")
      .replace(/^mail\./, "");

    if (fromDomain && userDomain && fromDomain !== userDomain && userDomain === hostDomain) {
      return config.smtpUsername!;
    }

    return config.smtpFromEmail || config.smtpUsername || "noreply@dvepl.com";
  }
}

export default EmailService;