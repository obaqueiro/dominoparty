import { Board } from './Board';
import { Tile } from './Tile';
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
  center: Group;

  boardWidth = 1500;
  boardHeight = 1500;
  trainCount = 8;
  dotsCount = 15;
  messageSub;

  publicBoard : Board;
  localBoard: Board;

  constructor(private messageService: MessageService) {
    this.messageSub = this.messageService.getMessage().subscribe(message => {
      this.processEvent(message);
    });
  }
  
  ngAfterViewInit() {
    this.publicBoard = new Board({
      width: this.boardWidth,
      height: this.boardHeight,
      stage: new Konva.Stage({
        container: "mainBoard", // id of container <div>
        width: this.boardWidth,
        height: this.boardHeight
      }),
      layers: [new Konva.Layer(),new Konva.Layer(),  new Konva.Layer(),
                new Konva.Layer(), new Konva.Layer()],
      dragLayer: new Konva.Layer()
    });

    this.localBoard = new Board({
        width: document.getElementById("localBoard").offsetWidth, 
        height: document.getElementById("localBoard").offsetHeight,
        layers: [new Konva.Layer()],
        stage: new Konva.Stage({
          container: 'localBoard',
          width: document.getElementById("localBoard").offsetWidth,
          height: document.getElementById("localBoard").offsetHeight,
        }),
        tiles: [],
        dragLayer: new Konva.Layer(),
        dropArea: null // created during localBoardSetup
       });
    }


  setupLocalBoard() {
    this.localBoard.stage.destroyChildren();
    this.localBoard.layers = [new Konva.Layer()];
    this.localBoard.dragLayer =  new Konva.Layer();

    // The order of adding is important so that the tiles show in front of the dropArea when dragging
    this.localBoard.stage.add(this.localBoard.layers[0]);
    this.localBoard.stage.add(this.localBoard.dragLayer);

    this.localBoard.tiles = [];

    let dropArea = new Konva.Circle({
      x: 400,
      y: 50,
      radius: 50,
      fill: 'green',
      draggable: true,
    });

    this.localBoard.dropArea = dropArea;
    this.localBoard.layers[0].add(dropArea);
    dropArea.moveToBottom();
    this.localBoard.layers[0].draw();
  }

  setupPublicBoard(size: number) {
    this.publicBoard.stage.destroyChildren();
    this.publicBoard.tiles = [];
    this.publicBoard.layers = [new Konva.Layer(),new Konva.Layer(),new Konva.Layer(),new Konva.Layer(),new Konva.Layer()]

    this.publicBoard.layers.forEach(layer => {
      this.publicBoard.stage.add(layer);
    });

    this.publicBoard.dragLayer = new Konva.Layer();
    this.publicBoard.stage.add(this.publicBoard.dragLayer);
    this.dotsCount = size;
    // the order of how elementes are added affects their ZIndex 
    // center goes first
    this.publicBoard.layers[0].add(this.drawCenter());
    
    // then the trains
    for (let i = 0; i < this.trainCount; i++) {
      let train = this.getTrain();
      this.publicBoard.layers[0].add(train);
      train.position({ x: 800 + 50 * i, y: 50 });
    }
    // then the tiles
    for (let i = 0; i <= this.dotsCount; i++) {
      for (let j = 0; j <= this.dotsCount; j++) {
        let tile = new Tile({top: i, bottom: j,
             localBoard: this.localBoard, 
             publicBoard: this.publicBoard,
             currentBoard: this.publicBoard
            });
        tile.setAbsolutePosition({ x: i * 45, y: j * 90 });
        this.publicBoard.addTile(tile);
      }
    }

    this.publicBoard.tiles.forEach((tile,index) => {
      this.publicBoard.layers[index % this.publicBoard.layers.length].add(tile);
    })

    this.publicBoard.dropArea = new Konva.Circle({
      radius: 80,
      fill: 'grey',
      x: 900,
      y: 450,
      draggable: true
    });

    this.publicBoard.layers[0].add(this.publicBoard.dropArea);

    this.publicBoard.layers.forEach(layer => {      
      layer.draw();
    });

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

  drawBoard(layer?:Konva.Layer) {
    if(layer) { 
      layer.draw(); 
      return; 
    }
    this.publicBoard.draw();
  }

  shuffleBoard() {
    setTimeout(this.shuffleTile(0), 0);
  }

  shuffleTile(tileNo: number): TimerHandler {
    let tile = this.publicBoard.tiles[tileNo];
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
        if (this.publicBoard.tiles.length > 0){
          this.shuffleBoard();
        }
        break;
      case 'setup9':
        this.setupLocalBoard();
        this.setupPublicBoard(9);
        break;
      case 'setup12':
        this.setupLocalBoard();
        this.setupPublicBoard(12);
        break;
      case 'setup15':
        this.setupLocalBoard();
        this.setupPublicBoard(15);
        break;
      case 'zoomOut':
        if (this.publicBoard.stage.scaleX() > .4) {
          console.log(this.publicBoard.stage.scaleX(), this.publicBoard.stage.scaleY());
          this.publicBoard.stage.scaleX(this.publicBoard.stage.scaleX() - .2);
          this.publicBoard.stage.scaleY(this.publicBoard.stage.scaleY() - .2);
          this.publicBoard.stage.draw();
        }
        break;
      case 'zoomIn':
        console.log(this.publicBoard.stage.scaleX(),this.publicBoard.stage.scaleY());
        this.publicBoard.stage.scaleX(this.publicBoard.stage.scaleX() + .2);
        this.publicBoard.stage.scaleY(this.publicBoard.stage.scaleY() + .2);
        this.publicBoard.stage.draw();
        break;
    } 
  }
  onWindowResize(event){
    if (this.publicBoard.tiles.length == 0 ) {
      return;
    }
    let toAdd = event.oldHeight - event.newHeight;
    this.localBoard.stage.height(this.localBoard.stage.height()+toAdd); 
  }
}
