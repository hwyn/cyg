import mergeWith from 'lodash/mergeWith';

const shadowBodySelector = 'record-shadow';
const chromeConfig = (typeof chromeCache !== 'undefined' && chromeCache.recordConfig) ?? {};
const defaultConfig = {
  quicken: 50,
  scroll: false,
  screenshot: false,
  fullPageScreen: false,
  openRequestProxy: false,
  monitorTimer: -1,
  shadowBodySelector,
  skipSelector: [],
  scrollSelector: [],
  pendingSelector: [`${shadowBodySelector}>div.record-full-screen`],
  ignoreSelector: [`${shadowBodySelector}>div[1]>div[1]`, 'record-root-tag'],
  // extension: {
  //   types: ['pointermove', 'pointerup', 'pointerdown'],
  //   monitor(addEventListener: any, record: any) {
  //     const eventKeys = ['offsetX', 'offsetY', 'buttons', 'isPrimary'];
  //     const check = ({ target }: any) => target?.tagName?.toLowerCase() === 'canvas';
  //     const callback = (event: any) => ({ existsValue: JSON.stringify(eventKeys.reduce((obj, key) => Object.assign(obj, { [key]: event[key] }), {})) });
  //     addEventListener('pointerdown', ({ target }: any) => record.addMonitor({ target, existEvent: this.types, callback }), true, check);
  //     addEventListener('pointerup', () => record.clearMonitor(1), false);
  //   },
  //   dispatch(dom: HTMLElement, item: any) {
  //     if (this.types.includes(item.type)) {
  //       const ev = JSON.parse(item.existsValue || '{}');
  //       const { offsetX = 0, offsetY = 0 } = ev;
  //       const { left = 0, top = 0 } = dom?.getBoundingClientRect() || {};
  //       const client = { clientX: left + offsetX, clientY: top + offsetY };
  //       return new PointerEvent(item.type, { bubbles: true, cancelable: true, ...client, ...item.event, ...ev });
  //     }
  //   }
  // }
};

export const recordConfig = mergeWith(defaultConfig, chromeConfig, (arg1: any, arg2: any) => {
  if (Array.isArray(arg1)) return [...arg1, ...arg2];
  if (typeof arg1 === 'function' && arg2) (...args: any[]) => arg1.apply(this, args) || arg2.apply(this, args);
});
