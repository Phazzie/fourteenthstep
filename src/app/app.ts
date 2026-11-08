import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MeetingRoomScreen } from './04-meeting-room-screen';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [MeetingRoomScreen],
  template: `<app-meeting-room-screen />`,
  styleUrl: './app.css',
})
export class App {}
