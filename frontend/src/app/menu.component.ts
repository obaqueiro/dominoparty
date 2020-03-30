import { Component } from '@angular/core';
import { MessageService } from './message.service';

@Component({
  selector: 'menu',
  templateUrl: "./menu.component.html",
  styles: [`h1 { font-family: Lato; }`]
})
export class MenuComponent  {
  constructor(private messageService: MessageService) {

  }
  shuffle() {
    setTimeout(()=> {this.messageService.updateMessage('shuffle');},0);
  }
  setup(size:number) {

    setTimeout(()=> {this.messageService.updateMessage(`setup${size}`);},0);
  }
}
