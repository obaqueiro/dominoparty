import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import { Subject } from 'rxjs';
import { MessageService, EventPayload } from './message.service';

@Injectable({
  providedIn: 'root'
})
export class NetworkService {
  private socket: Socket;
  private pendingRoomConnection: string | null = null;
  private isSocketReady = false;
  private pendingMessages: Array<{event: string, room: string, data?: any}> = [];

  constructor(private messageService: MessageService) {
    console.log('NetworkService: Constructor called, initializing socket connection');
    this.socket = io(environment.backendUrl, {
      // Optional: Add transports if restrictive network, though default is usually fine
      // transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('NetworkService: Successfully connected to Socket.IO server. Socket ID:', this.socket.id);
      this.isSocketReady = true;
      
      // Process any pending room connection
      if (this.pendingRoomConnection) {
        console.log('NetworkService: Found pending room connection, connecting to room:', this.pendingRoomConnection);
        this.connect(this.pendingRoomConnection);
        this.pendingRoomConnection = null;
      }

      // Process any pending messages
      while (this.pendingMessages.length > 0) {
        const msg = this.pendingMessages.shift();
        if (msg) {
          console.log('NetworkService: Processing pending message:', msg);
          this.socket.emit('message', JSON.stringify(msg));
        }
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('NetworkService: Socket.IO connection error:', error);
      this.isSocketReady = false;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('NetworkService: Disconnected from Socket.IO server. Reason:', reason);
      this.isSocketReady = false;
      if (reason === 'io server disconnect') {
        console.log('NetworkService: Server disconnected us, attempting to reconnect...');
        this.socket.connect();
      }
    });

    this.socket.on('message', (message: EventPayload) => {
      console.log('NetworkService: Received raw message from server:', message);
      this.messageService.updateMessage(message);
    });
  }

  private sendMessage(event: string, room: string, data?: any) {
    const message = { event, room, data };
    if (this.isSocketReady && this.socket.connected) {
      console.log('NetworkService: Socket ready, sending message:', message);
      this.socket.emit('message', JSON.stringify(message));
    } else {
      console.log('NetworkService: Socket not ready, queueing message:', message);
      this.pendingMessages.push(message);
    }
  }

  connect(room: string) {
    console.log('NetworkService: connect() called for room:', room, 'Socket ready:', this.isSocketReady);
    
    if (this.isSocketReady && this.socket.connected) {
      console.log(`NetworkService: Socket ready. Emitting message to join room: ${room}`);
      this.sendMessage('connect', room);
    } else {
      console.log('NetworkService: Socket not ready yet. Storing room connection request:', room);
      this.pendingRoomConnection = room;
      console.log('NetworkService: Current socket state:', {
        connected: this.socket.connected,
        ready: this.isSocketReady,
        id: this.socket.id,
        pendingRoom: this.pendingRoomConnection,
        pendingMessages: this.pendingMessages.length
      });
    }
  }

  disconnect(room: string) {
    console.log(`NetworkService: Attempting to disconnect from room: ${room}`);
    this.sendMessage('leave', room);
  }

  sendData(room: string, event: string, data: unknown) {
    console.log('NetworkService: sendData called:', { room, event, data });
    this.sendMessage(event, room, data);
  }

  // private processMessage(message: { event: string, data?: any }) {
  //   // This method was handling message processing directly within NetworkService,
  //   // but GameComponent subscribes to getMessage() and has its own processEvent method.
  //   // Keeping it commented out to avoid confusion or double processing.
  //   console.log('NetworkService processMessage (currently commented out):', message);
  //   switch (message.event) {
  //     case 'update':
  //       this.messageService.updateMessage(JSON.stringify(
  //         { event: 'boardUpdate', data: message.data }));
  //       break;
  //     case 'pieceUpdate':
  //       this.messageService.updateMessage(JSON.stringify(
  //         { event: 'pieceUpdate', data: message.data }));
  //       break;
  //     case 'setup':
  //     case 'connected':
  //       this.messageService.updateMessage(JSON.stringify(
  //         { event: 'boardSetup', data: message.data }));
  //       break;
  //   }
  // }
}
