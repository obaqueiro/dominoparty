import { Board } from './Board';
import Konva from "konva";
import { TransformerSingleton } from './TransformerSingleton';
import { BaseLayer } from 'konva/types/BaseLayer';

export class Tile extends Konva.Group {
  localBoard: Board;
  publicBoard: Board;
  currentBoard: Board;
  previousLayer: BaseLayer;
  actionUpdate: Function;

  constructor(options: {
    letter: string,    
    localBoard: Board,
    publicBoard: Board,
    currentBoard: Board,
    actionUpdate: Function
  }) {
    super();
    let group = this;
    let letter = options.letter;    
    this.localBoard = options.localBoard;
    this.publicBoard = options.publicBoard;
    this.currentBoard = options.currentBoard;

    this.position({ x: 0, y: 0 });
    this.draggable(true);
    this.name(letter)
    this.actionUpdate = options.actionUpdate;
    group.add(this.generateTileSquare(0,0,letter));    

    group.add(new Konva.Rect({
      x: 0,
      y: 0,
      stroke: "black",
      fill: "#FAF0E6",
      width: 40,
      height: 40,
      visible: false,
      name: 'backFace'
    }));


    group.on('transformend', () => {
      if (this.parent.parent == this.publicBoard.stage) {
        this.actionUpdate({
          name: group.name(),
          action: 'move',
          x: group.x(),
          y: group.y(),
          rotation: group.rotation()
        });
      }
    });

    group.on('dragstart', () => {
      TransformerSingleton.destroy();
      group.moveToTop();
      let layer = group.getLayer();
      group.moveTo(group.currentBoard.dragLayer);
      layer.batchDraw();
      this.previousLayer = layer;
    });

    group.on('dragend', () => {
      let dropArea: Konva.Circle;
      // If it is in the local board, then we check for the local board drop area
      if (this.parent.parent == this.localBoard.stage) {
        dropArea = this.localBoard.dropArea;
      }
      else {
        dropArea = this.publicBoard.dropArea;
      }
      // otherwise check for the public droparea
      let dropXmin = dropArea.x() - dropArea.radius();
      let dropXmax = dropArea.x() + dropArea.radius();
      let dropYmin = dropArea.y() - dropArea.radius();
      let dropYmax = dropArea.y() + dropArea.radius();

      if (group.x() > dropXmin && group.x() < dropXmax &&
        group.y() > dropYmin && group.y() < dropYmax) {
        if (dropArea == this.publicBoard.dropArea) {
          this.moveToLocalBoard();
          this.actionUpdate({
            name: group.name(),
            action: 'destroy',
            x: group.x(),
            y: group.y(),
            rotation: group.rotation()
          });
        }
        else {
          this.moveToPublicBoard();
          this.actionUpdate({
            name: group.name(),
            action: 'create',
            x: group.x(),
            y: group.y(),
            rotation: group.rotation()
          });

        }
      } else {  // simply move around board
        let layer = group.getLayer();
        let {x,y} = this.getClientRect({});
        
        this.y(y < 0 ? this.y()+(-y) : this.y());
        this.x(x < 0 ?  this.x()+ (-x) : this.x());
        group.moveTo(this.previousLayer);
        layer.moveToTop();
        group.moveToTop();
        this.previousLayer.draw();
        layer.draw();
        console.log(this.position());
        
        // only send public board moves
        if (this.parent.parent == this.publicBoard.stage) {
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
    });
    group.on('hide', () => {
      let back = group.findOne('.backFace');
      back.visible(true);
    })
    group.on('show', () => {
      let back = group.findOne('.backFace');
      back.visible(false);
    });
    group.on('flip', () => {
      let back = group.findOne('.backFace');
      if (back.visible()) {
        back.visible(false);
      }
      else {
        back.visible(true);
      }
      if (this.parent.parent == this.publicBoard.stage) {
        this.actionUpdate({
          name: group.name(),
          action: 'move',
          x: group.x(),
          y: group.y(),
          rotation: group.rotation(),
          flipped: this.isFlipped()
        });
      }
      group.parent.draw();
    });



    group.on('dblclick dbltap', () => {
      group.fire('flip', null);
    });
    return group;
  }


  generateTileSquare(x:number, y:number , letter:string): Konva.Group {
    let left = 8;
    let right = 32;
    let mid = 20;



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
    // TODO: Add letter and number to tile
    let letterValues = {
      'A': 1, 'B':3, 'C': 3, 'CH': 5,
      'D':2, 'E': 1, 'F':4, 'G':2, 'H':4,
      'I':1, 'J':8, 'L':1,'LL':6, 'M':3, 'N':1,
      'Ñ':8, 'O':1, 'P':3, 'Q':5, 'R':1, 'RR':8,
      'S':1, 'T':1, 'U':1, 'V':4, 'X':8, 'Y':4, 'Z':10,
      ' ':0
    }
    let  l = new Konva.Text({
      x: 10 - (letter.length > 1 ? 5 : 0),
      y: 10 + (letter.length > 1 ? 2 : 0),
      text: letter,
      fontSize: (letter.length > 1 ? 16 : 20),
      fontFamily: 'Calibri',
      fill: 'brown'
    });    
    
    group.add(l);
    if (letterValues[letter] > 0) {
      let number = new Konva.Text({
        x: 10+ l.getWidth()  - (letter.length > 1 ? 5 : 0),
        y: 20 ,
        text: letterValues[letter],
        fontSize: 10,
        fontFamily: 'Calibri',
        fill: 'brown'
      });   
      group.add(number);
    }
    
    group.cache();
    return group;
  }


  moveToLocalBoard() {
    let tile = this;
    tile.rotation(0);
    tile.fire('show', null);
    let parentLayer = tile.parent;
    TransformerSingleton.destroy();

    this.publicBoard.removeTile(tile);
    this.localBoard.addTile(tile);
    tile.remove();
    parentLayer.draw();

    tile.position({ x: this.localBoard.tiles.length * 50, y: 0 });
    this.localBoard.layers[0].add(tile);
    this.localBoard.layers[0].draw();
    this.currentBoard = this.localBoard;
  }

  moveToPublicBoard() {
    let tile = this;
    let parentLayer = tile.parent;
    TransformerSingleton.destroy();

    this.localBoard.removeTile(tile)
    this.publicBoard.addTile(tile);
    tile.remove();
    parentLayer.draw();

    tile.position({ x: this.publicBoard.dropArea.x(), y: this.publicBoard.dropArea.y() });
    let layers = this.publicBoard.layers;
    // Get layer with fewer objects
    let layer = layers.sort(
      (a: Konva.Layer, b: Konva.Layer) => { return a.getChildren().length - b.getChildren().length })[0];
    layer.add(tile);
    layer.draw();
    this.currentBoard = this.publicBoard;
  }

  isFlipped() {
    return this.findOne('.backFace').visible();
  }
  flipped(isFlipped: boolean) {
    if (isFlipped) {
      this.fire('hide', null);
    }
    else (this.fire('show', null));
  }
}

