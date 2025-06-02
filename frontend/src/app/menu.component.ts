import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageService } from './services/message.service';

@Component({
  selector: 'menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./menu.component.html",
  styles: [`h1 { font-family: Lato; }`]
})
export class MenuComponent {
  constructor(private messageService: MessageService) {}

  shuffle(): void {
    setTimeout(() => this.messageService.updateMessage({event: 'shuffle'}), 0);
  }

  setup(size: number): void {
    setTimeout(() => this.messageService.updateMessage({event: `setup${size}`}), 0);
  }

  zoomIn(): void {
    setTimeout(() => this.messageService.updateMessage({event: 'zoomIn'}), 0);
  }

  zoomOut(): void {
    setTimeout(() => this.messageService.updateMessage({event: 'zoomOut'}), 0);
  }
}
