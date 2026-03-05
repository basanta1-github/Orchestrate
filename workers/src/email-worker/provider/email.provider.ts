export interface EmailPayload {
  recipient: string;
  subject: string;
  content: string;
  referenceId: string;
}

export interface ProviderResponse {
  providerMessageId: string;
}

export interface EmailProvider {
  send(payload: EmailPayload): Promise<ProviderResponse>;
}
