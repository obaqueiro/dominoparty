import { Subject, Observable } from "rxjs";
import { Injectable } from "@angular/core";

@Injectable({
  providedIn: 'root',
})
export class MessageService {
  private myMessage = new Subject<string>();

  getMessage(): Observable<string> {
    return this.myMessage.asObservable();
  }

  updateMessage(message: string) {
    this.myMessage.next(message);
  }
}