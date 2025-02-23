import { ApplicationPlugin } from '@hwy-fm/csr';
import { LoadAssets, MicroStore } from '@hwy-fm/csr/micro';
import { Inject, Injector } from '@hwy-fm/di';
import { of } from 'rxjs';

@ApplicationPlugin()
export class ProxyMicro {
  private isExtension = typeof chromeCache !== 'undefined';

  @Inject(Injector) injector: Injector;

  async register() {
    if (!this.isExtension) return;
    const la = this.injector.get(LoadAssets);
    this.injector.set(LoadAssets, { provide: LoadAssets, useValue: this.proxyLoadAssets(la) });
  }

  private createShadow(container: HTMLElement) {
    return chromeCache.createShadow(container);
  }

  private onMounted(target: MicroStore) {
    const _this = this;
    const proxyOnMounted = target.onMounted;
    return async function (container: HTMLElement, options: any = {}) {
      if (!container.shadowRoot) _this.createShadow(container);
      return proxyOnMounted.apply(target, [container, options]);
    }
  }

  private readMicroStatic() {
    return function () {
      return of(chromeCache.staticAssets);
    }
  }

  private proxyLoadAssets(la: LoadAssets) {
    return new Proxy(la, {
      get: (target: any, prop) => {
        if (prop === 'readMicroStatic') return this.readMicroStatic();
        return target[prop];
      }
    });
  }

  private loadScriptContext(target: MicroStore) {
    return async function ([staticAssets, shadBox]: any) {
      const execFunctions = staticAssets.funNames.map((funName: string) => (window as any)[funName]);
      return (target as any).execJavascript(execFunctions, shadBox);
    }
  }

  public proxyMicroStore(store: MicroStore) {
    if (!this.isExtension) return store;
    store.onMounted = this.onMounted(store);
    (store as any).loadScriptContext = this.loadScriptContext(store);
    return store;
  }
}