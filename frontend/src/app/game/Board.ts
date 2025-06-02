import { Tile } from './Tile';
import Konva from 'konva';

export class Board {
  width: number;
  height: number;
  stage: Konva.Stage;
  layers: Konva.Layer[];
  tiles: Tile[];
  dropArea: Konva.Circle;
  dragLayer: Konva.Layer;

  constructor(options: {
    width: number;
    height: number;
    stage: Konva.Stage;
    layers: Konva.Layer[];
    tiles?: Tile[];
    dropArea: Konva.Circle;
    dragLayer: Konva.Layer;
  }) {
    this.width = options.width;
    this.height = options.height;
    this.stage = options.stage;
    this.layers = options.layers;
    this.tiles = options.tiles || [];
    this.dropArea = options.dropArea;
    this.dragLayer = options.dragLayer;

    this.layers.forEach(layer => {
      this.stage.add(layer);
    });
    this.stage.add(this.dragLayer);
  }

  removeTile(tile: Tile) {
    this.tiles = this.tiles.filter(item => item !== tile);
  }

  addTile(tile: Tile) {
    this.tiles.push(tile);
    // Add tile to the last layer to ensure it's on top
    this.layers[this.layers.length - 1].add(tile);
  }

  draw() {
    this.layers.forEach(layer => layer.batchDraw());
  }

}