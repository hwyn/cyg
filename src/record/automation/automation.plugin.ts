import { ApplicationPlugin, Input } from '@hwy-fm/csr';
import { Inject } from '@hwy-fm/di';
import html2canvas from 'html2canvas';

import { Message } from '../message';
import { _document as document } from '../utility';
import { ChromeMessage } from '../chrome-extension/chrome.message';

@ApplicationPlugin()
export class AutomationPlugin {
  public isAutomation: boolean;
  @Inject(Message) windowMessage: Message;
  @Inject(ChromeMessage) chromeMessage: ChromeMessage;
  @Input('fullPageScreen') fullPage = false;
  @Input('isChromeExtension') isChromeExtension = typeof chromeCache !== 'undefined';

  get message() {
    if (this.isAutomation) return this.windowMessage;
    if (this.isChromeExtension) return this.chromeMessage;
    return null;
  }

  protected pageFull() {
    if (!this.fullPage) return () => void (0);

    const list: any[] = [];
    const stack = [document.documentElement];
    while (stack.length > 0) {
      let ele = stack.shift()!;
      if (ele.nodeType !== 1) continue;
      stack.push(...Array.from(ele.childNodes) as HTMLElement[]);
      if (ele.clientHeight === ele.scrollHeight) continue;
      while (![document, null].includes(ele as any)) {
        list.unshift({ ele, height: ele.style.height, overflowY: ele.style.overflowY, scrollTop: ele.scrollTop, scrollLeft: ele.scrollLeft });
        ele.style.height = `auto`;
        ele.style.overflowY = 'hidden';
        ele.scrollTo(0, 0);
        ele = ele.parentNode as HTMLElement;
      }
    }
    const maxHeight = list.reduce((max, { ele }) => Math.max(ele.getClientRects()[0]?.bottom ?? 0, max), 0);
    document.documentElement.style.height = `${maxHeight}px`;
    return async () => {
      list.forEach(({ ele, height, overflowY, scrollTop, scrollLeft }) => {
        ele.style.height = height;
        ele.style.overflowY = overflowY;
        ele.scrollTo(scrollLeft, scrollTop);
      });
    };
  }

  updateInfo(action: string, data?: any) {
    this.message?.send('__record__automation__info__', { action, data });
  }

  async getRecordInfo() {
    return await this.message?.send('__record__automation__info__', { action: 'get' }, true) ?? { status: 0 };
  }

  async screenshot(execName: string = '') {
    const date = new Date();
    const resetPage = this.pageFull();
    const name = `${execName ? execName + '_' : ''}${date.getFullYear()}${('0' + date.getMonth()).slice(-2)}${('0' + date.getDay()).slice(-2)}_${('0' + date.getHours()).slice(-2)}_${('0' + date.getMinutes()).slice(-2)}_${('0' + date.getSeconds()).slice(-2)}.${('00' + date.getMilliseconds()).slice(-3)}.png`;
    if (this.isAutomation) {
      await this.message?.send('__record__automation__info__', { action: 'screenshot', data: { name, fullPage: this.fullPage } }, true);
    } else {
      const { scrollWidth, scrollHeight } = document.documentElement;
      const link = document.createElement('a');
      const canvas = await html2canvas(document.documentElement.querySelector('body')!, { useCORS: true, windowWidth: scrollWidth, windowHeight: scrollHeight });
      link.href = canvas.toDataURL('image/png');
      link.download = name;
      link.click();
    }
    resetPage();
  }

  async register() {
    this.isAutomation = await this.windowMessage.send<boolean>('__record__check__automation__', undefined, true) || false;
  }
}
