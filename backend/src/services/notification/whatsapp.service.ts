import { PrismaClient } from "@prisma/client";
import { decrypt, maskApiKey } from "../../utils/encryption";
import { adminLogs } from "../logger/contextLogger";

const prisma = new PrismaClient();

const AISENSY_API_BASE = "https://backend.aisensy.com";
const AISENSY_SEND_ENDPOINT = "/campaign/t1/api/v2";
const REQUEST_TIMEOUT_MS = 15000;

export interface SendWhatsAppOptions {
  to: string;
  userName: string;
  campaignName: string;
  templateParams?: string[];
  source?: string;
  media?: {
    url: string;
    filename: string;
  };
}

export class WhatsappService {
  static async getConfiguration(companyId?: string) {
    const config = await prisma.notificationConfiguration.findFirst({
      where: companyId ? { companyId } : {},
    });

    if (!config) {
      throw new Error("Notification configuration not found.");
    }

    if (!config.whatsappEnabled) {
      throw new Error("WhatsApp notifications are disabled.");
    }

    if (config.whatsappProvider !== "AISENSY") {
      throw new Error("WhatsApp provider is not configured as AiSensy.");
    }

    if (!config.whatsappApiKey) {
      throw new Error("AiSensy API key is not configured.");
    }

    return config;
  }

  public static decryptApiKey(encryptedKey: string): string {
    try {
      return decrypt(encryptedKey);
    } catch {
      adminLogs.warn("Failed to decrypt API key, treating as plaintext");
      return encryptedKey;
    }
  }

  static async send(
    options: SendWhatsAppOptions,
    companyId?: string,
    eventCode?: string,
    relatedModule?: string,
    relatedRecordId?: string
  ) {
    const config = await this.getConfiguration(companyId);

    const apiKey = this.decryptApiKey(config.whatsappApiKey!);
    const campaignName = (options.campaignName || config.whatsappCampaignName || "").trim();

    let status: "SENT" | "FAILED" = "SENT";
    let errorMsg: string | null = null;

    // Clean and normalize phone number with international country code
    let cleanDigits = options.to.replace(/[^\d]/g, "");
    let destination = options.to.trim();
    if (cleanDigits.length === 10) {
      destination = `+91${cleanDigits}`;
    } else if (!destination.startsWith("+")) {
      destination = `+${cleanDigits}`;
    }

    const payload: any = {
      apiKey: apiKey.trim(),
      campaignName,
      destination,
      userName: options.userName,
      source: options.source || "DVEPL_CRM",
      ...(options.templateParams && options.templateParams.length > 0
        ? { templateParams: options.templateParams }
        : {}),
      ...(options.media?.url
        ? { media: { url: options.media.url, filename: options.media.filename } }
        : {}),
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      let response = await fetch(
        `${AISENSY_API_BASE}${AISENSY_SEND_ENDPOINT}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        }
      );

      clearTimeout(timeout);

      // If campaign is stopped / not live or params mismatched, fall back to active default campaign
      if (!response.ok) {
        const errorBody = await response.text();
        adminLogs.warn("AiSensy primary dispatch error, evaluating fallback", {
          status: response.status,
          errorBody,
          campaignName,
        });

        // 1. If template params mismatched, attempt with progressive params
        if (
          response.status === 400 &&
          (errorBody.includes("Template params") || errorBody.includes("templateParams"))
        ) {
          const fallbackParamsList = [
            [options.userName || "Customer"],
            [],
          ];

          let succeeded = false;
          for (const fallbackParams of fallbackParamsList) {
            const retryController = new AbortController();
            const retryTimeout = setTimeout(() => retryController.abort(), REQUEST_TIMEOUT_MS);
            const retryResp = await fetch(
              `${AISENSY_API_BASE}${AISENSY_SEND_ENDPOINT}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...payload,
                  templateParams: fallbackParams,
                }),
                signal: retryController.signal,
              }
            );
            clearTimeout(retryTimeout);
            if (retryResp.ok) {
              succeeded = true;
              break;
            }
          }

          if (!succeeded) {
            // Fall back to default campaign
            if (config.whatsappCampaignName && campaignName !== config.whatsappCampaignName) {
              const defController = new AbortController();
              const defTimeout = setTimeout(() => defController.abort(), REQUEST_TIMEOUT_MS);
              const defResp = await fetch(
                `${AISENSY_API_BASE}${AISENSY_SEND_ENDPOINT}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    apiKey: apiKey.trim(),
                    campaignName: config.whatsappCampaignName.trim(),
                    destination,
                    userName: options.userName,
                    source: "DVEPL_FALLBACK",
                    templateParams: [options.userName || "Partner"],
                  }),
                  signal: defController.signal,
                }
              );
              clearTimeout(defTimeout);
              if (defResp.ok) {
                succeeded = true;
              }
            }
          }

          if (!succeeded) {
            throw new Error(`AiSensy API returned ${response.status}: ${errorBody}`);
          }
        }
        // 2. If campaign is STOPPED / Not Live or does not exist, fall back to default live campaign
        else if (
          (response.status === 406 || response.status === 400) &&
          (errorBody.includes("Not Live") || errorBody.includes("does not exist") || errorBody.includes("STOPPED"))
        ) {
          const fallbackCampaign = (config.whatsappCampaignName || "dvepl_reply_1").trim();
          if (fallbackCampaign && campaignName !== fallbackCampaign) {
            adminLogs.info(`Campaign '${campaignName}' is inactive. Falling back to default '${fallbackCampaign}'`);
            const fbController = new AbortController();
            const fbTimeout = setTimeout(() => fbController.abort(), REQUEST_TIMEOUT_MS);
            const fbResp = await fetch(
              `${AISENSY_API_BASE}${AISENSY_SEND_ENDPOINT}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  apiKey: apiKey.trim(),
                  campaignName: fallbackCampaign,
                  destination,
                  userName: options.userName,
                  source: "DVEPL_CAMPAIGN_FALLBACK",
                  templateParams: [options.userName || "Partner"],
                }),
                signal: fbController.signal,
              }
            );
            clearTimeout(fbTimeout);
            if (!fbResp.ok) {
              const fbErr = await fbResp.text();
              throw new Error(`AiSensy fallback failed: ${fbErr}`);
            }
          } else {
            throw new Error(`AiSensy API returned ${response.status}: ${errorBody}`);
          }
        } else {
          throw new Error(`AiSensy API returned ${response.status}: ${errorBody}`);
        }
      }

      adminLogs.info("WhatsApp message sent via AiSensy", {
        destination,
        campaignName,
        companyId,
      });
    } catch (e: any) {
      status = "FAILED";
      errorMsg = e.message || String(e);
      adminLogs.error("WhatsApp message send failed", {
        error: errorMsg,
        destination: options.to,
        companyId,
      });
      throw e;
    } finally {
      try {
        await prisma.notificationLog.create({
          data: {
            eventCode: eventCode || "WHATSAPP_MESSAGE",
            channel: "WHATSAPP",
            recipient: options.to,
            subject: campaignName,
            message: options.templateParams?.join(", ") || "",
            status,
            error: errorMsg,
            relatedModule: relatedModule || null,
            relatedRecordId: relatedRecordId || null,
          },
        });
      } catch (dbError) {
        adminLogs.error("Failed to write to notificationLog", { error: dbError });
      }
    }

    return { status, campaignName };
  }

  static async verify(companyId?: string) {
    const config = await this.getConfiguration(companyId);
    const apiKey = this.decryptApiKey(config.whatsappApiKey!);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(
        `${AISENSY_API_BASE}${AISENSY_SEND_ENDPOINT}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey,
            campaignName: (config.whatsappCampaignName || "test").trim(),
            destination: (config.whatsappNumber || "+910000000000").trim(),
            userName: "DVEPL Test",
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeout);

      if (!response.ok) {
        const body = await response.text();
        if (
          response.status === 400 &&
          (body.includes("Campaign does not exist") ||
            body.includes("Template params") ||
            body.includes("templateParams") ||
            body.includes("invalid destination"))
        ) {
          return {
            success: true,
            message: "AiSensy API key authenticated successfully!",
          };
        }
        throw new Error(
          `AiSensy API returned ${response.status}: ${body}`
        );
      }

      return { success: true, message: "AiSensy connection verified successfully." };
    } catch (e: any) {
      throw new Error(
        e.name === "AbortError"
          ? "AiSensy API request timed out."
          : e.message || "Failed to verify AiSensy connection."
      );
    }
  }

  static async verifyWithCredentials(params: {
    apiKey: string;
    campaignName?: string;
    number?: string;
  }) {
    const { apiKey, campaignName, number } = params;
    // If number is provided, use it; otherwise fallback to default
    const destination = (number || "").trim() || "+910000000000";
    const campaign = (campaignName || "test").trim();

    // First attempt to send with standard template parameters so the message actually delivers
    const attempts = [
      ["Test User"],
      ["Test User", "DVEPL Notification"],
      ["Test User", "DVEPL Notification", "Testing"],
      [],
    ];

    for (let i = 0; i < attempts.length; i++) {
      const templateParams = attempts[i];
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(
          `${AISENSY_API_BASE}${AISENSY_SEND_ENDPOINT}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              apiKey: (apiKey || "").trim(),
              campaignName: campaign,
              destination,
              userName: "DVEPL Admin",
              templateParams,
            }),
            signal: controller.signal,
          }
        );

        clearTimeout(timeout);

        if (response.ok) {
          return {
            success: true,
            message: destination && destination !== "+910000000000"
              ? `Test WhatsApp message sent successfully to ${destination}!`
              : "AiSensy connection verified and message sent successfully.",
          };
        }

        const body = await response.text();

        // If template params mismatch, retry next template params configuration
        if (body.includes("Template params") || body.includes("templateParams")) {
          if (i < attempts.length - 1) {
            continue;
          }
          return {
            success: true,
            message: `AiSensy API key authenticated! (Campaign "${campaign}" found and API key is valid)`,
          };
        }

        if (
          response.status === 400 &&
          (body.includes("Campaign does not exist") ||
            body.includes("invalid destination"))
        ) {
          let extraNote = "";
          if (body.includes("Campaign does not exist") && campaignName) {
            extraNote = ` (Note: Campaign "${campaignName}" does not exist in AiSensy)`;
          }

          return {
            success: true,
            message: `AiSensy API key authenticated successfully!${extraNote}`,
          };
        }

        throw new Error(`AiSensy API returned ${response.status}: ${body}`);
      } catch (e: any) {
        if (i === attempts.length - 1) {
          throw new Error(
            e.name === "AbortError"
              ? "AiSensy API request timed out."
              : e.message || "Failed to verify AiSensy connection."
          );
        }
      }
    }

    return { success: true, message: "AiSensy connection verified." };
  }
}

export default WhatsappService;
