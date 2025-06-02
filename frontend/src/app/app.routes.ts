import { Routes } from '@angular/router';
import { RoomSelectorComponent } from './room-selector-component/room-selector.component';
import { GameComponent } from './game/game.component';

export const routes: Routes = [
  { path: '', component: RoomSelectorComponent },
  { path: '**', component: GameComponent }
]; 