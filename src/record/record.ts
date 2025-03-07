import { Inject } from '@hwy-fm/di';
import { ApplicationPlugin, Input } from '@hwy-fm/csr';
import { Subject } from 'rxjs';

import { Message } from './message';
import { RecordList } from './record.list';
import { shadowBody, _document as document, _setTimeout as setTimeout } from './utility';

type EventHTML = HTMLElement | Document | Window;
type RecordCallback = (event: Event, item: any) => any;

interface ExtensionRecord {
  dispatch: (dom: HTMLElement, item: any) => Event | undefined;
  monitor: (addEventListener: (...args: any[]) => void, record: Record) => void;
}

interface ActiveOptions {
  target: HTMLElement | EventTarget | null;
  existEvent?: string[];
  callback?: RecordCallback;
}

@ApplicationPlugin()
export class Record {
  private retryCount = 30;
  private active: any[] = [];
  private startDate: number = Date.now();
  private record = this.createRecordList();
  private inputEvent = ['keydown', 'keyup', 'input', 'blur', 'focus', 'mouseup', 'mousedown', 'click'];
  private eventKeys = ['code', 'key', 'keyCode', 'ctrlKey', 'charCode', 'altKey', 'metaKey', 'repeat', 'shiftKey', 'which', 'data'];
  private mouseKeys = ['offsetX', 'offsetY', 'buttons', 'isPrimary'];
  public runComplete = new Subject();
  protected _status = false;
  protected _isRunning = false;
  protected timeoutHandler?: { type: string, handler: (timer: number) => void };
  @Inject(Message) message: Message;
  @Input('scroll') scroll: boolean;
  @Input('quicken') quicken: number = -1;
  @Input('screenshot') screenshot: boolean;
  @Input('monitorTimer') monitorTimer: number;
  @Input('openRequestProxy') openRequestProxy: boolean;
  @Input('scrollSelector') scrollSelector: RegExp[] = [];
  @Input('shadowBodySelector') shadowBodySelector: string;
  @Input('skipSelector') private skipSelector: RegExp[] = [];
  @Input('ignoreSelector') private ignoreSelector: string[] = [];
  @Input('pendingSelector') private pendingSelector: string[] = [];
  @Input('input.skip') private skipInput: (...args: any[]) => boolean = () => false;
  @Input('input.retry') private retryInput: (...args: any[]) => boolean = () => false;
  @Input('input.pending') private pendingInput: (...args: any[]) => boolean = () => false;
  @Input('extension') private extension: ExtensionRecord = { monitor: () => void (0), dispatch: () => void (0) };

  private getXmlPath(dom: HTMLElement) {
    const tagList = [];
    let rootTagName = (dom?.tagName ?? 'body').toLowerCase();

    while (![document.body, document.documentElement, null].includes(dom)) {
      const parentNode = dom.parentNode as HTMLElement;
      const indexOf = Array.from(parentNode?.children || []).indexOf(dom);
      const tagName = dom.tagName.toLowerCase();
      tagList.unshift(tagName + `[${(indexOf + 1) || 1}]`);
      if (parentNode === document.body || parentNode?.dataset.app === 'body') {
        tagList[0] = dom.className ? [tagName, ...dom.className.split(' ').filter((item) => !!item)].join('.').replace(/\:/g, '\\:') : tagList[0];
        rootTagName = parentNode.dataset.app === 'body' ? this.shadowBodySelector : 'body';
        break;
      }
      dom = parentNode;
    }
    return [...dom ? [rootTagName] : [], ...tagList].join('>');
  }

  private getXmlSelector(event: MouseEvent, currentItem: any, lastItem: any) {
    const { clientX, clientY } = event;
    if (currentItem.dom === lastItem?.dom && lastItem.xml) return lastItem.xml;
    if (!clientX || !clientY) return;

    const dom = document.elementFromPoint(clientX, clientY) as HTMLElement;
    if (!dom) return;

    let xml = [];
    const childNodes = Array.from(dom.childNodes || []);
    if (childNodes.length === 1 && childNodes[0].nodeType === 3 && dom.textContent) {
      const textContent = dom.textContent;
      !/['"\)\(\[\]]/g.test(textContent) && xml.push(`text()${textContent.length < 30 ? ` = '${textContent}'` : `[contains(., '${textContent.slice(0, 30)}')]`}`);
    }
    if (typeof dom.className === 'string') xml.push(`@class[contains(., '${dom.className.split(' ')[0]}')]`);
    if (!xml.length && dom.id) xml.push(`@id = '${dom.id}'`);
    if (!xml.length) return;
    const xmlSelector = `//${dom?.tagName.toLowerCase()}[${xml.join(' and ')}]`;
    const result = document.evaluate(xmlSelector, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    for (let i = 0; i <= result.snapshotLength; i++) {
      if (this.getXmlPath(result.snapshotItem(i) as HTMLElement).indexOf(currentItem.dom) !== -1) {
        return JSON.stringify([xmlSelector, result.snapshotLength, i]);
      }
    }
  }

  private querySelector(xmlPath: string) {
    const container = new RegExp(this.shadowBodySelector).test(xmlPath) ? shadowBody : document;
    return container.querySelector(xmlPath?.replace(`${this.shadowBodySelector}`, 'div[data-app="body"]').replace(/\[(\d+)\]/g, ':nth-child($1)'));
  }

  private recordSelector(item: any, retry: number) {
    let dom = item.dom ? this.querySelector(item.dom) : void (0);
    if (dom || retry >= 27 || !item.xml) return dom;
    const [selector, len, index] = JSON.parse(item.xml);
    const result = document.evaluate(selector, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    console.log(selector, len === result.snapshotLength ? result.snapshotItem(index) : dom);
    return len === result.snapshotLength ? result.snapshotItem(index) : dom;
  }

  private contains(target: string | Element | null) {
    if (typeof target === 'string') target = this.querySelector(target);
    return document.contains(target) || shadowBody.contains(target);
  }

  private isHidden(xmlPath: string) {
    const element = this.querySelector(xmlPath) as HTMLElement;
    if (!element) return true;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return true;

    const clientRect = element.getBoundingClientRect();
    return clientRect.width === 0 || clientRect.height === 0;
  }

  private isElementOutOfViewport(element: Element) {
    const rect = element.getBoundingClientRect();
    const maxBottom = window.innerHeight - 150;
    return (
      rect.top > maxBottom || rect.top < 0 ||
      rect.bottom > maxBottom || rect.bottom < 0 ||
      rect.left > window.innerWidth || rect.right < 0
    );
  }

  private checkFileInput(dom: HTMLElement) {
    return dom.tagName === 'INPUT' && (dom as HTMLInputElement).type === 'file';
  }

  private checkIsXmlPath(regexps: (RegExp | string)[], xmlPath: string) {
    return regexps.some((regexp) => typeof regexp === 'string' ? xmlPath.indexOf(regexp) !== -1 : regexp.test(xmlPath));
  }

  private checkUseScroll(dom: HTMLElement) {
    return this.scroll || !!dom.tagName && !!this.scrollSelector.length && this.checkIsXmlPath(this.scrollSelector, this.getXmlPath(dom));
  }

  private factoryAddEvent(dom: EventHTML | EventHTML[], useCapture = false, check?: (event: Event) => boolean) {
    return (type: string, listener: EventListener, _useCapture = useCapture, _check = check) => {
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

  private filterRecord(event: Event, xmlPath: string) {
    const lastItem = this.record.at(-1);
    const { type, target, timeStamp } = event as unknown as { type: string, timeStamp: number, target: HTMLInputElement };
    if (lastItem?.labelFor === target.id && ['checkbox', 'radio'].includes(target.type)) {
      return true;
    }
    if (lastItem?.timeStamp === timeStamp && lastItem?.type === type) {
      this.startDate = Date.now() - lastItem.timer;
      this.record.splice(-1, 1);
    } else if (type === 'scroll' && lastItem?.type === type && lastItem?.dom === xmlPath && !this.checkUseScroll(target)) {
      this.record.splice(-1, 1);
    } else {
      delete lastItem?.timeStamp;
    }
    return type === 'click' && this.checkFileInput(target);
  }

  private inputFile(event: Event, item: any) {
    const { type, target: { files } } = event as unknown as { type: string, target: HTMLInputElement };
    if (type === 'input' && this.checkFileInput(event.target as HTMLElement) && !!files?.length) {
      const reader = new FileReader();
      const file = files[0];
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

  private createActive(options: ActiveOptions) {
    const { target: dom, existEvent = [], callback } = options as ActiveOptions & { target: HTMLElement };
    let xmlPath = this.getXmlPath(dom === document as any ? document.documentElement : dom);
    const changeEvent = ['keydown', 'keyup', 'input'];
    const mouseEvent = ['mousedown', 'mouseup', 'click'];
    const keys = ['INPUT', 'TEXTAREA', 'BODY'].includes(dom.tagName) ? this.eventKeys : [];
    const addEventListener = this.factoryAddEvent(dom, true, ((event: Event) => !this.filterRecord(event, xmlPath)));
    const handler = (event: Event) => {
      const type = event.type;
      const target = event.target === document ? document.documentElement : event.target as HTMLElement;
      const lastItem = this.record.at(this.record.length - 1);
      const eventKeys = changeEvent.includes(type) ? keys : mouseEvent.includes(type) ? this.mouseKeys : [];
      const e = eventKeys.length ? eventKeys.reduce((obj, key) => Object.assign(obj, { [key]: (event as any)[key] }), {}) : undefined;
      xmlPath = this.contains(target) ? this.getXmlPath(target) : xmlPath;
      const item: any = { type, dom: xmlPath, value: (target as HTMLInputElement).value, event: e, timeStamp: event.timeStamp };
      item.xml = this.getXmlSelector(event as MouseEvent, item, lastItem);
      if (['mousedown', 'scroll'].includes(type) && lastItem?.dom !== xmlPath && !this.contains(lastItem?.dom)) Object.assign(item, { pending: lastItem?.dom });
      if (type === 'scroll') Object.assign(item, { value: `${target.scrollLeft + target.clientWidth},${target.scrollTop + target.clientHeight}` });
      if (/>label/.test(xmlPath)) Object.assign(item, { labelFor: this.querySelector(xmlPath.replace(/(?<=label[^\>]+)>\S+/, ''))?.getAttribute('for') });
      if (callback) Object.assign(item, callback(event, item));
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

  private addMonitor(options: ActiveOptions) {
    const { target, existEvent = [] } = options;
    if (!target || this.active.find(({ target: t }) => t === target)) return;
    this.active.push({ target, clear: this.createActive({ ...options, existEvent: [...this.inputEvent, ...existEvent] }) });
  }

  private pending(item: any, list: RecordList) {
    const xmlPath = item.dom;
    return (
      document.readyState !== 'complete' ||
      this.pendingSelector.some((selector) => xmlPath.indexOf(selector) === -1 && !this.isHidden(selector)) ||
      this.pendingInput(item, list, this)
    );
  }

  private retry(dom: HTMLElement | null, item: any, list: RecordList) {
    const { pending } = item;
    return this.retryInput(item, list, this) || !dom || pending && this.contains(pending);
  }

  private skip(dom: HTMLElement, item: any, retry: number, list: RecordList) {
    if (this.skipInput(item, list, this)) return true;
    if (dom) return this.checkIsXmlPath(this.skipSelector, item.dom);
    return this.checkIsXmlPath(this.pendingSelector, item.dom) || 'mousedown' !== item.type && retry < this.retryCount;
  }

  protected next(list: RecordList, timer: number = Infinity) {
    let nextFn;
    let quickenTimer = Infinity;
    const needQuicken = this.quicken !== -1;
    list.shift();
    if (needQuicken) {
      this.skipInputProcess(list);
      quickenTimer = Math.max(list.at(0)?.type === 'mousedown' ? 50 : -Infinity, this.quicken);
    }
    nextFn = (pendTimeout?: number) => setTimeout(() => this.run(list), Math.min(quickenTimer, pendTimeout ?? Infinity, list.at(0)?.timer ?? 0));
    if (list.at(0)?.type === 'mousedown' && needQuicken) {
      const endDate = Date.now() + (list.at(0)?.timer ?? 0) * 1.5;
      return this.message.send('__record__timeout__pending__', endDate, true).then(nextFn);
    }
    nextFn(timer);
  }

  protected dispatchEvent(list: RecordList, dom: Element, ev: Event, retry = 0) {
    let status: boolean = false;
    const listener = () => status = true;
    dom.addEventListener(list.at(0).type, listener, { once: true, capture: true });
    dom.dispatchEvent(ev);
    if (status) return this.next(list);
    dom.removeEventListener(list.at(0).type, listener, { capture: true });
    if (retry >= 3) return this.run(list, -1);
    setTimeout(() => this.dispatchEvent(list, dom, ev, retry + 1), 15);
  }

  run(list: RecordList, retry = this.retryCount, isPending?: boolean) {
    let dom;
    const item = list.at(0);
    this._isRunning = !!item;
    if (!item) this.runComplete.next(true);
    if (!item || retry < 0) return retry < 0 && this.runComplete.next({ ...item, selector: item.dom.replace(/\[(\d+)\]/g, ':nth-child($1)') });
    if (this.pending(item, list)) return setTimeout(() => this.run(list, retry), 200);
    if (this.skip(dom = this.recordSelector(item, retry) || item.ele, item, retry, list)) return this.next(list);
    if (this.retry(dom, item, list)) return setTimeout(() => this.run(list, --retry), 500);
    if (item.pending && !isPending) return setTimeout(() => this.run(list, retry, true), 200);

    if (list.at(1)?.dom === item.dom) list.at(1).ele = dom;
    if (item.type === 'mousedown' && this.isElementOutOfViewport(dom)) dom.scrollIntoView({ block: "center" });

    const dispatchEvent = this.extension.dispatch(dom, item);
    if (dispatchEvent) {
      this.dispatchEvent(list, dom, dispatchEvent, retry);
    } else if (['mouseup', 'blur', 'focus', 'mousedown', 'click'].includes(item.type)) {
      const { offsetX = 0, offsetY = 0 } = item.event || {};
      const { left = 0, top = 0 } = dom?.getClientRects()[0] || {};
      this.dispatchEvent(list, dom, new MouseEvent(item.type, { bubbles: true, cancelable: true, clientX: left + offsetX, clientY: top + offsetY, ...item.event }));
    } else if (['keydown', 'keyup', 'input', 'change'].includes(item.type)) {
      if (this.checkFileInput(dom) && item.type === 'input') this.addInputFile(dom, item);
      else if (item.type !== 'change') dom.value = item.value;
      this.dispatchEvent(list, dom, new KeyboardEvent(item.type, Object.assign({}, item.event, { cancelable: true, bubbles: true })));
    } else if (item.type === 'scroll') {
      const [x, y] = item.value.split(',');
      const { clientWidth, clientHeight } = dom;
      dom.scrollTo(Math.max(x - clientWidth, 0), Math.max(y - clientHeight, 0));
      this.dispatchEvent(list, dom, new Event(item.type, { bubbles: true, cancelable: true }));
    }
  }

  async register() {
    const inputTag = ['INPUT', 'TEXTAREA'];
    const addEventListener = this.factoryAddEvent([document, shadowBody], true);
    addEventListener('mousedown', ({ target }) => this.addMonitor({ target }));
    addEventListener('mouseup', () => this.clearMonitor(1), false);
    addEventListener('focusin', ({ target }) => this.addMonitor({ target }), true, ({ target }: any) => inputTag.includes(target.tagName));
    addEventListener('click', ({ target }) => this.addMonitor({ target, existEvent: ['change'] }), false, ({ target }: any) => this.checkFileInput(target));
    addEventListener('scroll', ({ target }) => this.addMonitor({ target, existEvent: ['scroll'] },), true, ({ target }: any) => this.screenshot || this.checkUseScroll(target));
    this.extension.monitor(addEventListener, this);
    this.createActive({ target: document.body, existEvent: ['mouseup', 'click', 'keydown', 'keyup'] });
    this.message.send('__record__timeout__config__', { monitorTimer: this.monitorTimer, openRequestProxy: this.openRequestProxy });
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
