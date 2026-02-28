export class SummarizerEngine {
  static async run(text: string): Promise<string> {
    if (!text || text.length < 20)
      throw new Error("Input text is too short to summarize");
    // simple summarization logic
    const sentences = text.split(". ");
    return sentences.slice(0, Math.ceil(sentences.length / 2)).join(". ");
  }
}
