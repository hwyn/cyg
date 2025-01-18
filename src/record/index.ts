import { Application, MICRO_OPTIONS, Register } from '@hwy-fm/csr';

import { MicroManage } from '@hwy-fm/csr/micro';

@Application()
@Register([
  { provide: MICRO_OPTIONS, useValue: { assetsPath: () => '/static/assets.json', ignores: ['main'] } }
])
export class ClientApplication {
  constructor(private micro: MicroManage) { }

  async main() {
    const microName = 'record-root';
    this.micro.bootstrapMicro(microName).subscribe((app) => {
      app.onMounted(document.body.appendChild(document.createElement(`${microName}-tag`)), { selfScope: true });
    });
  }
}
