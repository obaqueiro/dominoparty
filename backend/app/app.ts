import * as express from "express";
import { Socket } from "socket.io";
import * as redis from 'redis';

class MainApplication {
  app;
  http;
  io;
  redisHost = 'redis';
  // @ts-ignore - Redis types are for a newer version
  redis;

  constructor() {
    this.app = express();
    this.http = require("http").Server(this.app);
    
    // Configure Socket.IO with longer ping timeout and interval and CORS
    this.io = require("socket.io")(this.http, {
      pingTimeout: 60000, // 60 seconds
      pingInterval: 25000, // 25 seconds
      transports: ['websocket', 'polling'],
      cors: {
        origin: ['*'],
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type"],
        credentials: true
      }
    });

    this.app.get("/", (_: any, res: any) => {
      res.send({ message: 'DominoParty API... Hello hacker!' });
    });
    
    this.io.on("connection", this.onConnection.bind(this));

    // Initialize Redis with error handling
    // @ts-ignore - Redis types are for a newer version
    this.redis = redis.createClient(6379, this.redisHost, {
      retry_strategy: (options) => {
        if (options.attempt > 10) {
          console.error('Redis max retries reached');
          return new Error('Redis max retries reached');
        }
        return Math.min(options.attempt * 100, 3000);
      }
    });
    
    this.redis.on('error', (err) => {
      console.error('Redis Error:', err);
    });

    this.redis.on('connect', () => {
      console.log('Successfully connected to Redis');
    });

    // Test Redis connection
    this.redis.ping((err, result) => {
      if (err) {
        console.error('Redis connection test failed:', err);
      } else {
        console.log('Redis connection test successful:', result);
      }
    });
  }

  processMessage(message: string, socket: Socket) {
    console.log("Raw message received:", message);
    let jsonMsg: { event:string, room: string , data?:any} = JSON.parse(message);
    console.log("Backend received parsed message:", jsonMsg);
    let event = jsonMsg.event;
    console.log("Processing event type:", event, "for room:", jsonMsg.room);
    
    if (!jsonMsg.room) {
      console.error("No room specified in message:", jsonMsg);
      return;
    }

    switch (event) {
      case 'connect':
        console.log("Handling connect event for room:", jsonMsg.room);
        this.onPlayerConnect(jsonMsg.room, socket);
        break;
      case 'update':
      case 'setup':
        console.log("Handling update/setup event for room:", jsonMsg.room);
        this.onPlayerUpdate(jsonMsg.room, jsonMsg.data, socket);
        break;
      case 'pieceUpdate':
        console.log("Handling pieceUpdate event for room:", jsonMsg.room);
        this.onPieceUpdate(jsonMsg.room, jsonMsg.data, socket);
        break;
      default:
        console.error("Unknown event type:", event, "in message:", jsonMsg);
    }
  }

  // Helper method to safely save to Redis
  private saveToRedis(key: string, data: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const dataStr = JSON.stringify(data);
      console.log(`Saving to Redis - Key: ${key}, Data:`, dataStr);
      
      this.redis.set(key, dataStr, (err, result) => {
        if (err) {
          console.error(`Redis save error for key ${key}:`, err);
          reject(err);
        } else {
          console.log(`Redis save successful for key ${key}. Result:`, result);
          // Verify the save by immediately reading back
          this.redis.get(key, (verifyErr, verifyData) => {
            if (verifyErr) {
              console.error(`Redis verify error for key ${key}:`, verifyErr);
            } else {
              console.log(`Redis verify successful for key ${key}. Data:`, verifyData);
            }
          });
          resolve();
        }
      });
    });
  }

  // Helper method to safely get from Redis
  private getFromRedis(key: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.redis.get(key, (err, data) => {
        if (err) {
          console.error(`Redis get error for key ${key}:`, err);
          reject(err);
        } else {
          console.log(`Redis get successful for key ${key}:`, data);
          resolve(data ? JSON.parse(data) : null);
        }
      });
    });
  }

  // When a player connects a room, add the player to the room and notify other players
  async onPlayerConnect(roomName: string, socket: Socket) {
    console.log(`Player ${socket.id} connecting to room: ${roomName}`);
    let roomData: {boardData: any, players: any} = {boardData:{}, players:[]};
    
    try {
      console.log(`Attempting to get room data from Redis for key: ${roomName}`);
      const data = await this.getFromRedis(roomName);
      
      if (data) {
        console.log('Found existing room data:', data);
        roomData = {
          boardData: data.boardData || {},
          players: data.players || []
        };

        // Add new player to the room
        if (!roomData.players.includes(socket.id)) {
          roomData.players.push(socket.id);
        }

        // Filter out disconnected players
        const connectedPlayers = roomData.players.filter(playerId => {
          const playerSocket = this.io.sockets.sockets.get(playerId);
          if (!playerSocket) {
            console.log(`Player ${playerId} is no longer connected, removing from room`);
            return false;
          }
          if (playerId !== socket.id) {
            console.log('Notifying player:', playerId, 'of new player joining');
            playerSocket.emit('message', { 
              event: 'playerConnected',
              data: { playerId: socket.id }
            });
          }
          return true;
        });

        // Update room with only connected players
        roomData.players = connectedPlayers;

        // Update room in Redis with new player list
        await this.saveToRedis(roomName, roomData);

        // Send current room state to the new player
        socket.emit('message', { 
          event: 'connected', 
          data: {
            boardData: roomData.boardData,
            players: roomData.players
          }
        });
      } else {
        console.log('Creating new room:', roomName);
        // Initialize new room with empty game state
        roomData = {
          boardData: {
            event: 'setup',
            tiles: [],
            center: { x: 0, y: 0 },
            trains: []
          },
          players: [socket.id]
        };
        
        console.log('Saving new room data to Redis:', roomData);
        // Store new room in Redis
        await this.saveToRedis(roomName, roomData);
        console.log('Successfully saved new room to Redis');
        
        // Send initial state to the first player
        socket.emit('message', { 
          event: 'connected', 
          data: {
            boardData: roomData.boardData,
            players: roomData.players
          }
        });
        console.log('Sent initial state to player');
      }
    } catch (error) {
      console.error('Error in onPlayerConnect:', error);
      socket.emit('message', { 
        event: 'error', 
        data: { message: 'Failed to connect to room' }
      });
    }
  }

  async onPieceUpdate(roomName: string, 
    pieceData: {event:string, piece:string, name:string, 
      state:{action?:string, x?:number, y?:number, rotation?:number, flipped:boolean}},
     socket: Socket) {
    try {
      const room = await this.getFromRedis(roomName);
      if (!room) {
        console.error(`Room ${roomName} not found for piece update`);
        return;
      }

      console.log('Updating piece in room:', roomName, 'Current room state:', room);

      switch(pieceData.piece) {
        case 'train':
          console.log("Updating train:", pieceData);
          let train = room.boardData.trains.find(train => train.name == pieceData.name);
          if(train) {
            console.log('Updating train:', train);
            train.x = pieceData.state.x;
            train.y = pieceData.state.y;
          }
          break;
        case 'center':
          room.boardData.center.x = pieceData.state.x;
          room.boardData.center.y = pieceData.state.y;
          break;
        case 'tile':
          console.log("Updating tile:", pieceData);
          let tile = room.boardData.tiles.find(tile => tile.name == pieceData.name);

          switch(pieceData.state.action) {
            case 'move':
              if (tile) {
                console.log('Moving tile:', tile);
                tile.x = pieceData.state.x;
                tile.y = pieceData.state.y;
                if (pieceData.state.rotation) {
                  tile.rotation = pieceData.state.rotation;
                }
                if(pieceData.state.flipped) {
                  tile.flipped = pieceData.state.flipped;
                }
              }
              break;
            case 'create':
              console.log('Creating new tile');
              room.boardData.tiles.push({
                rotation: pieceData.state.rotation,
                x: pieceData.state.x,
                y: pieceData.state.y,
                flipped: pieceData.state.flipped,
                name: pieceData.name
              });
              break;
            case 'destroy':
              console.log('Destroying tile:', pieceData.name);
              room.boardData.tiles = room.boardData.tiles.filter(tile => tile.name != pieceData.name);
              break;
          }
          break;
      }

      // Filter out disconnected players and notify remaining players
      const connectedPlayers = room.players.filter(playerId => {
        const playerSocket = this.io.sockets.sockets.get(playerId);
        if (!playerSocket) {
          console.log(`Player ${playerId} is no longer connected, removing from room`);
          return false;
        }
        if (playerId === socket.id) {
          return true;
        }
        console.log('Notifying player:', playerId, 'of piece update');
        playerSocket.emit('message',
          { event: pieceData.event, data: pieceData });
        return true;
      });

      // Update room with only connected players
      room.players = connectedPlayers;

      // Save updated room state to Redis
      console.log('Saving updated room state:', room);
      await this.saveToRedis(roomName, room);
    } catch (error) {
      console.error('Error in onPieceUpdate:', error);
      socket.emit('message', { 
        event: 'error', 
        data: { message: 'Failed to update piece' }
      });
    }
  }

  async onPlayerUpdate(roomName: string, newBoardData: any, socket: Socket) {
    try {
      console.log('Backend updating player in room:', roomName, 'with data:', newBoardData);
      const room = await this.getFromRedis(roomName);
      if (!room) {
        console.error(`Room ${roomName} not found for player update`);
        return;
      }

      console.log('Current room state:', room);
      room.boardData = newBoardData;

      // Filter out disconnected players and notify remaining players
      const connectedPlayers = room.players.filter(playerId => {
        const playerSocket = this.io.sockets.sockets.get(playerId);
        if (!playerSocket) {
          console.log(`Player ${playerId} is no longer connected, removing from room`);
          return false;
        }
        if (playerId === socket.id) {
          return true;
        }
        console.log('Notifying player:', playerId, 'of board update with event:', newBoardData['event']);
        playerSocket.emit('message',
          { event: newBoardData['event'], data: newBoardData });
        return true;
      });

      // Update room with only connected players
      room.players = connectedPlayers;

      // Save updated room state to Redis
      console.log('Saving updated room state to Redis:', room);
      await this.saveToRedis(roomName, room);
    } catch (error) {
      console.error('Error in onPlayerUpdate:', error);
      socket.emit('message', { 
        event: 'error', 
        data: { message: 'Failed to update board' }
      });
    }
  }

  onConnection(socket: Socket) {
    console.log("a user connected, id: ", socket.id);
    socket.on('disconnect', (reason) => {
      this.onDisconnect(socket);
      console.log(`User with id ${socket.id} disconencted :(. `, reason);
    });

    // Main Message Listener
    socket.on("message", (message) => {
      this.processMessage(message, socket);
    });
  }

  onDisconnect(socket:Socket) {
    // get list of players for on user's room
    let players: Socket[] = [];
    // notify of player leaving

    players.forEach((element: Socket) => {
      element.emit('message', {event: 'disconnect', player:  socket.id})
    });
  }

  listen(port: number) {
    this.http.listen(port, () => {
      console.log(`listening on *: ${port}`);
    });
  }
}

new MainApplication().listen(3000);
