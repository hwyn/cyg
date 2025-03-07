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
  ignoreSelector: [`${shadowBodySelector}>div[1]>div[1]`, 'record-root-tag']
};

export const recordConfig = mergeWith(defaultConfig, chromeConfig, (arg1: any, arg2: any) => {
  if (Array.isArray(arg1)) return [...arg1, ...arg2];
  if (typeof arg1 === 'function' && arg2) (...args: any[]) => arg1.apply(this, args) || arg2.apply(this, args);
});
