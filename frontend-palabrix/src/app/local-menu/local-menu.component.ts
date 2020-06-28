import { Component, OnInit } from '@angular/core';
import { MessageService } from '../services/message.service';

@Component({
  selector: 'local-menu',
  templateUrl: './local-menu.component.html',
  styleUrls: ['./local-menu.component.scss']
})
export class LocalMenuComponent implements OnInit {

  constructor(private messageService: MessageService) { }

  ngOnInit(): void {

  }

  onArrangeTiles() {
    this.messageService.updateMessage(JSON.stringify({event:'arrangeLocalTiles'}));
  }
}
