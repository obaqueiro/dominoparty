import { Component, AfterViewInit, OnDestroy } from "@angular/core";
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import Konva from "konva";
import { NetworkService } from './../services/network.service';
import { MessageService, EventPayload } from "../services/message.service";
import { Board } from './Board';
import { Tile } from './Tile';
import { ResizeObserverDirective, ResizeEvent } from './resize-observer.directive';
import { FloatingControlsComponent } from '../floating-controls/floating-controls.component';
import { PrivateBoardControlsComponent } from '../private-board-controls/private-board-controls.component';

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
  imports: [
    CommonModule, 
    ResizeObserverDirective, 
    FloatingControlsComponent,
    PrivateBoardControlsComponent
  ],
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
    
    // Add background layer for public board
    const publicBgLayer = new Konva.Layer();
    const publicBg = new Konva.Rect({
      x: 0,
      y: 0,
      width: winDim.width * 2,
      height: winDim.height * 2,
      fill: '#f0f0f0',
      stroke: '#e0e0e0',
      strokeWidth: 1,
      draggable: true,
      listening: true
    });
    publicBgLayer.add(publicBg);
    
    // Create empty drop area group
    const emptyDropArea = new Konva.Group({
      x: 0,
      y: 0,
      draggable: true
    });
    
    this.publicBoard = new Board({
      width: winDim.width,
      height: winDim.height - 200,
      stage: new Konva.Stage({
        container: "mainBoard",
        width: winDim.width,
        height: winDim.height - 200,
        draggable: true
      }),
      layers: [
        publicBgLayer,
        new Konva.Layer(),
        new Konva.Layer(),
        new Konva.Layer(),
        new Konva.Layer(),
        new Konva.Layer()
      ],
      dragLayer: new Konva.Layer(),
      dropArea: emptyDropArea
    });

    // Add background layer for local board
    const localBgLayer = new Konva.Layer();
    const localBg = new Konva.Rect({
      x: 0,
      y: 0,
      width: winDim.width * 2,
      height: winDim.height * 2,
      fill: '#f8f8f8',
      stroke: '#e8e8e8',
      strokeWidth: 1,
      draggable: true,
      listening: true
    });
    localBgLayer.add(localBg);

    // Create empty drop area group for local board
    const emptyLocalDropArea = new Konva.Group({
      x: 0,
      y: 0,
      draggable: true
    });

    this.localBoard = new Board({
      width: winDim.width,
      height: 160,
      layers: [localBgLayer],
      stage: new Konva.Stage({
        container: 'localBoard',
        width: winDim.width,
        height: 160,
        draggable: true
      }),
      tiles: [],
      dragLayer: new Konva.Layer(),
      dropArea: emptyLocalDropArea
    });

    // Add drag handlers for both boards
    this.setupBoardDragHandlers(this.publicBoard);
    this.setupBoardDragHandlers(this.localBoard);

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

  getLocalDropArea() {
    // Create a smaller version of the drop area for the local board
    const group = new Konva.Group({
      x: 400,
      y: 50,
      draggable: true,
      listening: true  // Ensure it can receive events
    });

    const outerCircle = new Konva.Circle({
      radius: 50,
      fillLinearGradientStartPoint: { x: -50, y: -50 },
      fillLinearGradientEndPoint: { x: 50, y: 50 },
      fillLinearGradientColorStops: [0, '#4CAF50', 1, '#388E3C'],
      stroke: '#2c3e50',
      strokeWidth: 2,
      shadowColor: 'rgba(0,0,0,0.3)',
      shadowBlur: 8,
      shadowOffset: { x: 3, y: 3 },
      shadowOpacity: 0.5,
      name: 'outer-circle'  // Add name for finding it later
    });

    const innerCircle = new Konva.Circle({
      radius: 40,
      fill: '#ffffff',
      stroke: '#2c3e50',
      strokeWidth: 1,
      dash: [4, 4]
    });

    const decoration = new Konva.Star({
      x: 0,
      y: 0,
      numPoints: 6,
      innerRadius: 25,
      outerRadius: 35,
      fill: 'rgba(76, 175, 80, 0.1)',
      stroke: '#4CAF50',
      strokeWidth: 1
    });

    group.add(outerCircle);
    group.add(innerCircle);
    group.add(decoration);

    // Add hover effect
    group.on('mouseover', () => {
      outerCircle.fillLinearGradientColorStops([0, '#388E3C', 1, '#2c3e50']);
      group.getLayer()?.batchDraw();
    });

    group.on('mouseout', () => {
      outerCircle.fillLinearGradientColorStops([0, '#4CAF50', 1, '#388E3C']);
      group.getLayer()?.batchDraw();
    });

    return group;
  }
  setupPublicBoardInit() {
    this.publicBoard.stage.destroyChildren();
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
    // the order of how elements are added affects their ZIndex 
    // center goes first
    this.setupPublicBoardInit();

    // Create and add drop area first
    const dropArea = this.getDropArea();
    this.publicBoard.dropArea = dropArea;
    this.publicBoard.layers[0].add(dropArea);
    dropArea.moveToBottom(); // Ensure drop area is behind other elements

    // Store the initial stage-relative position
    const dropAreaStageX = dropArea.x();
    const dropAreaStageY = dropArea.y();

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

    this.publicBoard.layers.forEach(layer => {
      layer.draw();
    });

    // Setup drag handlers after everything is set up
    this.setupBoardDragHandlers(this.publicBoard);
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
    // Create a more visually appealing drop area
    const group = new Konva.Group({
      x: 900,
      y: 450,
      draggable: true,
      listening: true  // Ensure it can receive events
    });

    // Outer circle with gradient
    const outerCircle = new Konva.Circle({
      radius: 80,
      fillLinearGradientStartPoint: { x: -80, y: -80 },
      fillLinearGradientEndPoint: { x: 80, y: 80 },
      fillLinearGradientColorStops: [0, '#4a90e2', 1, '#357abd'],
      stroke: '#2c3e50',
      strokeWidth: 2,
      shadowColor: 'rgba(0,0,0,0.3)',
      shadowBlur: 10,
      shadowOffset: { x: 5, y: 5 },
      shadowOpacity: 0.5,
      name: 'outer-circle'  // Add name for finding it later
    });

    // Inner circle with pattern
    const innerCircle = new Konva.Circle({
      radius: 70,
      fill: '#ffffff',
      stroke: '#2c3e50',
      strokeWidth: 1,
      dash: [5, 5]
    });

    // Add some decorative elements
    const decoration = new Konva.Star({
      x: 0,
      y: 0,
      numPoints: 8,
      innerRadius: 40,
      outerRadius: 60,
      fill: 'rgba(74, 144, 226, 0.1)',
      stroke: '#4a90e2',
      strokeWidth: 1,
      rotation: 22.5
    });

    group.add(outerCircle);
    group.add(innerCircle);
    group.add(decoration);

    // Add hover effect
    group.on('mouseover', () => {
      outerCircle.fillLinearGradientColorStops([0, '#357abd', 1, '#2c3e50']);
      group.getLayer()?.batchDraw();
    });

    group.on('mouseout', () => {
      outerCircle.fillLinearGradientColorStops([0, '#4a90e2', 1, '#357abd']);
      group.getLayer()?.batchDraw();
    });

    return group;
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

    // Create new drop area for the public board with fixed position
    console.log('GameComponent: Creating new public drop area');
    const dropArea = this.getDropArea();
    this.publicBoard.dropArea = dropArea;
    this.publicBoard.layers[0].add(dropArea);
    dropArea.moveToBottom(); // Ensure drop area is behind other elements
    
    // Store the initial stage-relative position
    const dropAreaStageX = dropArea.x();
    const dropAreaStageY = dropArea.y();

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

    // Setup local board drop area if needed
    if (!this.localBoard.dropArea) {
      console.log('GameComponent: Creating local drop area');
      let localDropArea = this.getLocalDropArea();
      this.localBoard.dropArea = localDropArea;
      this.localBoard.layers[0].add(localDropArea);
      localDropArea.moveToBottom(); // Ensure drop area is behind other elements
      this.localBoard.layers[0].draw();
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
      layerCount: this.publicBoard.layers.length,
      hasDropArea: !!this.publicBoard.dropArea,
      dropAreaPosition: this.publicBoard.dropArea ? { 
        x: this.publicBoard.dropArea.x(), 
        y: this.publicBoard.dropArea.y() 
      } : null
    });

    // Setup drag handlers after everything is loaded
    this.setupBoardDragHandlers(this.publicBoard);
    this.setupBoardDragHandlers(this.localBoard);
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
    if (!this.localBoard.tiles.length) return;

    // Calculate tile dimensions (assuming all tiles are the same size)
    const firstTile = this.localBoard.tiles[0];
    const tileRect = firstTile.getClientRect({});
    const tileWidth = tileRect.width;
    const tileHeight = tileRect.height;
    const padding = 10; // Space between tiles

    // Calculate how many tiles can fit in a row based on board width
    const boardWidth = this.localBoard.stage.width();
    const tilesPerRow = Math.floor((boardWidth - padding) / (tileWidth + padding));
    
    // Calculate starting position to center the grid
    const totalWidth = tilesPerRow * (tileWidth + padding) - padding;
    const startX = (boardWidth - totalWidth) / 2;
    const startY = padding;

    // Arrange tiles in a grid
    this.localBoard.tiles.forEach((tile, index) => {
      // Reset tile state
      tile.rotation(0);
      tile.flipped(false);
      
      // Calculate position in grid
      const row = Math.floor(index / tilesPerRow);
      const col = index % tilesPerRow;
      
      // Set position
      tile.x(startX + col * (tileWidth + padding));
      tile.y(startY + row * (tileHeight + padding));
    });

    // Redraw the board
    this.localBoard.draw();
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
    const containerHeight = winDim.height; // No need to account for menu height anymore
    const privateBoardHeight = this.isPrivateBoardCollapsed ? 40 : Math.min(containerHeight * 0.4, containerHeight - 200);
    
    // Update public board dimensions
    this.publicBoard.stage.width(winDim.width - 20); // Account for padding
    this.publicBoard.stage.height(containerHeight - privateBoardHeight - 20); // Account for gap
    
    // Update private board dimensions
    this.localBoard.stage.width(winDim.width - 20); // Account for padding
    this.localBoard.stage.height(privateBoardHeight - 50); // Account for toggle button and padding
    
    this.publicBoard.draw();
    this.localBoard.draw();
  }

  private setupBoardDragHandlers(board: Board) {
    let isDraggingTile = false;
    let dragStartTime = 0;
    let isDraggingBackground = false;
    const DRAG_THRESHOLD = 200; // milliseconds to wait before considering it a background drag

    // Store the drop area's position relative to the stage
    let dropAreaStageX = board.dropArea.x();
    let dropAreaStageY = board.dropArea.y();

    board.stage.on('mousedown touchstart', (e) => {
      // If we clicked on a tile or the drop area, don't start background drag
      if (e.target !== board.stage && e.target !== board.layers[0].getChildren()[0]) {
        isDraggingTile = true;
        return;
      }
      
      dragStartTime = Date.now();
      isDraggingTile = false;
    });

    board.stage.on('mousemove touchmove', (e) => {
      // If we're dragging a tile, don't move the background
      if (isDraggingTile || board.dragLayer.getChildren().length > 0) {
        return;
      }

      // Only start background drag if we've held the mouse down for a while
      if (Date.now() - dragStartTime > DRAG_THRESHOLD) {
        isDraggingBackground = true;
        // Update background position
        const bgLayer = board.layers[0];
        const bg = bgLayer.getChildren()[0] as Konva.Rect;
        if (bg) {
          bg.x(bg.x() + e.evt.movementX);
          bg.y(bg.y() + e.evt.movementY);
          bgLayer.batchDraw();

          // Update drop area position relative to stage movement
          board.dropArea.x(dropAreaStageX);
          board.dropArea.y(dropAreaStageY);
          board.dropArea.getLayer()?.batchDraw();
        }
      }
    });

    board.stage.on('mouseup touchend', () => {
      if (isDraggingBackground) {
        // Update the stored stage-relative position when background drag ends
        dropAreaStageX = board.dropArea.x();
        dropAreaStageY = board.dropArea.y();
      }
      isDraggingTile = false;
      isDraggingBackground = false;
      dragStartTime = 0;
    });

    // Handle drag end for tiles
    board.stage.on('dragend', (e) => {
      isDraggingTile = false;
      dragStartTime = 0;
    });

    // Make drop area only draggable when explicitly clicked
    board.dropArea.draggable(true);
    board.dropArea.on('dragstart', () => {
      // Prevent background drag when dragging drop area
      isDraggingTile = true;
    });
    board.dropArea.on('dragend', () => {
      // Update the stored stage-relative position when drop area is dragged
      dropAreaStageX = board.dropArea.x();
      dropAreaStageY = board.dropArea.y();
      isDraggingTile = false;
    });
  }
}
