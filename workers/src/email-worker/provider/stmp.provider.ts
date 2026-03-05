import nodemailer from "nodemailer";
import { EmailProvider, EmailPayload } from "./email.provider";

export interface SendEmailResponse {
  success: boolean;
  providerMessageId?: string;
  errorMessage?: string;
}

export class STMPProvider implements EmailProvider {
  private transporter;
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async send(payload: EmailPayload) {
    try {
      // check smtp server connetction
      // await this.transporter.verify();
      const info = await this.transporter.sendMail({
        from: process.env.SMTP_USER,
        to: payload.recipient,
        subject: payload.subject,
        html: payload.content,

        headers: {
          "X-reference-Id": payload.referenceId,
        },
      });

      return {
        success: true,
        providerMessageId: info.messageId,
      };
    } catch (error) {
      return {
        success: false,
        providerMessageId: "",
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
