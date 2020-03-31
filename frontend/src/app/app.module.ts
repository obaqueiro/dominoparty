import { MessageService } from './message.service';
import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { MenuComponent } from './menu.component';
import { AngularResizedEventModule } from 'angular-resize-event';
import { RoomSelectorComponent } from './room-selector-component/room-selector.component';
import { GameComponent } from './game/game.component';

import { FormsModule } from '@angular/forms';

@NgModule({
  declarations: [
    AppComponent,
    MenuComponent,
    RoomSelectorComponent,
    GameComponent
  ],
  imports: [
    BrowserModule,    
    AngularResizedEventModule,
    AppRoutingModule,
    FormsModule
  ],
  providers: [MessageService],
  bootstrap: [AppComponent]
})
export class AppModule { }
