import nodemailer from "nodemailer";
import { EmailProvider, EmailPayload } from "./email.provider";

export interface SendEmailResponse {
  success: boolean;
  providerMessageId?: string;
  errorMessage?: string;
}

export class STMPProvider implements EmailProvider {
  private transporter: nodemailer.Transporter | null = null;

  private getTransporter(): nodemailer.Transporter {
    const host = process.env.SMTP_HOST?.trim();
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();

    if (!host || !user || !pass) {
      throw new Error(
        `SMTP not configured (host=${host ? "set" : "missing"}, user=${user ? "set" : "missing"}, pass=${pass ? "set" : "missing"})`,
      );
    }

    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: false,
        requireTLS: true,
        auth: { user, pass },
      });
    }

    return this.transporter;
  }

  async send(payload: EmailPayload) {
    try {
      const info = await this.getTransporter().sendMail({
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
