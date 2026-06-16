/**
 * Maps API/dashboard jobType strings → BullMQ queue names.
 * Accepts both canonical task names and queue-style aliases (ml-jobs, etc.).
 */
const QUEUE_ALIASES: Record<string, string> = {
  "media-jobs": "media-jobs",
  "ml-jobs": "ml-jobs",
  "email-jobs": "email-jobs",
  "etl-jobs": "etl-jobs",
  "report-jobs": "report-jobs",
};

export function resolveQueueName(jobType: string): string {
  if (QUEUE_ALIASES[jobType]) {
    return QUEUE_ALIASES[jobType];
  }

  switch (jobType) {
    case "image_resize":
    case "video_transcode":
    case "audio_transcode":
      return "media-jobs";

    case "etl_import":
    case "csv_parse":
    case "etl-jobs":
      return "etl-jobs";

    case "model_inference":
    case "embedding_generate":
    case "text_summarization":
    case "classification":
    case "ocr":
    case "ml-jobs":
      return "ml-jobs";

    case "send_email":
    case "email_notification":
    case "email-jobs":
      return "email-jobs";

    case "report_generate":
    case "pdf_export":
    case "report-jobs":
      return "report-jobs";

    default:
      throw new Error(`Unknown jobType: ${jobType}`);
  }
}
