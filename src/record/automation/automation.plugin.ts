import { ApplicationPlugin } from '@hwy-fm/csr';
import { Inject } from '@hwy-fm/di';
import html2canvas from 'html2canvas';

import { Message } from '../message';

@ApplicationPlugin()
export class AutomationPlugin {
  @Inject(Message) message: Message;
  public isAutomation: boolean;

  updateInfo(action: string, data?: any) {
    if (this.isAutomation) {
      this.message.send('__record__automation__info__', { action, data });
    }
  }

  async getRecordInfo() {
    return this.isAutomation ? await this.message.send('__record__status__init__', {}, true) : { status: 0 };
  }

  async screenshot(execName: string = '') {
    const date = new Date();
    const name = `${execName ? execName + '_' : ''}${date.getFullYear()}${('0' + date.getMonth()).slice(-2)}${('0' + date.getDay()).slice(-2)}_${('0' + date.getHours()).slice(-2)}_${('0' + date.getMinutes()).slice(-2)}_${('0' + date.getSeconds()).slice(-2)}.${('00' + date.getMilliseconds()).slice(-3)}.png`;
    if (this.isAutomation) return this.message.send('__record__automation__info__', { action: 'screenshot', data: name }, true);

    const { scrollWidth, scrollHeight } = document.documentElement;
    const link = document.createElement('a');
    const canvas = await html2canvas(document.documentElement.querySelector('body')!, { useCORS: true, windowWidth: scrollWidth, windowHeight: scrollHeight });
    link.href = canvas.toDataURL('image/png');
    link.download = name;
    link.click();
  }

  async register() {
    this.isAutomation = await this.message.send<boolean>('__record__check__automation__', undefined, true);
  }
}
