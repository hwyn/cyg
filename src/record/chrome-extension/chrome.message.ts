import { Injectable } from '@hwy-fm/di';

@Injectable()
export class ChromeMessage {
  private receiveMap: Map<string, any> = new Map();

  constructor() {
    if (chrome?.runtime) this.onMessage();
  }

  private onMessage() {
    chrome.runtime.onMessage.addListener(({ type, data }: any) => {
      const receive = this.receiveMap.get(type);
      if (receive) receive(data);
    });
  }

  async send<T = any>(type: string, data: any): Promise<T> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, data }, (result: any) => {
        if (chrome.runtime.lastError) {
          console.error('消息发送失败:', chrome.runtime.lastError);
          return reject(chrome.runtime.lastError);
        }
        resolve(result);
      });
    });
  }

  async receive(type: string, listener: (data: any) => void) {
    this.receiveMap.set(type, listener);
  }
}