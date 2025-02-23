const _setTimeout = window.setTimeout;
(window as any).__record__symbol__setTimeout = _setTimeout;

class ProxyTimeout {
  protected monitorTimer = 700;
  protected timeoutPending: any = [];

  constructor() {
    this.proxySetTimeout();
    window.addEventListener('message', ({ data: { type, returnType, endDate } }) => {
      if (type === '__record__timeout__pending') this.sendTimeoutPending(returnType, endDate);
    });
  }

  protected sendTimeoutPending(type: string, endDate: number) {
    if (Date.now() - endDate > 10) return;
    if (!this.timeoutPending.length) return window.postMessage({ type, timer: 0 });
    const dateNow = Date.now();
    const timer = Math.max(dateNow + 5, ...this.timeoutPending.map(({ timer }: any) => timer)) - dateNow;
    _setTimeout(() => this.sendTimeoutPending(type, endDate), timer);
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
    return this;
  }
}

export const timeout = new ProxyTimeout();
