import { Component, AfterViewInit, OnDestroy } from "@angular/core";
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import Konva from "konva";
import { NetworkService } from './../services/network.service';
import { MessageService, EventPayload } from "../services/message.service";
import { Board } from './Board';
import { Tile } from './Tile';
import { ResizeObserverDirective, ResizeEvent } from './resize-observer.directive';
import { MenuComponent } from '../menu.component';

interface BoardData {
  tiles?: Array<{
    name: string;
    x: number;
    y: number;
    rotation: number;
    flipped: boolean;
  }>;
  center?: {
    x: number;
    y: number;
  };
  trains?: Array<{
    name: string;
    x: number;
    y: number;
  }>;
}

@Component({
  selector: "game-root",
  standalone: true,
  imports: [CommonModule, ResizeObserverDirective, MenuComponent],
  templateUrl: "./game.component.html",
  styleUrls: ["./game.component.scss"]
})
export class GameComponent implements AfterViewInit, OnDestroy {
  private center!: Konva.Group;
  private trains: Konva.Group[] = [];
  private messageSub: Subscription;

  publicBoardHeightRatio = 0.85;
  trainCount = 8;
  isPrivateBoardCollapsed = false;

  publicBoard!: Board;
  localBoard!: Board;
  roomName: string;

  constructor(
    private messageService: MessageService,
    private network: NetworkService
  ) {
    const path = new URL(document.URL).pathname;
    this.roomName = path.substring(1);

    this.messageSub = this.messageService.getMessage().subscribe((message: EventPayload) => {
      this.processEvent(message);
    });
  }

  ngAfterViewInit(): void {
    window.onresize = this.onWindowReize.bind(this);
    const winDim = this.getViewDimensions();
    
    this.publicBoard = new Board({
      width: winDim.width,
      height: winDim.height - 200,
      stage: new Konva.Stage({
        container: "mainBoard",
        width: winDim.width,
        height: winDim.height - 200
      }),
      layers: [
        new Konva.Layer(),
        new Konva.Layer(),
        new Konva.Layer(),
        new Konva.Layer(),
        new Konva.Layer()
      ],
      dragLayer: new Konva.Layer(),
      dropArea: new Konva.Circle({ radius: 0 })
    });

    this.localBoard = new Board({
      width: winDim.width,
      height: 160,
      layers: [new Konva.Layer()],
      stage: new Konva.Stage({
        container: 'localBoard',
        width: winDim.width,
        height: 160
      }),
      tiles: [],
      dragLayer: new Konva.Layer(),
      dropArea: new Konva.Circle({ radius: 0 })
    });

    this.connectToRoom();
  }

  ngOnDestroy(): void {
    this.messageSub.unsubscribe();
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
      x: 400,
      y: 50,
      radius: 50,
      fill: 'green',
      draggable: true,
    });
  }
  setupPublicBoardInit() {
    this.publicBoard.stage.destroyChildren();
    this.publicBoard.dropArea = new Konva.Circle({ radius: 0 });
    this.publicBoard.tiles = [];
    this.trains = [];
    this.publicBoard.layers = [new Konva.Layer(), new Konva.Layer(), new Konva.Layer(), new Konva.Layer(), new Konva.Layer()];
    this.publicBoard.layers.forEach(layer => {
      this.publicBoard.stage.add(layer);
    });

    this.publicBoard.dragLayer = new Konva.Layer();
    this.publicBoard.stage.add(this.publicBoard.dragLayer);

    this.center = this.drawCenter();
    this.publicBoard.layers[0].add(this.center);
  }

  setupPublicBoard(size: number) {

    // the order of how elementes are added affects their ZIndex 
    // center goes first
    this.setupPublicBoardInit();

    // then the trains
    for (let i = 0; i < this.trainCount; i++) {
      let train = this.getTrain();
      train.name('train' + i);
      this.publicBoard.layers[0].add(train);
      train.position({ x: 800 + 50 * i, y: 50 });
      this.trains.push(train);
    }
    // then the tiles
    for (let i = 0; i <= size; i++) {
      for (let j = i; j <= size; j++) {
        let tile = new Tile({
          top: i, bottom: j,
          localBoard: this.localBoard,
          publicBoard: this.publicBoard,
          currentBoard: this.publicBoard,
          actionUpdate: this.sendTileUpdateData.bind(this)
        });
        tile.x(j * 45);
        tile.y(i * 90);
        this.publicBoard.addTile(tile);
      }
    }

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
    console.log('Sending game update data:', event, {
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
      trains: this.trains.map(train => {
        return { x: train.x(), y: train.y(), name: train.name() }
      })
    });
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
      trains: this.trains.map(train => {
        return { x: train.x(), y: train.y(), name: train.name() }
      })
    });
  }
  getDropArea() {
    return new Konva.Circle({
      radius: 80,
      fill: 'grey',
      x: 900,
      y: 450,
      draggable: true
    });
  }

  loadBoard(data: BoardData) {
    console.log('GameComponent: Loading board with data:', data);
    if (!data) {
      console.error('GameComponent: No data provided to loadBoard');
      return;
    }

    // Initialize the board
    this.setupPublicBoardInit();
    this.publicBoard.tiles = [];
    this.trains = [];

    // Load tiles
    if (data.tiles && Array.isArray(data.tiles)) {
      console.log('GameComponent: Loading tiles:', data.tiles);
      data.tiles.forEach((tileData, index) => {
        try {
          let [top, bottom] = tileData.name.split('x');
          console.log(`GameComponent: Creating tile ${index}:`, { 
            name: tileData.name,
            top, 
            bottom, 
            position: { x: tileData.x, y: tileData.y },
            rotation: tileData.rotation,
            flipped: tileData.flipped 
          });

          let tile = new Tile({
            top: Number(top),
            bottom: Number(bottom),
            localBoard: this.localBoard,
            publicBoard: this.publicBoard,
            currentBoard: this.publicBoard,
            actionUpdate: this.sendTileUpdateData.bind(this)
          });

          // Set tile properties
          tile.x(tileData.x);
          tile.y(tileData.y);
          tile.rotation(tileData.rotation);
          if (tileData.flipped) { 
            console.log(`GameComponent: Flipping tile ${index}:`, tileData.name);
            tile.flipped(true);
          }

          // Add tile to board
          this.publicBoard.addTile(tile);
          console.log(`GameComponent: Successfully added tile ${index} to board`);
        } catch (error) {
          console.error(`GameComponent: Error creating tile ${index}:`, error);
        }
      });
    } else {
      console.log('GameComponent: No tiles to load or invalid tiles data:', data.tiles);
    }

    // Load center
    if (data.center) {
      console.log('GameComponent: Setting center position:', data.center);
      try {
        this.center.x(data.center.x);
        this.center.y(data.center.y);
        console.log('GameComponent: Center position set successfully');
      } catch (error) {
        console.error('GameComponent: Error setting center position:', error);
      }
    } else {
      console.log('GameComponent: No center data to load');
    }

    // Load trains
    if (data.trains && Array.isArray(data.trains)) {
      console.log('GameComponent: Loading trains:', data.trains);
      data.trains.forEach((trainData, index) => {
        try {
          let train = this.getTrain();
          train.x(trainData.x);
          train.y(trainData.y);
          train.name(trainData.name);
          this.trains.push(train);
          this.publicBoard.layers[0].add(train);
          console.log(`GameComponent: Successfully added train ${index}`);
        } catch (error) {
          console.error(`GameComponent: Error creating train ${index}:`, error);
        }
      });
    } else {
      console.log('GameComponent: No trains to load or invalid trains data:', data.trains);
    }

    // Setup drop areas if needed
    if (!this.localBoard.dropArea) {
      console.log('GameComponent: Creating local drop area');
      let dropArea = this.getLocalDropArea();
      this.localBoard.dropArea = dropArea;
      this.localBoard.layers[0].add(dropArea);
      this.localBoard.layers[0].draw();
    }

    if (!this.publicBoard.dropArea) {
      console.log('GameComponent: Creating public drop area');
      this.publicBoard.dropArea = this.getDropArea();
      this.publicBoard.layers[0].add(this.publicBoard.dropArea);
    } else {
      // Ensure the dropArea is visible and properly positioned
      this.publicBoard.dropArea.radius(80);  // Set the radius to match getDropArea()
      this.publicBoard.dropArea.x(900);      // Set the x position to match getDropArea()
      this.publicBoard.dropArea.y(450);      // Set the y position to match getDropArea()
      this.publicBoard.dropArea.fill('grey'); // Set the fill color to match getDropArea()
      this.publicBoard.dropArea.draggable(true);
      this.publicBoard.layers[0].add(this.publicBoard.dropArea);
    }

    // Draw everything
    console.log('GameComponent: Drawing all layers');
    this.publicBoard.layers.forEach((layer, index) => {
      try {
        layer.draw();
        console.log(`GameComponent: Layer ${index} drawn successfully`);
      } catch (error) {
        console.error(`GameComponent: Error drawing layer ${index}:`, error);
      }
    });

    // Verify the board state
    console.log('GameComponent: Final board state:', {
      tileCount: this.publicBoard.tiles.length,
      trainCount: this.trains.length,
      hasCenter: !!this.center,
      centerPosition: this.center ? { x: this.center.x(), y: this.center.y() } : null,
      layerCount: this.publicBoard.layers.length
    });
  }

  getTrain() {
    let group = new Konva.Group({ draggable: true });
    let train = new Konva.Text({
      text: '🚂',
      fontSize: 35
    });

    group.add(train);
    group.cache();
    group.on('dragend', () => {
      console.log('moved train', group);
      this.sendTrainUpdateData(group);
    })
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

    group.on('dragend', () => this.sendCenterUpdateData());
    group.cache();
    return group;
  }

  drawBoard(layer?: Konva.Layer) {
    if (layer) {
      layer.draw();
      return;
    }
    this.publicBoard.draw();
  }

  shuffleBoard(): void {
    // Get all tiles that are currently on the public board
    const tilesToShuffle = [...this.publicBoard.tiles];
    if (tilesToShuffle.length === 0) {
      console.log('No tiles to shuffle');
      return;
    }

    // Shuffle each tile with a delay
    tilesToShuffle.forEach((tile, index) => {
      setTimeout(() => {
        if (tile && tile.parent) {  // Check if tile still exists and is on the board
          tile.position({
            x: Math.floor(Math.random() * 300) + 100,
            y: Math.floor(Math.random() * 300) + 100
          });
          tile.rotation(Math.floor(Math.random() * 359));
          tile.flipped(true);
          
          // Draw the layer after each tile is shuffled
          const layer = tile.getLayer();
          if (layer) {
            layer.draw();
          }
        }
      }, index * 100);  // Stagger the shuffling of tiles
    });

    // Send update after all tiles are shuffled
    setTimeout(() => {
      this.drawBoard();
      this.sendGameUpdateData('update');
    }, tilesToShuffle.length * 100 + 100);
  }

  processEvent(message: { event: string, data?: any }) {
    console.log('GameComponent: Processing event:', message);
    switch (message.event) {
      case 'connected':
        console.log('GameComponent: Received connected event with data:', message.data);
        if (!message.data || !message.data.boardData) {
          console.error('GameComponent: Invalid board data received:', message.data);
          return;
        }
        console.log('GameComponent: Board data structure:', {
          hasTiles: !!message.data.boardData.tiles,
          tileCount: message.data.boardData.tiles?.length,
          hasCenter: !!message.data.boardData.center,
          hasTrains: !!message.data.boardData.trains
        });
        this.setupLocalBoard();
        this.loadBoard(message.data.boardData);
        break;
      case 'shuffle':
        if (this.publicBoard.tiles.length > 0) {
          this.shuffleBoard();
        }
        break;
      case 'setup9':
        console.log('Setting up board size 9');
        this.setupLocalBoard();
        this.setupPublicBoard(9);
        this.sendGameUpdateData('setup');
        break;
      case 'setup12':
        console.log('Setting up board size 12');
        this.setupLocalBoard();
        this.setupPublicBoard(12);
        this.sendGameUpdateData('setup');
        break;
      case 'setup15':
        console.log('Setting up board size 15');
        this.setupLocalBoard();
        this.setupPublicBoard(15);
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
        console.log('GameComponent: Received boardUpdate event with data:', message.data);
        this.loadBoard(message.data);
        break;
      case 'boardSetup':
        console.log('GameComponent: Received boardSetup event with data:', message.data);
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
    piece: string;
    name: string;
    state: { flipped?: boolean; action?: string; x?: number; y?: number; rotation?: number };
  }) {
    switch (data.piece) {
      case 'tile': {
        const tile = this.publicBoard.tiles.find(t => t.name() === data.name);
        if (!tile) return;

        switch (data.state.action) {
          case 'move':
          case 'create': {
            tile.x(data.state.x ?? 0);
            tile.y(data.state.y ?? 0);
            tile.rotation(data.state.rotation ?? 0);
            if (data.state.flipped !== undefined) {
              tile.flipped(data.state.flipped);
            }
            const layer = tile.getLayer();
            if (layer) {
              layer.draw();
            }
            break;
          }
          case 'destroy': {
            const layer = tile.getLayer();
            if (layer) {
              this.publicBoard.removeTile(tile);
              tile.destroy();
              layer.draw();
            }
            break;
          }
        }
        break;
      }
      case 'train': {
        const train = this.trains.find(t => t.name() === data.name);
        if (train && data.state.action === 'move') {
          train.x(data.state.x ?? 0);
          train.y(data.state.y ?? 0);
          const layer = train.getLayer();
          if (layer) {
            layer.draw();
          }
        }
        break;
      }
      case 'center': {
        if (data.state.x !== undefined) this.center.x(data.state.x);
        if (data.state.y !== undefined) this.center.y(data.state.y);
        const layer = this.center.getLayer();
        if (layer) {
          layer.draw();
        }
        break;
      }
    }
  }

  onPublicBoardResize(event: ResizeEvent): void {
    if (!this.publicBoard) return;
    this.publicBoard.stage.width(event.width);
    this.publicBoard.stage.height(event.height);
    this.publicBoard.draw();
  }

  onWindowReize(event: UIEvent): void {
    console.log(event);
    this.updateBoardDimensions();
  }

  togglePrivateBoard() {
    this.isPrivateBoardCollapsed = !this.isPrivateBoardCollapsed;
    this.updateBoardDimensions();
  }

  private updateBoardDimensions() {
    const winDim = this.getViewDimensions();
    const privateBoardHeight = this.isPrivateBoardCollapsed ? 40 : 200;
    
    this.publicBoard.stage.width(winDim.width);
    this.publicBoard.stage.height(winDim.height - privateBoardHeight);
    
    this.localBoard.stage.width(winDim.width);
    this.localBoard.stage.height(privateBoardHeight - 40); // Account for padding and margins
    
    this.publicBoard.draw();
    this.localBoard.draw();
  }
}
