import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageService } from '../services/message.service';

@Component({
  selector: 'floating-controls',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="control-trigger" (mouseenter)="showControls = true" (mouseleave)="showControls = false">
      <div class="trigger-icon">⚙️</div>
      <div class="control-panel" [class.visible]="showControls">
        <div class="button-group">
          <button class="primary" (click)='setup(9)'>
            <span>🎲</span> Setup 9 Board
          </button>
          <button class="primary" (click)='setup(12)'>
            <span>🎲</span> Setup 12 Board
          </button>
          <button class="primary" (click)='setup(15)'>
            <span>🎲</span> Setup 15 Board
          </button>
          <button class="secondary" (click)='shuffle()'>
            <span>🔄</span> Shuffle
          </button>
        </div>
        <div class="zoom-controls">
          <span>🔍</span>
          <button (click)='zoomIn()'>+</button>
          <button (click)='zoomOut()'>-</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .control-trigger {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000;
    }

    .trigger-icon {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #2c3e50, #3498db);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      transition: all 0.3s ease;
      font-size: 20px;

      &:hover {
        transform: scale(1.1);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }
    }

    .control-panel {
      position: absolute;
      top: 50px;
      right: 0;
      background: linear-gradient(135deg, #2c3e50, #3498db);
      border-radius: 8px;
      padding: 15px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      opacity: 0;
      visibility: hidden;
      transform: translateY(-10px);
      transition: all 0.3s ease;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 200px;

      &.visible {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
      }
    }

    .button-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.1);
      color: white;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;

      &:hover {
        background: rgba(255, 255, 255, 0.2);
        transform: translateY(-1px);
      }

      &:active {
        transform: translateY(1px);
      }

      &.primary {
        background: #4CAF50;
        &:hover {
          background: #388E3C;
        }
      }

      &.secondary {
        background: #2196F3;
        &:hover {
          background: #1976D2;
        }
      }
    }

    .zoom-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;

      button {
        padding: 4px 12px;
        font-size: 16px;
        font-weight: bold;
        width: auto;
      }
    }
  `]
})
export class FloatingControlsComponent {
  showControls = false;

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