export type MLTaskType = "text_summarization" | "ocr" | "classification";

export interface MLJobPayload {
  taskType: MLTaskType;
  input: string; // This can be text, image URL, etc. depending on the task
  options?: Record<string, any>; // Additional options for the task
}
