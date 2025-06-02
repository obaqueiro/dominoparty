import Konva from "konva";

export class TransformerSingleton {
  private static instance: TransformerSingleton;
  private static _activeTransformer: Konva.Transformer | null = null;

  private constructor() { }

  static getInstance(): TransformerSingleton {
    if (!TransformerSingleton.instance) {
      TransformerSingleton.instance = new TransformerSingleton();
    }
    return TransformerSingleton.instance;
  }

  static get activeTransformer(): Konva.Transformer | null {
    return TransformerSingleton._activeTransformer;
  }

  static set activeTransformer(transformer: Konva.Transformer | null) {
    if (TransformerSingleton._activeTransformer) {
      const layer = TransformerSingleton._activeTransformer.getLayer();
      if (layer) {
        layer.draw();
      }
      TransformerSingleton._activeTransformer.destroy();
    }
    TransformerSingleton._activeTransformer = transformer;
  }
}