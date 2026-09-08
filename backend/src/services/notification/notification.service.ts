import EmailService from "./email.service";
import { WhatsappService } from "./whatsapp.service";

export interface SalesOrderAssignmentNotificationOptions {
  to: string;
  userName: string;
  dveplCode: string;
  partyName?: string | null;
  stageName?: string | null;
  remarks?: string | null;
  dueDate?: string | null;
  orderId?: string | null;
}

export class NotificationService {
  /**
   * Send email notification when a Sales Order is assigned to a user.
   */
  static async sendSalesOrderAssignmentNotification(
    options: SalesOrderAssignmentNotificationOptions,
    companyId?: string,
  ) {
    const { to, userName, dveplCode, partyName, stageName, remarks, dueDate } = options;

    const subject = stageName
      ? `Job Responsibility Assigned: [${dveplCode}] ${stageName}`
      : `Sales Order ${dveplCode} Assigned to You`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Job Responsibility Assigned</title>
        </head>

        <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: Arial, Helvetica, sans-serif;">
          <div style="max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">

            <div style="padding: 24px; background: #0f172a; color: #ffffff;">
              <h2 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.025em;">
                New Job Responsibility Assigned
              </h2>
              <p style="margin: 4px 0 0; font-size: 13px; color: #94a3b8;">
                Order Reference: <strong>${dveplCode}</strong>
              </p>
            </div>

            <div style="padding: 32px 24px;">
              <p style="margin: 0 0 16px; font-size: 15px; color: #1e293b;">
                Hello <strong>${userName}</strong>,
              </p>

              <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #475569;">
                You have been assigned a new job responsibility and task in the DVEPL ERP portal.
              </p>

              <div style="padding: 20px; margin-bottom: 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 140px;">SALES ORDER:</td>
                    <td style="padding: 6px 0; color: #0f172a; font-weight: 700; font-family: monospace;">${dveplCode}</td>
                  </tr>
                  ${partyName ? `
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-weight: 600;">CUSTOMER / FIRM:</td>
                    <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${partyName}</td>
                  </tr>` : ""}
                  ${stageName ? `
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-weight: 600;">ASSIGNED STAGE:</td>
                    <td style="padding: 6px 0; color: #0284c7; font-weight: 700;">${stageName}</td>
                  </tr>` : ""}
                  ${dueDate ? `
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-weight: 600;">TARGET DUE DATE:</td>
                    <td style="padding: 6px 0; color: #dc2626; font-weight: 600;">${dueDate}</td>
                  </tr>` : ""}
                  ${remarks ? `
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-weight: 600; vertical-align: top;">INSTRUCTIONS:</td>
                    <td style="padding: 6px 0; color: #334155; font-style: italic;">${remarks}</td>
                  </tr>` : ""}
                </table>
              </div>

              <div style="padding: 14px 16px; margin-bottom: 24px; background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 4px;">
                <p style="margin: 0; font-size: 13px; color: #1e40af; line-height: 1.5;">
                  📌 <strong>Portal Task Created:</strong> This assignment has been automatically registered as an active task in your ERP Task Management dashboard.
                </p>
              </div>

              <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #475569;">
                Please log into the DVEPL ERP portal to review the order, track progress, and complete your assigned workflow stage.
              </p>
            </div>

            <div style="padding: 20px 24px; border-top: 1px solid #e2e8f0; background: #f8fafc;">
              <p style="margin: 0; font-size: 12px; color: #64748b;">
                This is an automated notification from DVEPL ERP.
              </p>

              <p style="margin: 6px 0 0; font-size: 12px; color: #64748b;">
                Regards,<br />
                <strong>DVEPL Operations Team</strong>
              </p>
            </div>

          </div>
        </body>
      </html>
    `;

    return EmailService.send({
      to,
      subject,
      html,
    }, companyId, "SALES_ORDER_ASSIGNED", "sales_order", options.orderId || undefined);
  }

  /**
   * Send a generic custom notification (for POs, Drawings, Tasks, etc.).
   */
  static async sendCustomNotification(
    options: {
      to: string;
      subject: string;
      message: string;
      eventCode?: string;
      relatedModule?: string;
      relatedRecordId?: string;
    },
    companyId?: string,
  ) {
    const { to, subject, message, eventCode, relatedModule, relatedRecordId } = options;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>${subject}</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: Arial, Helvetica, sans-serif;">
          <div style="max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb;">
            <div style="padding: 24px; background: #1f2937; color: #ffffff;">
              <h2 style="margin: 0; font-size: 20px;">${subject}</h2>
            </div>
            <div style="padding: 32px 24px;">
              <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #4b5563;">
                ${message}
              </p>
            </div>
            <div style="padding: 20px 24px; border-top: 1px solid #e5e7eb; background: #f9fafb;">
              <p style="margin: 0; font-size: 12px; color: #6b7280;">
                This is an automated notification from DVEPL ERP.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    return EmailService.send({
      to,
      subject,
      html,
    }, companyId, eventCode, relatedModule, relatedRecordId);
  }

  /**
   * Send a WhatsApp notification via AiSensy.
   */
  static async sendWhatsAppNotification(
    options: {
      to: string;
      userName: string;
      campaignName?: string;
      templateParams?: string[];
      media?: {
        url: string;
        filename: string;
      };
      eventCode?: string;
      relatedModule?: string;
      relatedRecordId?: string;
    },
    companyId?: string,
  ) {
    const { to, userName, campaignName, templateParams, media, eventCode, relatedModule, relatedRecordId } = options;

    return WhatsappService.send(
      {
        to,
        userName,
        campaignName: campaignName || "",
        templateParams,
        media,
        source: "DVEPL_CRM",
      },
      companyId,
      eventCode,
      relatedModule,
      relatedRecordId
    );
  }
}

export default NotificationService;