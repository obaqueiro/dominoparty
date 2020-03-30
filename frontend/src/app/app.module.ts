import { MessageService } from './message.service';
import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { MenuComponent } from './menu.component';
import { AngularResizedEventModule } from 'angular-resize-event';

@NgModule({
  declarations: [
    AppComponent,
    MenuComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    AngularResizedEventModule
  ],
  providers: [MessageService],
  bootstrap: [AppComponent]
})
export class AppModule { }
