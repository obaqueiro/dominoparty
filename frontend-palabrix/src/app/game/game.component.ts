import { NetworkService } from './../services/network.service';
import { Board } from './Board';
import { Tile } from './Tile';
import { Component } from "@angular/core";
import Konva from "konva";
import { Group } from "konva/types/Group";
import { MessageService } from "../services/message.service";

  @Component({
  selector: "game-root",
  templateUrl: "./game.component.html",
  styleUrls: ["./game.component.css"]
})
export class GameComponent {
  center: Group;

  publicBoardHeightRatio: number = 0.7;
  messageSub;

  publicBoard: Board;
  localBoard: Board;

  roomName: string;

  constructor(private messageService: MessageService, private network: NetworkService) {
    let path = new URL(document.URL).pathname;
    this.roomName = path.substr(1);

    this.messageSub = this.messageService.getMessage().subscribe(message => {
      this.processEvent(JSON.parse(message));
    });
  }

  ngAfterViewInit() {
    window.onresize = this.onWindowReize.bind(this);
    let winDim = this.getViewDimensions();
    this.publicBoard = new Board({
      width: winDim.width,
      height: winDim.height * this.publicBoardHeightRatio,
      stage: new Konva.Stage({
        container: "mainBoard", // id of container <div>
        width: winDim.width,
        height: winDim.height * this.publicBoardHeightRatio
      }),
      layers: [new Konva.Layer(), new Konva.Layer(), new Konva.Layer(),
      new Konva.Layer(), new Konva.Layer()],
      dragLayer: new Konva.Layer()
    });

    this.localBoard = new Board({
      width: winDim.width,
      height: 1 - winDim.height * this.publicBoardHeightRatio,
      layers: [new Konva.Layer()],
      stage: new Konva.Stage({
        container: 'localBoard',
        width: winDim.width,
        height: winDim.height * (1 - this.publicBoardHeightRatio)
      }),
      tiles: [],
      dragLayer: new Konva.Layer(),
      dropArea: null // created during localBoardSetup
    });
    this.connectToRoom();
  }

  getViewDimensions(): { width: number, height: number } {
    var win = window,
      doc = document,
      docElem = doc.documentElement,
      body = doc.getElementsByTagName('body')[0],
      x = win.innerWidth || docElem.clientWidth || body.clientWidth,
      y = win.innerHeight || docElem.clientHeight || body.clientHeight;
    console.log(x + ' × ' + y);
    return { width: x, height: y };
  }
  connectToRoom() {
    this.network.connect(this.roomName);
  }

  setupLocalBoard() {
    this.localBoard.stage.destroyChildren();
    this.localBoard.layers = [new Konva.Layer()];
    this.localBoard.dragLayer = new Konva.Layer();

    // The order of adding is important so that the tiles show in front of the dropArea when dragging
    this.localBoard.stage.add(this.localBoard.layers[0]);
    this.localBoard.stage.add(this.localBoard.dragLayer);

    this.localBoard.tiles = [];

    let dropArea = this.getLocalDropArea();

    this.localBoard.dropArea = dropArea;
    this.localBoard.layers[0].add(dropArea);
    dropArea.moveToBottom();
    this.localBoard.layers[0].draw();
  }

  getLocalDropArea(): Konva.Circle {
    return new Konva.Circle({
      radius: 50,
      fillEnabled: false,
      strokeWidth: 10,
      stroke: 'green',
      x: 400,
      y: 50,
      draggable: true
    });
  }
  setupPublicBoardInit() {
    this.publicBoard.stage.destroyChildren();
    this.publicBoard.dropArea = null;
    this.publicBoard.tiles = [];
  
    this.publicBoard.layers = [new Konva.Layer(), new Konva.Layer(), new Konva.Layer(), new Konva.Layer(), new Konva.Layer()]
    this.publicBoard.layers.forEach(layer => {
      this.publicBoard.stage.add(layer);
    });

    this.publicBoard.dragLayer = new Konva.Layer();
    this.publicBoard.stage.add(this.publicBoard.dragLayer);

    this.center = this.drawCenter();
    this.publicBoard.layers[0].add(this.center);
  }

    setupPublicBoard() {

      // the order of how elementes are added affects their ZIndex 
      // center goes first
      this.setupPublicBoardInit();

      let letters = [
        'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A',
        'B', 'B',
        'C', 'C', 'C', 'C', 'CH',
        'D', 'D', 'D', 'D', 'D',
        'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'E',
        'G', 'G', 'H', 'H',
        'I', 'I', 'I', 'I', 'I',
        'J', 'L', 'L', 'L', 'L',
        'LL', 'M', 'M',
        'N', 'N', 'N', 'N', 'N', 'Ñ',
        'O', 'O', 'O', 'O', 'O', 'O', 'O', 'O', 'O',
        'P', 'P', 'Q',
        'R', 'R', 'R', 'R', 'R', 'RR',
        'S', 'S', 'S', 'S', 'S', 'S',
        'T', 'T', 'T', 'T',
        'U', 'U', 'U', 'U', 'U',
        'V', 'X', 'Y', 'Z', ' ', ' '
      ]
      // then the tiles
      let position = 0;
      letters.forEach(letter => {
        let tile = new Tile({
          letter: letter,
          localBoard: this.localBoard,
          publicBoard: this.publicBoard,
          currentBoard: this.publicBoard,
          actionUpdate: this.sendTileUpdateData.bind(this)
        });
        position += 50; // 40 is the size of the tiles, so we leave some extra space
        tile.setAbsolutePosition({ x: position % 500, y: (position / 500) * 50 });
        this.publicBoard.addTile(tile);
      });
      this.publicBoard.dropArea = this.getDropArea();
      this.publicBoard.layers[0].add(this.publicBoard.dropArea);
      this.publicBoard.layers.forEach(layer => {
        layer.draw();
      });
  
       
  }

  sendTileUpdateData(data: {
    flipped?: boolean,
    rotation?: number, x?: number, action?: string, y: number, name: string
  }) {
    this.network.sendData(this.roomName, 'pieceUpdate', {
      event: 'pieceUpdate',
      piece: 'tile',
      name: data.name,
      state: {
        action: data.action,
        x: data.x,
        y: data.y,
        rotation: data.rotation,
        flipped: data.flipped
      }
    });
  }

  sendTrainUpdateData(train: Konva.Group) {
    this.network.sendData(this.roomName, 'pieceUpdate', {
      event: 'pieceUpdate',
      piece: 'train',
      name: train.name(),
      state: {
        action: 'move',
        x: train.x(),
        y: train.y(),

      }
    });
  }
  sendCenterUpdateData() {
    this.network.sendData(this.roomName, 'pieceUpdate', {
      event: 'pieceUpdate',
      piece: 'center',
      name: 'center',
      state: {
        x: this.center.x(),
        y: this.center.y(),
        action: 'move'
      }
    });
  }

  sendGameUpdateData(event: string) {
    this.network.sendData(this.roomName, event, {
      event: event,
      tiles: this.publicBoard.tiles.map(
        tile => {
          return {
            rotation: tile.rotation(),
            x: tile.x(),
            y: tile.y(),
            flipped: tile.isFlipped(),
            name: tile.name()
          }
        }),
      center: { x: this.center.x(), y: this.center.y() },      
    });
  }
  getDropArea() {
    return new Konva.Circle({
      radius: 80,
      fillEnabled: false,
      strokeWidth: 10,
      stroke: 'grey',
      x: 100,
      y: 600,
      draggable: true
    });
  }

  loadBoard(data: {}) {
    this.setupPublicBoardInit();
    this.publicBoard.tiles = [];

    for (let key in data) {
      switch (key) {
        case 'tiles':
          data['tiles'].forEach(tileData => {            

            let tile = new Tile(
              {
                letter: tileData.name, localBoard: this.localBoard,
                publicBoard: this.publicBoard, currentBoard: this.publicBoard,
                actionUpdate: this.sendTileUpdateData.bind(this)
              });

            tile.x(tileData.x);
            tile.y(tileData.y);
            tile.rotation(tileData.rotation);
            if (tileData.flipped) { tile.fire('hide', null) }
            this.publicBoard.addTile(tile);
          });
          break;
        case 'center':
          console.log(data['center']);
          this.center.x(data['center'].x);
          this.center.y(data['center'].y);

          break;
      }

      if (!this.localBoard.dropArea) {
        let dropArea = this.getLocalDropArea();
        this.localBoard.dropArea = dropArea;
        this.localBoard.layers[0].add(dropArea);
        this.localBoard.layers[0].draw();
      }
    }

    if (!this.publicBoard.dropArea) {
      this.publicBoard.dropArea = this.getDropArea();
      this.publicBoard.layers[0].add(this.publicBoard.dropArea);
    }

    this.publicBoard.layers.forEach(layer => {
      layer.draw();
    });


  }


  drawCenter(): Konva.Group {


    let group = new Konva.Group({ x: 600, y: 50, draggable: true, name: 'center' });
    let img = new Image();
    img.src = '/assets/board.jpg';
    img.onload = function() {
      group.add(new Konva.Image( { x:0,y:0,image:img, width:1600, height:1600,
        scaleX: 0.45,
        scaleY: 0.45, } ));

        group.cache();            
        group.draw();
    }
        
    group.on('dragend', () => this.sendCenterUpdateData());
   
    return group;
  }

  drawBoard(layer?: Konva.Layer) {
    if (layer) {
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
      this.sendGameUpdateData('update');
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

  processEvent(message: { event: string, data?: any }) {
    switch (message.event) {
      case 'shuffle':
        if (this.publicBoard.tiles.length > 0) {
          this.shuffleBoard();
        }
        break;
      case 'setup':
        this.setupLocalBoard();
        this.setupPublicBoard();
        this.sendGameUpdateData('setup');
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
        console.log(this.publicBoard.stage.scaleX(), this.publicBoard.stage.scaleY());
        this.publicBoard.stage.scaleX(this.publicBoard.stage.scaleX() + .2);
        this.publicBoard.stage.scaleY(this.publicBoard.stage.scaleY() + .2);
        this.publicBoard.stage.draw();
        break;
      case 'boardUpdate':
        this.loadBoard(message.data);
        break;
      case 'boardSetup':
        this.setupLocalBoard();
        this.loadBoard(message.data);
        break;
      case 'pieceUpdate':
        console.log('we got a piece update', message);
        this.pieceUpdate(message.data);
        break;
      case 'arrangeLocalTiles':
        console.log("arranging lcoal tiles");
        this.arrangeLocalTiles();
        break;
    }
  }

  arrangeLocalTiles() {
    let x = 0;
    let y = 0;
    this.localBoard.tiles.forEach(tile => {
      tile.rotation(0);
      tile.x(x);
      tile.y(y);
      this.localBoard.draw();
      if (x >= this.localBoard.stage.width()-100) {
        x = 0;
        y = y + tile.getClientRect({}).height+10;
      }
      else
      {
        x += tile.getClientRect({}).width+10;
      }

    });
  }

  pieceUpdate(data: {
    piece: string, name: string,
    state: { flipped?: boolean, action?: string, x?: number, y?: number, rotation?: number }
  }) {
    // do something depending on the type of piece the user is moving
    switch (data.piece) {
      case 'tile':
        let tile = this.publicBoard.tiles.find(tile => { return tile.name() == data.name });
        switch (data.state.action) {
          case 'move':
          case 'create':
            // if it does not exist we create it
            if (!tile) {
              tile = new Tile({
                localBoard: this.localBoard,
                publicBoard: this.publicBoard,
                currentBoard: this.publicBoard,
                letter: data.name,
                actionUpdate: this.sendTileUpdateData.bind(this)
              });
              this.publicBoard.addTile(tile);
              this.publicBoard.draw();
            }
            tile.x(data.state.x);
            tile.y(data.state.y);
            tile.rotation(data.state.rotation);
            tile.flipped(data.state.flipped);
            tile.getLayer().draw();
            break;
          case 'destroy':
            let layer = tile.getLayer();
            this.publicBoard.removeTile(tile);
            tile.destroy();
            layer.draw();
            break;
        }
        break;      
      case 'center':
        this.center.x(data.state.x);
        this.center.y(data.state.y);
        this.center.getLayer().draw();
        break;
    }
  }

  onPublicBoardResize(event) {
    if (this.publicBoard.tiles.length == 0) {
      return;
    }
    let toAdd = event.oldHeight - event.newHeight;
    this.publicBoard.stage.height(event.newHeight);
    this.localBoard.stage.height(this.localBoard.stage.height() + toAdd);
  }

  onWindowReize(event) {
    console.log(event);
    let winDim = this.getViewDimensions();
    this.publicBoard.stage.width(winDim.width);
    this.publicBoard.stage.height(this.publicBoardHeightRatio * winDim.height);
    this.localBoard.stage.width(winDim.width);
    this.localBoard.stage.height((1 - this.publicBoardHeightRatio) * winDim.height);
    console.log(this.localBoard.stage.width(), this.localBoard.stage.height());
  }
}
