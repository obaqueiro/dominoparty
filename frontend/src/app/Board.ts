import { Tile } from './Tile';
import  Konva  from 'konva';

export class Board {
  width:number;
  height: number;
  stage: Konva.Stage;
  layers: Konva.Layer[];
  tiles: Tile[];
  dropArea: Konva.Circle;
  
  constructor(options:{
    width: number,
    height: number,
    stage: Konva.Stage,
    layers: Konva.Layer[],
    tiles?: Tile[],
    dropArea?: Konva.Circle
  }) {
    this.width = options.width;
    this.height = options.height;
    this.stage = options.stage;
    this.layers = options.layers;
    this.tiles = options.tiles || []
    this.dropArea = options.dropArea;
  }

  removeTile(tile: Tile) {
    this.tiles =  this.tiles.filter(item => item !== tile);
  }

  addTile(tile: Tile) {
    this.tiles.push(tile);
  }

  draw() {
    this.layers.forEach(layer => layer.batchDraw());
  }

}