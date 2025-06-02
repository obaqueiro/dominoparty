import { Subject, Observable } from "rxjs";
import { Injectable } from "@angular/core";

// Define the structure of the event payload
export interface EventPayload {
  event: string;
  data?: any;
}

@Injectable({
  providedIn: 'root',
})
export class MessageService {
  private myMessage = new Subject<EventPayload>();

  getMessage(): Observable<EventPayload> {
    return this.myMessage.asObservable();
  }

  updateMessage(message: EventPayload) {
    this.myMessage.next(message);
  }
}