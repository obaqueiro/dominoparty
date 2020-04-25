import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'room-selector-component',
  templateUrl: './room-selector.component.html',
  styleUrls: ['./room-selector.component.scss']
})
export class RoomSelectorComponent implements OnInit {
  roomName: string;

  constructor() { }

  ngOnInit(): void {
  }

  onRoomButtonClick() {
    console.log(this.roomName);
    window.location.href = '/' + this.roomName;
  }

}
