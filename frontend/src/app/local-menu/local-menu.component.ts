import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageService } from '../services/message.service';

@Component({
  selector: 'local-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './local-menu.component.html',
  styleUrls: ['./local-menu.component.scss']
})
export class LocalMenuComponent {
  constructor(private messageService: MessageService) {}

  onArrangeTiles(): void {
    this.messageService.updateMessage(JSON.stringify({event: 'arrangeLocalTiles'}));
  }
}
