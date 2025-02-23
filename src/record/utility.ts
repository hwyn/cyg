import { runtimeInjector } from '@hwy-fm/csr';
import { Injector, Type } from '@hwy-fm/di';

let injector: Injector;
runtimeInjector((i) => injector = i);

export const inject = <T>(target: Type<T>): T => injector.get(target);
export const shadowBody = document.body.parentNode as HTMLElement;
export const _document = document.documentElement.parentNode as Document;
export const _setTimeout = (window as any).__record__symbol__setTimeout || window.setTimeout;
