import { Injector } from '@hwy-fm/di';

import { Message } from './message';

declare const window: any;

const _setTimeout = window.setTimeout;
const _clearTimeout = window.clearTimeout;
window.__record__symbol__setTimeout__ = _setTimeout;

class ProxyTimeout {
  protected monitorTimer = -1;
  protected openRequestProxy = false;
  protected timeoutPending: any[] = [];
  protected resourcePending: number = 0;

  constructor() {
    const message = Injector.create([Message]).get(Message);
    this.proxySetTimeout();
    this.proxyFetch();
    this.proxyXMLHttpRequest();
    this.proxyAppendScript();
    message.receive('__record__timeout__pending__', async (endDate: number) => this.loopTimeoutPending(endDate));
    message.receive('__record__timeout__config__', async ({ openRequestProxy, monitorTimer }) => {
      this.monitorTimer = monitorTimer;
      this.openRequestProxy = openRequestProxy;
    });
  }

  protected async loopTimeoutPending(endDate: number): Promise<number> {
    if (this.resourcePending !== 0 && this.openRequestProxy) {
      await new Promise((resolve) => _setTimeout(resolve, 100));
      return this.loopTimeoutPending(endDate);
    }
    const dateNow = Date.now();
    if (dateNow - endDate > 10 || !this.timeoutPending.length) return 0;
    const timer = Math.max(dateNow + 5, ...this.timeoutPending.map(({ timer }: any) => timer)) - dateNow;
    await new Promise((resolve) => _setTimeout(resolve, timer));
    return this.loopTimeoutPending(endDate);
  }

  protected spliceTimeoutPending(id: any) {
    const indexOf = this.timeoutPending.findIndex(({ st }: any) => st === id);
    return indexOf !== -1 ? this.timeoutPending.splice(indexOf, 1)[0].st : id;
  }

  protected proxySetTimeout() {
    const _this = this;
    const global = window as any;
    const setTimeout = global.setTimeout;
    const clearTimeout = global.clearTimeout;
    global.clearTimeout = (id: any) => clearTimeout(this.spliceTimeoutPending(id));
    global.setTimeout = function (callback: any, ...args: any[]) {
      let st: any;
      const timer = args[0] ?? 0;
      const needAdd = timer <= _this.monitorTimer && typeof callback === 'function';
      const handler = !needAdd ? callback : function (this: any, ...args: any[]) {
        _this.spliceTimeoutPending(st);
        return callback.call(this, ...args);
      }
      st = setTimeout.call(this, handler, ...args);
      if (needAdd) _this.timeoutPending.push({ st, date: timer, timer: Date.now() + timer });
      return st;
    }
  }

  protected addResourceEventListener(ele: any, eventTypes: string[]) {
    const end = () => this.resourcePending -= 1;
    this.resourcePending += 1;
    eventTypes.forEach((type: string) => ele.addEventListener(type, end));
  }

  protected proxyXMLHttpRequest() {
    const _this = this;
    const originalXhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (...args: any[]) {
      _this.addResourceEventListener(this, ['load', 'error', 'abort']);
      return originalXhrSend.apply(this, args as any);
    }
  }

  protected proxyFetch() {
    const _this = this;
    const originFetch = window.fetch;
    const originMethods = ['json', 'text', 'blob', 'arrayBuffer', 'formData'];
    const wrapResponse = (response: Response & { [key: string]: any }, handler: () => void) => {
      let st = _setTimeout(handler, 50);
      originMethods.forEach((method) => {
        const originMethod = response[method];
        response[method] = function (...args: any[]) {
          if (st) st = _clearTimeout(st);
          return originMethod.apply(this, args).finally(handler);
        }
      });
      return response;
    }
    window.fetch = function (...args: any) {
      let consumed = false;
      const handler = () => !consumed && (consumed = true, _this.resourcePending -= 1);
      _this.resourcePending += 1;
      return originFetch.apply(this, args)
        .then((res: Response) => wrapResponse(res, handler))
        .catch((e: Error) => {
          handler();
          throw e;
        });
    }
  }

  private proxyAppendScript() {
    const originalAppendChild = Element.prototype.appendChild;
    const originalInsertBefore = Element.prototype.insertBefore;
    const addLoadListener = (node: HTMLElement) => {
      if (node.nodeType === Node.ELEMENT_NODE && node?.tagName?.toLowerCase() === 'script' && !!node.getAttribute('src')) {
        this.addResourceEventListener(node, ['load', 'error']);
      }
    }

    Element.prototype.appendChild = function <T extends Node>(node: T): T {
      addLoadListener(node as unknown as HTMLElement);
      return <T>originalAppendChild.call(this, node);
    }

    Element.prototype.insertBefore = function <T extends Node>(node: T, child: Node | null): T {
      addLoadListener(node as unknown as HTMLElement);
      return <T>originalInsertBefore.call(this, node, child);
    }
  }
}

export const timeout = new ProxyTimeout();
