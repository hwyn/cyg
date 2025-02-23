import { Injectable, Injector } from '@hwy-fm/di';

import { Message } from '../message';

declare const window: any;

@Injectable()
export class AutomationMessage {
  private automation: any;
  constructor() {
    this.automation = window.__record__automation__message__;
    this.addEventListener();
  }

  addEventListener() {
    const message = Injector.create([Message]).get(Message);
    message.receive('__record__automation__info__', (data: any) => this.automation(data));
    message.receive('__record__check__automation__', () => !!this.automation);
    message.receive('__record__status__init__', async () => ({ isAutomation: true, ... await this.automation({ action: 'get' }) }));
  }
}

export const autoMessage = new AutomationMessage();