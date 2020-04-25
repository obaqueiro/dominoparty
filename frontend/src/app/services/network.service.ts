import { MessageService } from './message.service';
import { environment } from './../../environments/environment';
import { Injectable } from '@angular/core';
import * as io from 'socket.io-client';

@Injectable({
  providedIn: 'root'
})
export class NetworkService {
  socket;

  constructor(private messageSerivce: MessageService) { }

  connect(room: string) {
    this.socket = io(environment.backendUrl);
    this.socket.on('message', this.processMessage.bind(this));
    this.socket.emit('message', JSON.stringify({ event: 'connect', room: room }));
  }

  private processMessage(message: { event: string, data?: any }) {
    console.log(message);
    switch (message.event) {
      case 'update':
        this.messageSerivce.updateMessage(JSON.stringify(
          { event: 'boardUpdate', data: message.data }));
        break;
      case 'pieceUpdate':
        this.messageSerivce.updateMessage(JSON.stringify(
          { event: 'pieceUpdate', data: message.data }));
        break;
      case 'setup':
      case 'connected':
        this.messageSerivce.updateMessage(JSON.stringify(
          { event: 'boardSetup', data: message.data }));
        break;
    }
  }

  sendData(room: string, event: string, data) {
    this.socket.emit('message', JSON.stringify({ event: event, room: room, data: data }));
  }
}
