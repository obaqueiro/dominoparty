import { MessageService } from './services/message.service';
import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { MenuComponent } from './menu.component';
import { AngularResizedEventModule } from 'angular-resize-event';
import { RoomSelectorComponent } from './room-selector-component/room-selector.component';
import { GameComponent } from './game/game.component';

import { FormsModule } from '@angular/forms';
import { LocalMenuComponent } from './local-menu/local-menu.component';

@NgModule({
  declarations: [
    AppComponent,
    MenuComponent,
    RoomSelectorComponent,
    GameComponent,
    LocalMenuComponent
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
