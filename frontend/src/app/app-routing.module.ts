import { GameComponent } from './game/game.component';
import { RoomSelectorComponent } from './room-selector-component/room-selector.component';
import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';


const routes: Routes = [
  { path: '', component: RoomSelectorComponent },
  { path: '**', component: GameComponent },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
