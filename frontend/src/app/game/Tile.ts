import { Board } from './Board';
import Konva from "konva";
import { TransformerSingleton } from './TransformerSingleton';

interface DotSpec {
  color: string;
  coords: Array<{ x: number; y: number }>;
  size: number;
}

interface DotSpecs {
  [key: number]: DotSpec;
}

export class Tile extends Konva.Group {
  localBoard: Board;
  publicBoard: Board;
  currentBoard: Board;
  previousLayer: Konva.Layer | null = null;
  actionUpdate: (data: {
    flipped?: boolean;
    rotation?: number;
    x?: number;
    action?: string;
    y: number;
    name: string;
  }) => void;
  top: number;
  bottom: number;

  constructor(options: {
    top: number;
    bottom: number;
    localBoard: Board;
    publicBoard: Board;
    currentBoard: Board;
    actionUpdate: (data: {
      flipped?: boolean;
      rotation?: number;
      x?: number;
      action?: string;
      y: number;
      name: string;
    }) => void;
  }) {
    super();
    let group = this;
    this.top = options.top;
    this.bottom = options.bottom;
    this.localBoard = options.localBoard;
    this.publicBoard = options.publicBoard;
    this.currentBoard = options.currentBoard;
    this.actionUpdate = options.actionUpdate;

    this.position({ x: 0, y: 0 });
    this.draggable(true);
    this.name(`${this.top}x${this.bottom}`)

    group.add(this.generateTileSquare(0, 0, this.top));
    let bottomTile = this.generateTileSquare(0, 40, this.bottom);
    bottomTile.offset({ x: 40, y: 40 });
    bottomTile.rotation(180);
    group.add(bottomTile);

    group.add(new Konva.Rect({
      x: 0,
      y: 0,
      stroke: "black",
      fill: "#FAF0E6",
      width: 40,
      height: 80,
      visible: false,
      name: 'backFace'
    }));

    group.on('transformend', () => {
      const parent = this.parent;
      if (parent && parent.parent === this.publicBoard.stage) {
        this.actionUpdate({
          name: group.name(),
          action: 'move',
          x: group.x(),
          y: group.y(),
          rotation: group.rotation(),
          flipped: this.isFlipped()
        });
      }
    });

    group.on('dragstart', () => {
      TransformerSingleton.activeTransformer = null;
      group.moveToTop();
      const layer = group.getLayer();
      if (layer) {
        group.moveTo(group.currentBoard.dragLayer);
        layer.batchDraw();
        this.previousLayer = layer;
      }
    });

    group.on('dragend', () => {
      let dropArea: Konva.Circle;
      const parent = this.parent;
      // If it is in the local board, then we check for the local board drop area
      if (parent && parent.parent === this.localBoard.stage) {
        dropArea = this.localBoard.dropArea;
      } else {
        dropArea = this.publicBoard.dropArea;
      }

      let dropXmin = dropArea.x() - dropArea.radius();
      let dropXmax = dropArea.x() + dropArea.radius();
      let dropYmin = dropArea.y() - dropArea.radius();
      let dropYmax = dropArea.y() + dropArea.radius();

      if (group.x() > dropXmin && group.x() < dropXmax &&
        group.y() > dropYmin && group.y() < dropYmax) {
        if (dropArea === this.publicBoard.dropArea) {
          this.moveToLocalBoard();
          this.actionUpdate({
            name: group.name(),
            action: 'destroy',
            x: group.x(),
            y: group.y(),
            rotation: group.rotation(),
            flipped: this.isFlipped()
          });
        } else {
          this.moveToPublicBoard();
          this.actionUpdate({
            name: group.name(),
            action: 'create',
            x: group.x(),
            y: group.y(),
            rotation: group.rotation(),
            flipped: this.isFlipped()
          });
        }
      } else {  // simply move around board
        const layer = group.getLayer();
        if (layer) {
          let {x,y} = this.getClientRect({});
          
          this.y(y < 0 ? this.y()+(-y) : this.y());
          this.x(x < 0 ?  this.x()+ (-x) : this.x());
          group.moveTo(this.previousLayer);
          layer.moveToTop();
          group.moveToTop();
          if (this.previousLayer) {
            this.previousLayer.draw();
          }
          layer.draw();
          console.log(this.position());
          
          // only send public board moves
          if (parent && parent.parent === this.publicBoard.stage) {
            this.actionUpdate({
              name: group.name(),
              action: 'move',
              x: group.x(),
              y: group.y(),
              rotation: group.rotation(),
              flipped: this.isFlipped()
            });
          }
        }
      }
    });

    group.on('click tap', () => {
      const newTransformer = new Konva.Transformer({
        node: group as unknown as Konva.Rect,
        anchorSize: 5,
        borderDash: [3, 3],
        centeredScaling: true,
        rotationSnaps: [0, 90, 180, 270],
        resizeEnabled: false,
        anchorCornerRadiius: 1,
        anchorStrokeWidth: 3
      });
      TransformerSingleton.activeTransformer = newTransformer;
      const parentLayer = group.parent;
      if (parentLayer) {
        parentLayer.add(newTransformer);
        parentLayer.draw();
      }
    });

    group.on('dblclick dbltap', () => {
      const back = group.findOne('.backFace');
      if (back) {
        back.visible(!back.visible());
        const parent = this.parent;
        if (parent && parent.parent === this.publicBoard.stage) {
          this.actionUpdate({
            name: group.name(),
            action: 'move',
            x: group.x(),
            y: group.y(),
            rotation: group.rotation(),
            flipped: this.isFlipped()
          });
        }
        const parentLayer = group.parent;
        if (parentLayer) {
          parentLayer.draw();
        }
      }
    });
    return group;
  }

  generateTileSquare(x: number, y: number, n: number): Konva.Group {
    let left = 8;
    let right = 32;
    let mid = 20;

    let dotSpecs: DotSpecs = {
      0: { color: '', coords: [], size: 0 },
      1: { color: '#D06C31', coords: [{ x: 20, y: 20 }], size: 4 },
      2: { color: '#B95C81', coords: [{ x: left, y: left }, { x: right, y: right }], size: 4 },
      3: { color: '#47806C', coords: [{ x: left, y: left }, { x: right, y: right }, { x: mid, y: mid }], size: 4 },
      4: { color: '#8D4654', coords: [{ x: left, y: left }, { x: right, y: right }, { x: left, y: right }, { x: right, y: left }], size: 4 },
      5: {
        color: '#6A7982', coords: [{ x: left, y: left }, { x: right, y: right },
        { x: left, y: right }, { x: right, y: left }, { x: mid, y: mid }], size: 4
      },
      6: {
        color: '#3B485C', coords: [{ x: left, y: left }, { x: right, y: right },
        { x: left, y: right }, { x: right, y: left }, { x: left, y: mid }, { x: right, y: mid }], size: 4
      },

      7: {
        color: '#A3923A', coords: [{ x: left, y: left }, { x: right, y: right },
        { x: left, y: right }, { x: right, y: left }, { x: left, y: mid },
        { x: right, y: mid }, { x: mid, y: mid }], size: 4
      },
      8: {
        color: '#5A535B', coords: [{ x: left, y: left }, { x: right, y: right }, { x: left, y: right },
        { x: right, y: left }, { x: left, y: mid }, { x: right, y: mid },
        { x: mid, y: left }, { x: mid, y: right }], size: 4
      },
      9: {
        color: '#7B7B7B', coords: [{ x: left, y: left }, { x: right, y: right }, { x: left, y: right },
        { x: right, y: left }, { x: left, y: mid }, { x: right, y: mid },
        { x: mid, y: left }, { x: mid, y: right }, { x: mid, y: mid }], size: 4
      },
      10: {
        color: '#525252', coords: [{ x: 6, y: 6 }, { x: 6, y: 15 }, { x: 6, y: 24 }, { x: 6, y: 33 },
        { x: 34, y: 6 }, { x: 34, y: 15 }, { x: 34, y: 24 }, { x: 34, y: 33 },
        { x: 20, y: 6 }, { x: 20, y: 33 }], size: 3
      },
      11: {
        color: '#8C4C5B', coords: [{ x: 6, y: 6 }, { x: 6, y: 15 }, { x: 6, y: 24 }, { x: 6, y: 33 },
        { x: 34, y: 6 }, { x: 34, y: 15 }, { x: 34, y: 24 }, { x: 34, y: 33 },
        { x: 20, y: 6 }, { x: 20, y: 33 }, { x: 20, y: 20 }], size: 3
      },
      12: {
        color: '#BB6D88', coords: [{ x: 6, y: 6 }, { x: 6, y: 15 }, { x: 6, y: 24 }, { x: 6, y: 33 },
        { x: 34, y: 6 }, { x: 34, y: 15 }, { x: 34, y: 24 }, { x: 34, y: 33 },
        { x: 20, y: 6 }, { x: 20, y: 15 }, { x: 20, y: 24 }, { x: 20, y: 33 }], size: 3
      },
      13: {
        color: '#7B6064', coords: [{ x: 6, y: 6 }, { x: 15, y: 6 }, { x: 24, y: 6 }, { x: 33, y: 6 },
        { x: 6, y: 15 }, { x: 15, y: 15 }, { x: 24, y: 15 }, { x: 33, y: 15 },
        { x: 6, y: 24 }, { x: 15, y: 24 }, { x: 24, y: 24 }, { x: 33, y: 24 },
        { x: 20, y: 33 }], size: 3
      },
      14: {
        color: '#775862', coords: [{ x: 6, y: 6 }, { x: 15, y: 6 }, { x: 24, y: 6 }, { x: 33, y: 6 },
        { x: 6, y: 15 }, { x: 15, y: 15 }, { x: 24, y: 15 }, { x: 33, y: 15 },
        { x: 6, y: 24 }, { x: 15, y: 24 }, { x: 24, y: 24 }, { x: 33, y: 24 },
        { x: 10, y: 33 }, { x: 30, y: 33 }], size: 3
      },
      15: {
        color: '#5C617D', coords: [{ x: 6, y: 6 }, { x: 15, y: 6 }, { x: 24, y: 6 }, { x: 33, y: 6 },
        { x: 6, y: 15 }, { x: 15, y: 15 }, { x: 24, y: 15 }, { x: 33, y: 15 },
        { x: 6, y: 24 }, { x: 15, y: 24 }, { x: 24, y: 24 }, { x: 33, y: 24 },
        { x: 10, y: 33 }, { x: 30, y: 33 }, { x: 20, y: 33 }], size: 3
      },
    }

    let group = new Konva.Group({
      x: x,
      y: y
    });
    let box = new Konva.Rect({
      x: 0,
      y: 0,
      stroke: "black",
      fill: "#FAF0E6",
      width: 40,
      height: 40,
      hitStrokeWidth: 0,
      shadowForStrokeEnabled: false,
      perfectDrawEnabled: false,
    });

    group.add(box);
    for (let coord of dotSpecs[n].coords) {
      group.add(new Konva.Circle({
        x: coord.x, y: coord.y, radius: dotSpecs[n].size, fill: dotSpecs[n].color,
        hitStrokeWidth: 0, shadowForStrokeEnabled: false, perfectDrawEnabled: false, listening: false
      }));
    }
    group.cache();
    return group;
  }

  moveToLocalBoard() {
    let tile = this;
    tile.rotation(0);
    const back = tile.findOne('.backFace');
    if (back) {
      back.visible(false);
    }
    const parentLayer = tile.parent;
    TransformerSingleton.activeTransformer = null;

    this.publicBoard.removeTile(tile);
    this.localBoard.addTile(tile);
    tile.remove();
    if (parentLayer) {
      parentLayer.draw();
    }

    tile.position({ x: this.localBoard.tiles.length * 50, y: 0 });
    this.localBoard.layers[0].add(tile);
    this.localBoard.layers[0].draw();
    this.currentBoard = this.localBoard;
  }

  moveToPublicBoard() {
    let tile = this;
    const parentLayer = tile.parent;
    TransformerSingleton.activeTransformer = null;

    this.localBoard.removeTile(tile);
    this.publicBoard.addTile(tile);
    tile.remove();
    if (parentLayer) {
      parentLayer.draw();
    }

    tile.position({ x: this.publicBoard.dropArea.x(), y: this.publicBoard.dropArea.y() });
    let layers = this.publicBoard.layers;
    // Get layer with fewer objects
    let layer = layers.sort(
      (a: Konva.Layer, b: Konva.Layer) => { return a.getChildren().length - b.getChildren().length })[0];
    layer.add(tile);
    layer.draw();
    this.currentBoard = this.publicBoard;
  }

  isFlipped(): boolean {
    const backFace = this.findOne('.backFace');
    return backFace ? backFace.visible() : false;
  }

  flipped(isFlipped: boolean) {
    const back = this.findOne('.backFace');
    if (back) {
      back.visible(isFlipped);
      const parentLayer = this.parent;
      if (parentLayer) {
        parentLayer.draw();
      }
    }
  }
}

