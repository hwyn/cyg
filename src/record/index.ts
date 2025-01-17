import { Application } from '@hwy-fm/csr';
import { Inject } from '@hwy-fm/di';
import { flatMap } from 'lodash';
import { forkJoin } from 'rxjs';

import { Record } from './record';
import { Instance } from './instance';
import { Api } from './api';

@Application({
  record: {
    skipSelector: [/^(?=.*cpos-file-upload)(?!.*input).*$/],
    ignoreSelector: [':record-hwy-fm'],
    loadingSelector: ['app-loading:nth-child(1)>div:nth-child(1)'],
  }
})
export class ClientApplication {
  private files = [
    // 'customer/owner', 'customer/spouse', 'customer/child', 'customer/ward',
    // 'fna/insurance', 'fna/financial', 'fna/budget', 'fna/rpq-cka',
    // 'goal/goal-life', 'goal/goal-cp', 'goal/goal-dp', 'goal/goal-pap', 'goal/goal-hp', 'goal/goal-wealth', 'goal/goal-legacy',
    // 'proposal/lrp2', 'proposal/rp', 'proposal/ifast', 'proposal/sdi',
    // 'bor/plan-detail', 'bor/add-remove',
    // 'part1/lrp2-child', 'part1/lrp2-ward', 'part1/rp-child', 'part1/sdi-spouse', 'part1/ifast-owner',
    // 'part2/payment', 'part2/support', 'part2/signature-1',
    'test'
  ];
  @Inject(Api) api: Api;
  @Inject(Record) record: Record;
  @Inject(Instance) instance: Instance;

  async main() {
    window.addEventListener('load', (() => {
      const container = document.body.appendChild(document.createElement('div'));
      container.id = ':record-hwy-fm';
      this.instance.render(container.attachShadow({ mode: 'open' }));
    }));
    forkJoin(this.files.map((name: string) => this.api.getRecord(name))).subscribe((record: any[][]) => {
      this.record.setRecord(flatMap(record));
    });
  }
}
