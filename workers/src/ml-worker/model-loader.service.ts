import Tesseract from "tesseract.js";
import natural from "natural";
import path from "path";

export class ModelLoader {
  private static classifier: natural.BayesClassifier | null = null;
  private static ocrWorker: Tesseract.Worker | null = null;
  static async getClassifier(): Promise<natural.BayesClassifier> {
    if (!this.classifier) {
      const classifier = new natural.BayesClassifier();
      classifier.addDocument("error failure crash", "negative");
      classifier.addDocument("success completed good", "positive");
      classifier.train();
      this.classifier = classifier;
    }
    return this.classifier;
  }
  static async getOCRWorker(): Promise<Tesseract.Worker> {
    if (!this.ocrWorker) {
      this.ocrWorker = await Tesseract.createWorker("eng");
    }
    return this.ocrWorker;
  }
}
