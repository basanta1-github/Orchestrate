import { ModelLoader } from "../model-loader.service";

export class ClassifierEngine {
  static async run(text: string): Promise<string> {
    const classifier = await ModelLoader.getClassifier();
    return classifier.classify(text);
  }
}
