import axios from "axios";

export class HunterService {
  private readonly apiKey = process.env.HUNTER_API_KEY;

  async verify(email: string): Promise<boolean> {
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
      return response.data?.data?.result === "deliverable";
    } catch (error) {
      console.error("Hunter verification failed", error);
      return false;
    }
  }
}
