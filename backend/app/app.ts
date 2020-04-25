import * as express from "express";
import { Socket } from "socket.io";
import  redis = require('redis');

class MainApplication {
  app;
  http;
  io;
  redisHost = 'redis';
  redis: redis.RedisClient;

  constructor() {
    this.app = express();
    this.http = require("http").Server(this.app);
    // set up socket.io and bind it to our
    // http server.
    this.io = require("socket.io")(this.http);

    this.app.get("/", (_: any, res: any) => {
      res.send({ message: 'DominoParty API... Hello hacker!' });
    });
    // whenever a user connects on port 3000 via
    // a websocket, log that a user has connected
    this.io.on("connection", this.onConnection.bind(this));

    this.redis = redis.createClient({port:6379, host:this.redisHost});
  }

  processMessage(message: string, socket: Socket) {
    let jsonMsg: { event:string, room: string , data?:any} = JSON.parse(message);
    console.log("received message",jsonMsg);
      let event = jsonMsg.event;
    console.log(event);
      switch (event) {
        case 'connect':
          this.onPlayerConnect(jsonMsg.room, socket);
          break;
        case 'update':
        case 'setup':
          this.onPlayerUpdate(jsonMsg.room, jsonMsg.data, socket);
          break;
        case 'pieceUpdate':
          console.log("updating a piece");
          this.onPieceUpdate(jsonMsg.room, jsonMsg.data, socket);
        break;
      }
  }

  // When a player connects a room, add the player to the room and notify other players
  onPlayerConnect(roomName: string, socket: Socket) {
    console.log(`Player ${socket.id} connecting to room: ` + roomName);
    let roomData: {boardData: any, players: any} = {boardData:{}, players:[]};
    // get room data from DB
    this.redis.get(roomName, (err, data) => {
      if (data){
        let room = JSON.parse(data);
         // construct response payload with room data
         roomData = {
          boardData: room.boardData,
          players: room.players || []
        };
        // notify other players of player joining the room
        if (room.players) {
          let availablePlayers: string[] = [];
          room.players.forEach(player => {
            if (this.io.sockets.connected[player]) {
              availablePlayers.push(player);
              this.io.sockets.connected[player].emit('message', { event: 'playerConnected' });
            }
          });

          roomData.players = availablePlayers;
          roomData.players.push(socket.id);
          this.redis.set(roomName, JSON.stringify(roomData));
          console.log(`Players in rom ${roomName} ${availablePlayers}`)
          socket.emit('message', { event: 'connected', data: roomData.boardData });
        }
      }
      else{
        console.log('Didnt find room in DB, inserting')
        this.redis.set(roomName, JSON.stringify({ room: roomName, players: [socket.id] }));
      }
    });
  }


  onPieceUpdate(roomName: string, 
    pieceData: {event:string, piece:string, name:string, 
      state:{action?:string, x?:number, y?:number, rotation?:number, flipped:boolean}},
     socket: Socket) {
    // update the room data in the DB
    this.redis.get(roomName, (err, data) => {
      let room: {
        players:any[], 
        boardData:{ event: string, 
          tiles:any[], 
          center:{x:number ,y:number}, trains:any[]}} = JSON.parse(data);

      switch(pieceData.piece) {
        case 'train':
          console.log("looking for train...")
          console.log(pieceData);
          console.log(room.boardData.trains)
          let train = room.boardData.trains.find(train => train.name == pieceData.name);
          if(train) {
            console.log('updating train ', train);
            train.x = pieceData.state.x;
            train.y = pieceData.state.y;
          }
          break;
        case 'center':
          room.boardData.center.x = pieceData.state.x;
          room.boardData.center.y = pieceData.state.y;
          break;

        case 'tile':
          console.log("looking for tile...");
          console.log(pieceData);
          let tile = room.boardData.tiles.find(tile => tile.name == pieceData.name);

          switch(pieceData.state.action) {
            case 'move':
              console.log(room.boardData.tiles);
              if (tile) {
                console.log('updating tile', tile);
                tile.x = pieceData.state.x;
                tile.y = pieceData.state.y;
                if (pieceData.state.rotation) {
                  tile.rotation = pieceData.state.rotation
                }
                if(pieceData.state.flipped){
                  tile.flipped = pieceData.state.flipped
                }
              }
              break;
            case 'create':
              room.boardData.tiles.push({
                rotation: pieceData.state.rotation,
                x: pieceData.state.x,
                y: pieceData.state.y,
                flipped: pieceData.state.flipped,
                name: pieceData.name
              });
              break;
            case 'destroy':
              room.boardData.tiles = room.boardData.tiles.filter(tile => tile.name != pieceData.name);
              break;
          }
          break;
      }

      room.players = room.players.filter(player => {
        if (!this.io.sockets.connected[player]) { return false; }

        if (player == socket.id) { return true; }
        console.log('Sending message to player ' + player)
        this.io.sockets.connected[player].emit('message',
          { event: pieceData.event, data: pieceData });
        return true;
      });
      this.redis.set(roomName, JSON.stringify(room));
    });
  }

  onPlayerUpdate(roomName: string, newBoardData: any, socket: Socket) {
    console.log(roomName);
    // update the room data in the DB
    this.redis.get(roomName, (err, data) => {
      let room = JSON.parse(data);
      room.boardData = newBoardData;

      room.players = room.players.filter(player => {
        if (!this.io.sockets.connected[player]) { return false; }

        if (player == socket.id) { return true; }
        console.log('Sending message to player ' + player)
        this.io.sockets.connected[player].emit('message',
          { event: newBoardData['event'], data: newBoardData });
        return true;
      });
      this.redis.set(roomName, JSON.stringify(room));
      console.log("Room now has:",room);
    });
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
