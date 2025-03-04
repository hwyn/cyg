import { Application, MICRO_OPTIONS, Register } from '@hwy-fm/csr';
import { MicroManage } from '@hwy-fm/csr/micro';

import { ProxyMicro } from './chrome-extension/proxy-micro';

@Application()
@Register([
  { provide: MICRO_OPTIONS, useValue: { assetsPath: () => '/static/assets.json', ignores: ['main', 'timeout'] } }
])
export class ClientApplication {
  private recordName = 'record-root';
  private recordContainer: HTMLElement;

  constructor(private micro: MicroManage, private proxyMicro: ProxyMicro) { }

  private render() {
    if (this.recordContainer) return document.body.appendChild(this.recordContainer);
    this.micro.bootstrapMicro(this.recordName).subscribe((app) => {
      this.recordContainer = document.createElement(`${this.recordName}-tag`);
      this.proxyMicro.proxyMicroStore(app).onMounted(document.body.appendChild(this.recordContainer), { selfScope: true });
    });
  }

  async main() {
    this.render();
    new MutationObserver((mutationsList) => mutationsList.map((item) => Array.from(item.removedNodes))
      .flat(1)
      .filter((removedNode: any) => removedNode?.tagName?.toLowerCase() === `${this.recordName}-tag`)
      .forEach(() => this.render())
    ).observe(document.documentElement.querySelector('body')!, { childList: true });
  }
}
