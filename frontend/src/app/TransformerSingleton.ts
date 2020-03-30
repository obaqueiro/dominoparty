import Konva from "konva";

export class TransformerSingleton {
  private static activeTransformer: Konva.Transformer;

  private constructor() { }

  static getInstance() {
    if (!TransformerSingleton.activeTransformer) {
      TransformerSingleton.activeTransformer = new Konva.Transformer;
    }
    return TransformerSingleton.activeTransformer;
  }

  static setInstance(newTransformer: Konva.Transformer) {
    TransformerSingleton.destroy();
    TransformerSingleton.activeTransformer = newTransformer;
  }

  static destroy() {
    if(TransformerSingleton.activeTransformer) {
      TransformerSingleton.activeTransformer.destroy();
      TransformerSingleton.activeTransformer = null;
    }
  }
}