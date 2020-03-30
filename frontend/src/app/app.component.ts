import { Component } from "@angular/core";
import Konva from "konva";
import { Group } from "konva/types/Group";
import { MessageService } from "./message.service";


@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.css"]
})
export class AppComponent {
  tiles: Group[] = [];
  center: Group;
  stage: Konva.Stage;
  layer0: Konva.Layer;
  layer1: Konva.Layer;
  layer2: Konva.Layer;
  layer3: Konva.Layer;
  layer4: Konva.Layer;
  activeTransformer: Konva.Transformer;
  dropArea: Konva.Circle;

  boardWidth = 1500;
  boardHeight = 1500;
  trainCount = 8;
  dotsCount = 15;

  messageSub;

  localBoard: {width:number, 
               height: number, 
               stage: Konva.Stage, 
               layer: Konva.Layer,
               tiles: Group[],
               dropArea: Konva.Circle};

  constructor(private messageService: MessageService) {
    this.messageSub = this.messageService.getMessage().subscribe(message => {
      this.processEvent(message);
    });
  }
  
  ngAfterViewInit() {
    let width = document.getElementById("mainBoard").offsetWidth;
    let height = window.innerHeight;

    console.log(width, height);
    // first we need to create a stage
    this.stage = new Konva.Stage({
      container: "mainBoard", // id of container <div>
      width: this.boardWidth,
      height: this.boardHeight
    });

    this.localBoard = {
      width: document.getElementById("localBoard").offsetWidth,
      height: document.getElementById("localBoard").offsetHeight,
      layer: new Konva.Layer(),
      stage: new Konva.Stage({
        container: 'localBoard',
        width: document.getElementById("localBoard").offsetWidth,
        height: document.getElementById("localBoard").offsetHeight,
      }),
      tiles:[],
      dropArea: null // created during localBoardSetup
    }
  }

  setupBoard(size: number) {
    console.log("Setting up board of ",size);
    this.stage.destroyChildren();
    this.tiles = [];

    // then create layer
    this.layer0 = new Konva.Layer();
    this.layer1 = new Konva.Layer();
    this.layer2 = new Konva.Layer();
    this.layer3 = new Konva.Layer();
    this.layer4 = new Konva.Layer();

    this.dotsCount = size;
    // the order of how elementes are added affects their ZIndex 
    // center goes first
    this.layer0.add(this.drawCenter());
    
    // then the trains
    for (let i = 0; i < this.trainCount; i++) {
      let train = this.getTrain();
      this.layer0.add(train);
      train.position({ x: 800 + 50 * i, y: 50 });
    }
    console.log('added center and trains');
    // then the tiles
    for (let i = 0; i <= this.dotsCount; i++) {
      for (let j = 0; j <= this.dotsCount; j++) {
        let tile = this.getTile(i, j);
        tile.setAbsolutePosition({ x: i * 45, y: j * 90 });
        this.tiles.push(tile);
      }
    }

    for (let i = 0; i < this.tiles.length; i++) {
      if (i%4 == 0) {
          this.layer1.add(this.tiles[i])
          continue;
      }
      if (i%3 == 0) {
        this.layer2.add(this.tiles[i])
        continue;
      }
      if (i%2 == 0) {
        this.layer3.add(this.tiles[i])
        continue;
      }
      this.layer4.add(this.tiles[i])
    }

    this.dropArea = new Konva.Circle({
      radius: 80,
      fill: 'grey',
      x: 900,
      y: 450,
      draggable: true
    })

    this.layer0.add(this.dropArea);
    // add the layer to the stage
    this.stage.add(this.layer0);
    this.stage.add(this.layer1);
    this.stage.add(this.layer2);
    this.stage.add(this.layer3);
    this.stage.add(this.layer4);

    // draw the image
    this.layer0.draw();
    this.layer1.draw();
    this.layer2.draw();
    this.layer3.draw();
    this.layer4.draw();
  }
  getTrain() {
    let group = new Konva.Group({ draggable: true });
    let train = new Konva.Text({
      text: '🚂',
      fontSize: 35,
    });


    group.add(train);
    group.cache();
    return group;
  }
  drawCenter(): Konva.Group {
    let octagon = new Konva.RegularPolygon({
      x: 0,
      y: 0,
      sides: 8,
      radius: 100,
      fill: "black",
      rotation: 22.5
    });
    let group = new Konva.Group({ x: 900, y: 250, draggable: true, name: 'center' });
    // let group = new Konva.Group({x:this.boardHeight/2, y:this.boardWidth/2, draggable: true, name:'center'});
    group.add(octagon);

    group.add(new Konva.Rect({
      x: -25,
      y: -40,
      fill: "white",
      width: 50,
      height: 90,
      visible: true,
      rotation: 0
    }));
    group.cache();
    return group;
  }

  getTile(top: number, bottom: number): Group {
    let group = new Konva.Group({
      x: 0,
      y: 0,
      draggable: true,
      name: `${top}x${bottom}`
    });

    group.add(this.generateTileSquare(0, 0, top));
    let bottomTile = this.generateTileSquare(0, 40, bottom);
    bottomTile.offset({x:40, y:40});
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

    group.on('dragend', () => {

      let dropArea: Konva.Circle ;
      // If it is in the local board, then we check for the local board drop area
      if (this.localBoard.tiles.find(item => item == group)) {
        dropArea = this.localBoard.dropArea;
      }
      else {
        dropArea = this.dropArea;
      }
      // otherwise check for the public droparea
      let dropXmin = dropArea.x() - dropArea.radius();
      let dropXmax = dropArea.x() + dropArea.radius();
      let dropYmin = dropArea.y() - dropArea.radius();
      let dropYmax = dropArea.y() + dropArea.radius();

      if (group.x() > dropXmin && group.x() < dropXmax &&
        group.y() > dropYmin && group.y() < dropYmax) {
          if (dropArea == this.dropArea) {
            this.moveTileToLocal(group);
          } 
          else {
            this.moveTileToPublic(group);
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
      this.drawBoard(group.parent as Konva.Layer);
    });

    group.on('click tap', () => {

      if (this.activeTransformer) {
        this.activeTransformer.destroy();
      }
      this.activeTransformer = new Konva.Transformer({
        node: group as unknown as Konva.Rect,
        anchorSize: 5,
        borderDash: [3, 3],
        centeredScaling: true,
        rotationSnaps: [0, 90, 180, 270],
        resizeEnabled: false,
        anchorCornerRadiius: 1,
        anchorStrokeWidth: 3
      });
      group.parent.add(this.activeTransformer);

      this.drawBoard();
    });

    group.on('dblclick dbltap', () => {
      group.fire('flip', null);
    });
    return group;
  }

  generateTileSquare(x: number, y: number, n: number): Group {

    let left = 8;
    let right = 32;
    let mid = 20;

    let dotSpecs = {
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
      height: 40
    });

    group.add(box);
    for (let coord of dotSpecs[n].coords) {
      group.add(new Konva.Circle({ x: coord.x, y: coord.y, radius: dotSpecs[n].size, fill: dotSpecs[n].color }));
    }
    group.cache();
    return group;
  }


  drawBoard(layer?:Konva.Layer) {

    if(layer) {
      layer.draw();
    }
    else {
      this.layer0.draw();
      this.layer1.draw();
      this.layer2.draw();
      this.layer3.draw();
      this.layer4.draw();
    }
    
  }
  shuffleBoard() {
    setTimeout(this.shuffleTile(0), 0);
  }

  shuffleTile(tileNo): TimerHandler {
    let tile = this.tiles[tileNo]
    if (!tile) {
      this.drawBoard();
      return;
    }
    tile.position({
      x: Math.floor(Math.random() * 300) + 100,
      y: Math.floor(Math.random() * 300) + 100
    });
    tile.rotation(Math.floor(Math.random() * 359));
    tile.fire('hide', null);

    setTimeout(this.shuffleTile(tileNo + 1), 100);
  }
  
  processEvent(message:string) {
    switch (message) {
      case 'shuffle':
        if (this.tiles.length > 0){
          this.shuffleBoard();
        }
        break;
      case 'setup9':
        this.setupBoard(9);
        this.setupLocalBoard();
        break;
      case 'setup12':
        this.setupBoard(12);
        this.setupLocalBoard();
        break;
      case 'setup15':
        this.setupBoard(15);
        this.setupLocalBoard();
        break;
    } 
  }

  setupLocalBoard() {
      this.localBoard.stage.destroyChildren();
      this.localBoard.stage.add(this.localBoard.layer);
      this.localBoard.tiles = [];
      let dropArea = new Konva.Circle({
        x: 400,
        y: 50,
        radius: 50,
        fill: 'green',
        draggable: true
      });

      this.localBoard.dropArea = dropArea;
      this.localBoard.layer.add(dropArea);
      this.localBoard.layer.draw();
  }

  moveTileToLocal(tile: Group) {    
    tile.rotation(0);
    tile.fire('show', null);
    let parentLayer = tile.parent;
    if (this.activeTransformer){
      this.activeTransformer.destroy();
    }

    this.tiles = this.tiles.filter(item => item !== tile);

    this.localBoard.tiles.push(tile);
    tile.remove();
    parentLayer.draw();
    
    tile.position({x:this.localBoard.tiles.length*50, y:0});
    this.localBoard.layer.add(tile);
    this.localBoard.layer.draw();
  }
  moveTileToPublic(tile: Group) {
    let parentLayer = tile.parent;
    if (this.activeTransformer){
      this.activeTransformer.destroy();
    }
    this.localBoard.tiles = this.localBoard.tiles.filter(item => item != tile);
    this.tiles.push(tile);
    tile.remove();
    parentLayer.draw();
    
    tile.position({x:this.dropArea.x(), y: this.dropArea.y()});
    let layers = [this.layer1, this.layer2, this.layer3, this.layer4];
    // Get layer with fewer objects
    let layer = layers.sort(
      (a:Konva.Layer,b: Konva.Layer) => { return a.getChildren().length - b.getChildren().length})[0];
    layer.add(tile);
    layer.draw();
  }

  onWindowResize(event){
    if (this.tiles.length == 0 ) {
      return;
    }
    console.log(event);
    let toAdd = event.oldHeight - event.newHeight;
    console.log(this.localBoard.stage.y());
    this.localBoard.stage.height(this.localBoard.stage.height()+toAdd); 
  }
}
