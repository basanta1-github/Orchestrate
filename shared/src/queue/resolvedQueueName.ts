export function resolveQueueName(jobType: string): string {
  switch (jobType) {
    case "image_resize":
    case "video_transcode":
    case "audio_transcode":
      return "media-jobs";

    case "etl_import":
    case "csv_parse":
      return "etl-jobs";

    case "model_inference":
    case "embedding_generate":
      return "ml-jobs";

    case "send_email":
    case "email_notification":
      return "email-jobs";

    case "report_generate":
    case "pdf_export":
      return "report-jobs";

    default:
      throw new Error(`Unknown jobType: ${jobType}`);
  }
}
