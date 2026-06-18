import axios from "axios";
import { Logger } from "@nestjs/common";

export class HunterService {
  private readonly logger = new Logger(HunterService.name);
  private readonly apiKey = process.env.HUNTER_API_KEY?.trim();

  async verify(email: string): Promise<boolean> {
    if (process.env.HUNTER_SKIP_VERIFY === "true") {
      return true;
    }
    if (!this.apiKey) {
      this.logger.error(
        "HUNTER_API_KEY is not set in this worker process — all emails will fail Hunter verification",
      );
      return false;
    }

    try {
      const response = await axios.get(
        "https://api.hunter.io/v2/email-verifier",
        {
          params: {
            email,
            api_key: this.apiKey,
          },
          timeout: 5000,
        },
      );
      const result = response.data?.data?.result;
      const deliverable = result === "deliverable";
      if (!deliverable) {
        this.logger.warn(
          `Hunter rejected ${email}: result=${result ?? "unknown"}`,
        );
      }
      return deliverable;
    } catch (error) {
      const message =
        axios.isAxiosError(error) && error.response
          ? `HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`
          : error instanceof Error
            ? error.message
            : String(error);
      this.logger.error(`Hunter verification failed for ${email}: ${message}`);
      return false;
    }
  }
}
