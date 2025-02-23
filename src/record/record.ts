import { ApplicationPlugin, Input } from '@hwy-fm/csr';
import { Subject } from 'rxjs';

import { RecordList } from './record.list';
import { shadowBody, _document as document, _setTimeout as setTimeout } from './utility';

type EventHTML = HTMLElement | Document | Window;

@ApplicationPlugin()
export class Record {
  private startDate: number;
  private active: any[] = [];
  private retryCount = 30;
  private record: RecordList = this.createRecordList();
  private inputEvent = ['keydown', 'keyup', 'input', 'blur', 'focus', 'mouseup', 'mousedown', 'click'];
  private eventKeys = ['code', 'key', 'keyCode', 'ctrlKey', 'charCode', 'altKey', 'metaKey', 'repeat', 'shiftKey', 'which', 'data'];
  private mouseKeys = ['offsetX', 'offsetY'];
  public runComplete = new Subject();
  protected _status = false;
  protected _isRunning = false;
  protected timeoutHandler?: { type: string, handler: (timer: number) => void };
  @Input('quicken') quicken: number;
  @Input('scroll') scroll: boolean = false;
  @Input('scrollSelector') scrollSelector: RegExp[] = [];
  @Input('shadowBodySelector') shadowBodySelector: string;
  @Input('skipSelector') private skipSelector: RegExp[] = [];
  @Input('ignoreSelector') private ignoreSelector: string[] = [];
  @Input('pendingSelector') private pendingSelector: string[] = [];
  @Input('input.skip') skipInput: (...args: any[]) => boolean = () => false;
  @Input('input.retry') retryInput: (...args: any[]) => boolean = () => false;
  @Input('input.pending') pendingInput: (...args: any[]) => boolean = () => false;

  private getXmlPath(dom: HTMLElement) {
    const tagList = [];
    let rootTagName = (dom?.tagName ?? 'body').toLowerCase();

    while (![document.body, document.documentElement, null].includes(dom)) {
      const parentNode = dom.parentNode as HTMLElement;
      const indexOf = Array.from(parentNode?.children || []).indexOf(dom);
      const tagName = dom.tagName.toLowerCase();
      tagList.unshift(tagName + `[${(indexOf + 1) || 1}]`);
      if (parentNode === document.body || parentNode.dataset.app === 'body') {
        tagList[0] = dom.className ? [tagName, ...dom.className.split(' ').filter((item) => !!item)].join('.').replace(/\:/g, '\\:') : tagList[0];
        rootTagName = parentNode.dataset.app === 'body' ? this.shadowBodySelector : 'body';
        break;
      }
      dom = parentNode;
    }
    return [...dom ? [rootTagName] : [], ...tagList].join('>');
  }

  private querySelector(xmlPath: string) {
    const container = new RegExp(this.shadowBodySelector).test(xmlPath) ? shadowBody : document;
    return container.querySelector(xmlPath?.replace(`${this.shadowBodySelector}`, 'div[data-app="body"]').replace(/\[(\d+)\]/g, ':nth-child($1)'));
  }

  private contains(xmlPath: string | HTMLElement | null) {
    if (!xmlPath) return false;

    const isTarget = typeof xmlPath !== 'string';
    const target = isTarget ? xmlPath : this.querySelector(xmlPath);
    const _xmlPath = isTarget ? this.getXmlPath(xmlPath) : xmlPath;
    const container = new RegExp(this.shadowBodySelector).test(_xmlPath) ? shadowBody : document;
    return container.contains(target);
  }

  private isElementOutOfViewport(element: Element) {
    const rect = element.getBoundingClientRect();
    const maxBottom = window.innerHeight - 150;
    return (
      rect.top > maxBottom ||
      rect.top < 0 ||
      rect.bottom > maxBottom ||
      rect.bottom < 0 ||
      rect.left > window.innerWidth ||
      rect.right < 0
    );
  }

  private checkFileInput(dom: HTMLElement) {
    return dom.tagName === 'INPUT' && (dom as HTMLInputElement).type === 'file';
  }

  private checkIsXmlPath(regexps: (RegExp | string)[], xmlPath: string) {
    return regexps.some((regexp) => typeof regexp === 'string' ? xmlPath.indexOf(regexp) !== -1 : regexp.test(xmlPath));
  }

  private checkUseScroll(dom: HTMLElement) {
    return this.scroll || !!dom.tagName && this.checkIsXmlPath(this.scrollSelector, this.getXmlPath(dom));
  }

  private factoryAddEvent(dom: EventHTML | EventHTML[], useCapture = false, check?: (event: Event) => boolean) {
    return (type: string, listener: any, _useCapture = useCapture, _check = check) => {
      const domArray = Array.isArray(dom) ? dom : [dom];
      const fn = (event: Event) => {
        if (!this.status || _check && !_check(event)) return;
        const target = event.target === document ? document.documentElement : event.target as any;
        if (this.checkIsXmlPath(this.ignoreSelector, this.getXmlPath(target))) return;
        listener(event);
      }
      domArray.forEach((dom) => dom.addEventListener(type, fn, _useCapture));
      return () => domArray.forEach((dom) => dom.removeEventListener(type, fn, _useCapture));
    };
  }

  private addRecodeItem(item: any) {
    const timer = this.startDate ? Date.now() - this.startDate : 0;
    this.startDate = Date.now();
    this.record.push(Object.assign(item, { timer }));
  }

  private filterRecord(event: Event) {
    const lastItem = this.record.at(-1);
    const { type, target, timeStamp } = event as unknown as { type: string, timeStamp: number, target: HTMLInputElement };
    if (lastItem?.labelFor === target.id && ['checkbox', 'radio'].includes(target.type)) {
      return true;
    }
    if (lastItem?.timeStamp === timeStamp && lastItem?.type === type) {
      this.startDate = Date.now() - lastItem.timer;
      this.record.splice(-1, 1);
    } else {
      delete lastItem?.timeStamp;
    }
    return type === 'click' && this.checkFileInput(target);
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
    let xmlPath = this.getXmlPath(dom === document as any ? document.documentElement : dom);
    const changeEvent = ['keydown', 'keyup', 'input'];
    const mouseEvent = ['mousedown', 'mouseup', 'click'];
    const keys = ['INPUT', 'TEXTAREA', 'BODY'].includes(dom.tagName) ? this.eventKeys : [];
    const addEventListener = this.factoryAddEvent(dom, true, check);
    const handler = (event: Event) => {
      const type = event.type;
      const target = event.target === document ? document.documentElement : event.target as HTMLElement;
      const pending = this.record.at(this.record.length - 1)?.dom;
      const eventKeys = changeEvent.includes(type) ? keys : mouseEvent.includes(type) ? this.mouseKeys : [];
      const e = eventKeys.length ? eventKeys.reduce((obj, key) => Object.assign(obj, { [key]: (event as any)[key] }), {}) : undefined;
      xmlPath = this.contains(target) ? this.getXmlPath(target) : xmlPath;
      const item: any = { type, dom: xmlPath, value: (target as HTMLInputElement).value, event: e, timeStamp: event.timeStamp };
      if (type === 'mousedown' && pending !== xmlPath && !this.contains(pending)) Object.assign(item, { pending });
      if (type === 'scroll') Object.assign(item, { value: `${target.scrollLeft + target.clientWidth},${target.scrollTop + target.clientHeight}` });
      if (/>label/.test(xmlPath)) Object.assign(item, { labelFor: this.querySelector(xmlPath.replace(/(?<=label[^\>]+)>\S+/, ''))?.getAttribute('for') });
      this.addRecodeItem(this.inputFile(event, item));
    }
    const fns = existEvent.map((type: any) => addEventListener(type, handler));
    return () => fns.forEach((f) => f());
  }

  private skipInputProcess(list: RecordList) {
    const skipList = [];
    const filterEvent = ['keydown', 'keyup', 'input'];
    while (this.checkIsXmlPath([/>(input|textarea)[^>]*$/], list.at(0)?.dom) && filterEvent.includes(list.at(0)?.type)) {
      skipList.push(list.shift());
      if (skipList.at(-1).dom !== list.at(0)?.dom) break;
    }
    while (skipList.length && filterEvent.length) {
      const item = skipList.pop();
      const indexOf = filterEvent.indexOf(item.type);
      if (indexOf !== -1) {
        filterEvent.splice(indexOf, 1);
        list.unshift(item);
      }
    }
  }

  private clearMonitor(endLength: number = 0) {
    while (this.active.length > endLength) this.active.shift().clear();
  }

  private addMonitor(target: EventTarget, extraEvent: string[] = [], check?: (event: Event) => boolean) {
    if (this.active.find(({ target: t }) => t === target)) return;
    this.active.push({ target, clear: this.createActive(target as HTMLElement, [...this.inputEvent, ...extraEvent], check) });
  }

  private pending(item: any, list: RecordList) {
    return this.pendingSelector.some((selector) => !!this.querySelector(selector)) || this.pendingInput(item, list, this);
  }

  private retry(dom: HTMLElement | null, item: any, list: RecordList) {
    const { pending } = item;
    return this.retryInput(item, list, this) || !dom || pending && this.contains(pending);
  }

  private skip(dom: HTMLElement, item: any, retry: number, list: RecordList) {
    if (this.checkIsXmlPath(this.pendingSelector, item.dom) || this.skipInput(item, list, this)) return true;
    return dom ? this.checkIsXmlPath(this.skipSelector, item.dom) : 'mousedown' !== item.type && retry < this.retryCount
  }

  private listenerMessage() {
    window.addEventListener('message', ({ data: { type, timer } }) => {
      const { type: typeP, handler } = this.timeoutHandler || {};
      if (type === typeP && handler) handler(timer);
    });
  }

  protected whilePending(nextFn: (timer?: number) => void, endDate: number) {
    let handlerSt: any;
    const messageType = '__record__timeout__pending';
    const type = Math.random().toString().replace('.', '');
    const handler = (timeoutPending: number = 0) => {
      this.timeoutHandler = void (0);
      if (handlerSt) clearTimeout(handlerSt);
      timeoutPending <= 0 ? nextFn() : this.whilePending(nextFn, endDate);
    };
    this.timeoutHandler = { type, handler };
    handlerSt = setTimeout(() => handler(), endDate - Date.now());
    window.postMessage({ type: messageType, returnType: type, endDate });
  }

  protected next(list: RecordList, timer: number = Infinity) {
    let nextFn;
    let quickenTimer = Infinity;
    const needQuicken = typeof this.quicken !== 'undefined';
    list.shift();
    if (needQuicken) {
      this.skipInputProcess(list);
      quickenTimer = Math.max(list.at(0)?.type === 'mousedown' ? 50 : -Infinity, this.quicken);
    }
    nextFn = (pendTimeout?: number) => setTimeout(() => this.run(list), Math.min(quickenTimer, pendTimeout ?? Infinity, list.at(0)?.timer ?? 0));
    if (list.at(0)?.type === 'mousedown' && needQuicken) {
      return this.whilePending(nextFn, Date.now() + (list.at(0)?.timer ?? 0) * 1.5);
    }
    nextFn(timer);
  }

  run(list: RecordList, retry = this.retryCount, isPending?: boolean) {
    let dom;
    const item = list.at(0);
    this._isRunning = !!item;
    if (!item) this.runComplete.next(true);
    if (!item || retry < 0) return retry < 0 && this.runComplete.next({ ...item, selector: item.dom.replace(/\[(\d+)\]/g, ':nth-child($1)') });
    if (this.pending(item, list)) return setTimeout(() => this.run(list, retry), 200);
    if (this.skip(dom = this.querySelector(item.dom) as any, item, retry, list)) return this.next(list);
    if (this.retry(dom, item, list)) return setTimeout(() => this.run(list, --retry), 500);
    if (item.pending && !isPending) return setTimeout(() => this.run(list, retry, true), 200);

    if (item.type === 'mousedown' && !this.scroll && this.isElementOutOfViewport(dom)) dom.scrollIntoView({ block: "center" });
    if (['mouseup', 'blur', 'focus', 'mousedown', 'click'].includes(item.type)) {
      const { offsetX = 0, offsetY = 0 } = item.event || {};
      const { left = 0, top = 0 } = dom?.getClientRects()[0] || {};
      dom.dispatchEvent(new MouseEvent(item.type, { bubbles: true, cancelable: true, clientX: left + offsetX, clientY: top + offsetY, ...item.event }));
    } else if (['keydown', 'keyup', 'input', 'change'].includes(item.type)) {
      if (this.checkFileInput(dom) && item.type === 'input') this.addInputFile(dom, item);
      else if (item.type !== 'change') dom.value = item.value;
      dom.dispatchEvent(new KeyboardEvent(item.type, Object.assign({}, item.event, { bubbles: true })));
    } else if (item.type === 'scroll') {
      const [x, y] = item.value.split(',');
      const { clientWidth, clientHeight } = dom;
      dom.scrollTo(Math.max(x - clientWidth, 0), Math.max(y - clientHeight, 0));
      dom.dispatchEvent(new Event(item.type, { bubbles: true, cancelable: true }));
    }
    return this.next(list);
  }

  async register() {
    const inputTag = ['INPUT', 'TEXTAREA'];
    const addEventListener = this.factoryAddEvent([document, shadowBody], true);
    addEventListener('mousedown', ({ target }: any) => this.addMonitor(target));
    addEventListener('mouseup', () => this.clearMonitor(1), false);
    addEventListener('focusin', ({ target }: any) => inputTag.includes(target.tagName) && this.addMonitor(target));
    addEventListener('click', ({ target }: any) => this.checkFileInput(target) && this.addMonitor(target, ['change']), false);
    addEventListener('scroll', ({ target }: any) => this.addMonitor(target, ['scroll']), true, ({ target }: any) => this.checkUseScroll(target));
    this.createActive(document.body, ['mouseup', 'click', 'keydown', 'keyup']);
    typeof this.quicken !== 'undefined' && this.listenerMessage();
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
    this.record = this.createRecordList();
  }

  setRecord(list: RecordList) {
    this.record = list;
  }

  createRecordList(list?: any[]): RecordList {
    return new RecordList(list);
  }

  get status() {
    return this._status;
  }
}
