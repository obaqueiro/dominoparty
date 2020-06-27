import { Component } from '@angular/core';
import { MessageService } from './services/message.service';

@Component({
  selector: 'menu',
  templateUrl: "./menu.component.html",
  styles: [`h1 { font-family: Lato; }`]
})
export class MenuComponent  {
  constructor(private messageService: MessageService) {

  }
  shuffle() {
    setTimeout(()=> {this.messageService.updateMessage(JSON.stringify({event:'shuffle'}))},0);
  }
  setup(size:number) {
    setTimeout(()=> {this.messageService.updateMessage(JSON.stringify({event:`setup${size}`}));},0);
  }

  zoomIn() {
    setTimeout(()=> {this.messageService.updateMessage(JSON.stringify({event:`zoomIn`}));},0);
  }
  zoomOut() {
    setTimeout(()=> {this.messageService.updateMessage(JSON.stringify({event:`zoomOut`}));},0);
  }
}
