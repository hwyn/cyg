import { Injectable } from '@hwy-fm/di';

@Injectable()
export class Message {
  private receiveMap: Map<string, any> = new Map();
  constructor() {
    window.addEventListener('message', ({ data: { type, returnType, data } }) => {
      const receive = this.receiveMap.get(type);
      if (!receive) return;
      const result = receive(data);
      if (!returnType) return;
      if (result.then) return result.then((value: any) => this.send(returnType, value));
      this.send(returnType, result);
    });
  }

  async send<T = any>(type: string, data: any, needReturn?: boolean): Promise<T> {
    if (!needReturn) return window.postMessage({ type, data }) as T;

    const _type = Math.random().toString().replace('.', '');
    return new Promise((resolve) => {
      const listener = ({ data: { type: returnType, data } }: MessageEvent) => {
        if (returnType !== _type) return;
        window.removeEventListener('message', listener);
        resolve(data);
      };
      window.addEventListener('message', listener);
      window.postMessage({ type, data, returnType: _type });
    });
  }

  receive(type: string, listener: (data: any) => void) {
    this.receiveMap.set(type, listener);
  }
}
