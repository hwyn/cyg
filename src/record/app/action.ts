import { Inject, Injectable } from '@hwy-fm/di';
import { HttpClient } from '@hwy-fm/csr';
import { delay, mergeMap, of, tap, timer } from 'rxjs';

import { Record } from '../record';
import { _document as document } from '../utility';

@Injectable()
export class Action {
  @Inject(HttpClient) http: HttpClient;
  private list: any[] = [];
  private mapping: Map<string, any> = new Map();
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
  // forkJoin(this.files.map((name: string) => this.api.getRecord(name))).subscribe((record: any[][]) => {
  //   this.record.setRecord(flatMap(record));
  // });
  constructor(private record: Record) { }

  public get runComplete() {
    return this.record.runComplete;
  }

  public addRecord(name: string, list: any[]) {
    return this.http.post(`/record/push/${name}.json`, { headers: { 'content-type': 'application/json' }, body: JSON.stringify(list) });
  }

  public getRecord(name: string) {
    return of([...this.mapping.get(name)]).pipe(delay(0));
    // return this.http.get<any[]>(`/record/${name}.json`);
  }

  public rename(item: any, name: string) {
    // return this.http.post(`/record/rename/${item.name}.json`, { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, date: item.date }) }).pipe(
    return of(null).pipe(
      tap(() => {
        this.mapping.set(name, this.mapping.get(item.name));
        this.mapping.delete(item.name);
        item.name = name
      })
    );
  }

  public delete(item: any) {
    // return this.http.post(`/record/delete/${item.name}.json`, { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ date: item.date }) }).pipe(
    return of(null).pipe(
      tap(() => {
        this.list = this.list.filter((cache: any) => cache.name !== item.name && cache.date !== item.date);
        this.mapping.delete(item.name);
      })
    );
  }

  public getList() {
    return of(this.list).pipe(delay(0));
  }

  public showPlan() {
    document.documentElement.style.width = `calc(100% - 300px)`;
  }

  public closePlan() {
    document.documentElement.style.width = '100%';
  }

  public start() {
    timer(1000).subscribe(() => this.record.start());
  }

  public stop() {
    const defaultName = '操作录制';
    const index = this.list.reduce((i: string, item) => `${defaultName}${i}` === item.name ? i + 1 : i, 1);
    const name = index ? `${defaultName}${index}` : defaultName;
    this.record.stop();
    this.list.push({ name, date: Date.now() });
    this.mapping.set(name, this.record.getRecord());
    this.record.clearRecord();
    this.showPlan();
  }

  public run(item: any) {
    this.getRecord(item.name).subscribe((list: any[]) => this.record.run(list))
  }

  public remove(item: any) {
    return this.delete(item).pipe(mergeMap(() => this.getList()));
  }

  public updateName(item: any, name: string) {
    const noUpdate = item.name === name;
    const valid = !this.list.find((cache) => cache.name === name);
    if (!noUpdate && !valid) alert('name exists');
    if (noUpdate || !valid) return of(this.list);

    return this.rename(item, name).pipe(mergeMap(() => this.getList()));
  }
}