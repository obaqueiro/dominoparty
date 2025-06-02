import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'room-selector-component',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './room-selector.component.html',
  styleUrls: ['./room-selector.component.scss']
})
export class RoomSelectorComponent {
  roomName: string = '';

  constructor(private router: Router) {}

  onRoomButtonClick(): void {
    console.log('Navigating to room:', this.roomName);
    this.router.navigate(['/' + this.roomName]);
  }
}
