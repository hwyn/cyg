import { ApplicationPlugin, Input } from '@hwy-fm/csr';
import { Subject } from 'rxjs';

import { _document as document } from './utility';

@ApplicationPlugin()
export class Record {
  private _status = false;
  private record: any[] = [];
  private startDate: number;
  private active: any[] = [];
  private retryCount = 30;
  private inputEvent = ['keydown', 'keyup', 'input', 'blur', 'focus', 'mouseup', 'mousedown', 'click'];
  private eventKeys = ['code', 'key', 'keyCode', 'ctrlKey', 'charCode', 'altKey', 'metaKey', 'repeat', 'shiftKey', 'which', 'data'];
  public runComplete = new Subject();
  @Input('skipSelector') private skipSelector: RegExp[] = [];
  @Input('ignoreSelector') private ignoreSelector: string[] = [];
  @Input('loadingSelector') private loadingSelector: string[] = [];

  private getXmlPath(dom: HTMLElement) {
    const tagList = [];

    while (![document.body, null].includes(dom)) {
      const parentNode = dom.parentNode as HTMLElement;
      const indexOf = Array.from(parentNode?.children || []).indexOf(dom);
      tagList.unshift(dom.tagName + `:nth-child(${(indexOf + 1) || 1})`);
      if (parentNode === document.body) {
        tagList[0] = dom.className ? [dom.tagName, ...dom.className.split(' ')].join('.') : tagList[0];
        break;
      }
      dom = parentNode;
    }
    return [dom ? 'body' : '', ...tagList].join('>').toLowerCase();
  }

  private isElementOutOfViewport(element: Element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.top > window.innerHeight ||
      rect.bottom < 500 ||
      rect.left > window.innerWidth ||
      rect.right < 0
    );
  }

  private setTimeout(handler: any, timer: any) {
    return setTimeout(handler, timer, this);
  }

  private checkFileInput(dom: HTMLElement) {
    return dom.tagName === 'INPUT' && (dom as HTMLInputElement).type === 'file';
  }

  private checkIsXmlPath(regexps: RegExp[], xmlPath: string) {
    return regexps.some((regexp) => regexp.test(xmlPath));
  }

  private factoryAddEvent(dom: HTMLElement | Document | Window, useCapture = false, check?: (event: Event) => boolean) {
    return (type: string, listener: any, _useCapture = useCapture, _check = check) => {
      const fn = (event: Event) => {
        if (!this.status || this.ignoreSelector.includes(((event.target as HTMLElement)?.tagName || '').toLocaleLowerCase()) || _check && !_check(event)) return;
        listener(event);
      }
      dom.addEventListener(type, fn, _useCapture);
      return () => dom.removeEventListener(type, fn, _useCapture);
    };
  }

  private addRecodeItem(item: any) {
    let timer = this.startDate ? Date.now() - this.startDate : 0;
    this.startDate = Date.now();
    this.record.push(Object.assign(item, { timer }));
  }

  private filterRecord(event: Event) {
    const lastItem = this.record.at(-1);
    const { type, target, timeStamp } = event as unknown as { type: string, timeStamp: number, target: HTMLElement };
    const someTrigger = lastItem?.timeStamp === timeStamp && lastItem?.type === type;
    if (!someTrigger && lastItem) delete lastItem.timeStamp;
    return someTrigger && this.checkFileInput(target);
  }

  private inputFile(event: Event, item: any) {
    const { type, target } = event as unknown as { type: string, target: HTMLInputElement };
    if (type === 'input' && this.checkFileInput(event.target as HTMLElement) && (target.files as any)[0]) {
      const reader = new FileReader();
      const file = (target.files as any)[0];
      reader.onload = (e) => {
        item.fileBase64 = e.target?.result;
        item.fileName = file.name;
      }
      reader.readAsDataURL(file);
    }
    return item;
  }

  private addInputFile(dom: HTMLInputElement, item: any) {
    const { fileBase64, fileName } = item;
    const [data, str] = fileBase64.split(',');
    const byteString = atob(str);
    const dataTransfer = new DataTransfer();
    const type = data.replace(/data:([^;]*);.*/, '$1');
    const byteArray = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) byteArray[i] = byteString.charCodeAt(i);
    dataTransfer.items.add(new File([new Blob([byteArray], { type })], fileName, { type }));
    dom.files = dataTransfer.files;
  }

  private createActive(dom: HTMLElement, existEvent: string[] = [], check: (event: Event) => boolean = (event: Event) => !this.filterRecord(event)) {
    const xmlPath = this.getXmlPath(dom);
    const changeEvent = ['keydown', 'keyup', 'input'];
    const keys = ['INPUT', 'BODY'].includes(dom.tagName) ? this.eventKeys : [];
    const addEventListener = this.factoryAddEvent(dom, undefined, check);
    const handler = (event: Event) => {
      const type = event.type;
      const pending = this.record[this.record.length - 1]?.dom;
      const e = changeEvent.includes(type) ? keys.reduce((obj, key) => Object.assign(obj, { [key]: (event as any)[key] }), {}) : undefined;
      const item: any = { type, dom: xmlPath, value: (dom as HTMLInputElement).value, event: e, timeStamp: event.timeStamp };
      if (type === 'mousedown' && pending !== xmlPath && !document.contains(document.querySelector(pending))) Object.assign(item, { pending });
      if (type === 'scroll') Object.assign(item, { value: (event.target as HTMLElement).scrollTop });
      this.addRecodeItem(this.inputFile(event, item));
    }
    const fns = existEvent.map((type: any) => addEventListener(type, handler));
    return () => document.querySelector(xmlPath) && fns.forEach((f) => f());
  }

  private skipInputProcess(list: any[]) {
    const skipList = [];
    const filterEvent = ['keydown', 'keyup', 'input'];
    while (this.checkIsXmlPath([/>(input|textarea)[^>]*$/], list[0]?.dom) && filterEvent.includes(list[0]?.type)) skipList.push(list.shift());
    while (skipList.length && filterEvent.length) {
      const item = skipList.pop();
      const indexOf = filterEvent.indexOf(item.type);
      if (indexOf !== -1) {
        filterEvent.splice(indexOf, 1);
        list.unshift(item);
      }
    }
  }

  private next(list: any[] = [], timer?: number) {
    list.shift();
    this.skipInputProcess(list);
    this.setTimeout(() => this.run(list), Math.min(timer ?? Infinity, list[0]?.timer));
  }

  private clearMonitor(endLength: number = 0) {
    while (this.active.length > endLength) this.active.shift().clear();
  }

  private addMonitor(target: EventTarget, extraEvent: string[] = [], check?: (event: Event) => boolean) {
    if (this.active.find(({ target: t }) => t === target)) return;
    this.active.push({ target, clear: this.createActive(target as HTMLElement, [...this.inputEvent, ...extraEvent], check) })
  }

  private retry(dom: HTMLElement | null, { pending }: any) {
    return !dom || pending && document.contains(document.querySelector(pending));
  }

  private skip(dom: HTMLElement, item: any, retry: number) {
    if (this.loadingSelector.some((selector) => item.dom.indexOf(selector) !== -1)) return true;
    return dom ? this.checkIsXmlPath(this.skipSelector, item.dom) : 'mousedown' !== item.type && retry < this.retryCount;
  }

  private loading() {
    return this.loadingSelector.some((selector) => !!document.querySelector(selector));
  }

  run(list: any[], retry = this.retryCount, isPending?: boolean) {
    let dom;
    const item = list[0];
    if (!item) this.runComplete.next(true);
    if (!item || retry < 0) return retry < 0 && this.runComplete.next(item);
    if (this.loading()) return this.setTimeout(() => this.run(list, retry), 200);
    if (this.skip(dom = document.querySelector(item.dom), item, retry)) return this.next(list, 0);
    if (this.retry(dom, item)) return this.setTimeout(() => this.run(list, --retry), 500);
    if (item.pending && !isPending) return this.setTimeout(() => this.run(list, retry, true), 200);

    if (item.type === 'mousedown' && this.isElementOutOfViewport(dom)) dom.scrollIntoView({ block: "center" });
    if (['mouseup', 'blur', 'focus', 'mousedown', 'click'].includes(item.type)) {
      dom.dispatchEvent(new MouseEvent(item.type, { bubbles: true, cancelable: true }));
    } else if (['keydown', 'keyup', 'input', 'change'].includes(item.type)) {
      if (this.checkFileInput(dom) && item.type === 'input') this.addInputFile(dom, item);
      else if (item.type !== 'change') dom.value = item.value;
      dom.dispatchEvent(new KeyboardEvent(item.type, Object.assign({}, item.event, { bubbles: true })));
    } else if (item.type === 'scroll') {
      dom.scrollTop = item.value;
      dom.dispatchEvent(new Event(item.type, { bubbles: true, cancelable: true }));
    }
    return this.next(list, ['mousedown', 'scroll'].includes(list[1]?.type) ? 50 : 0);
  }

  async register() {
    const inputTag = ['INPUT', 'TEXTAREA'];
    const addEventListener = this.factoryAddEvent(document, true);
    addEventListener('mousedown', ({ target }: any) => this.addMonitor(target));
    addEventListener('mouseup', () => this.clearMonitor(1), false);
    addEventListener('focusin', ({ target }: any) => inputTag.includes(target.tagName) && this.addMonitor(target));
    addEventListener('click', ({ target }: any) => this.checkFileInput(target) && this.addMonitor(target, ['change']), false);
    addEventListener('scroll', ({ target }: any) => this.addMonitor(target, ['scroll']), true, ({ target }: any) => /pdf-viewer/.test(this.getXmlPath(target)));
    this.createActive(document.body, ['keydown', 'keyup'], ({ target }: any) => !inputTag.includes(target.tagName));
  }

  start() {
    this._status = true;
    this.startDate = Date.now();
  }

  stop() {
    this._status = false;
    this.clearMonitor(0);
  }

  getRecord() {
    return this.record;
  }

  clearRecord() {
    this.record = [];
  }

  setRecord(list: any[]) {
    this.record = list;
  }

  get status() {
    return this._status;
  }
}
