import { Inject, Injectable } from '@hwy-fm/di';
import { HttpClient, Input } from '@hwy-fm/csr';
import { mergeMap, of, Subject, tap } from 'rxjs';

import { AutomationPlugin } from '../automation/automation.plugin';
import { Record } from '../record';
import { RecordList } from '../record.list';
import { _document as document } from '../utility';

@Injectable()
export class Action {
  @Inject(HttpClient) http: HttpClient;
  @Input('screenshot') screenshot: boolean;
  public execName?: string;
  private list: any[] = [];
  private runList: RecordList;
  public statusChange: Subject<number>;

  constructor(private record: Record, private automation: AutomationPlugin) {
    this.statusChange = new Subject();
    this.runList = this.record.createRecordList();
    this.record.runComplete.subscribe((result) => {
      if (result !== true) console.log(result);
      this.end();
    });
    this.init();
  }

  private async init() {
    const { status, name, list } = await this.automation.getRecordInfo();
    this.execName = name;
    if (status === 'start') return this.start(list);
    if (status === 'run') return this.automationRun(list);
    if (status === 0) return this.statusChange.next(0);
  }

  public getList() {
    return this.http.get<any[]>(`/record/list`).pipe(
      tap((list: any[]) => this.list = list)
    );
  }

  public getRecord(name: string) {
    return this.http.get<any[]>(`/record/${name}`);
  }

  public addRecord(list: any[]) {
    return this.http.post(`/record/push`, { headers: { 'content-type': 'application/json' }, body: JSON.stringify(list) });
  }

  public rename(item: any, name: string) {
    return this.http.post(`/record/rename/${name}`, { headers: { 'content-type': 'application/json' }, body: JSON.stringify(item) });
  }

  public delete(item: any) {
    return this.http.post(`/record/delete`, { headers: { 'content-type': 'application/json' }, body: JSON.stringify(item) });
  }

  public showPlan() {
    document.documentElement.style.width = `calc(100% - 300px)`;
  }

  public closePlan() {
    document.documentElement.style.width = '100%';
  }

  public start(list: any[] = []) {
    this.record.setRecord(this.record.createRecordList(list));
    this.statusChange.next(1);
    this.automation.updateInfo('start', list);
    this.record.start();
  }

  public stop(handler?: () => void) {
    this.record.stop();
    this.addRecord(this.record.getRecord().toArray()).subscribe(() => {
      this.showPlan();
      handler && handler();
      this.statusChange.next(0);
      this.automation.updateInfo('stop');
    });
  }

  protected automationRun(list?: any[]) {
    this.record.run(this.record.createRecordList(list));
    this.statusChange.next(2);
  }

  public run(item: any) {
    this.getRecord(item.name).subscribe((list: any[]) => {
      this.automation.updateInfo('run', { name: this.execName = item.name, list });
      this.record.run(this.runList = this.record.createRecordList(list));
    });
    this.statusChange.next(2);
  }

  public end() {
    this.execName = void(0);
    this.runList.splice(0, this.runList.length);
    this.automation.updateInfo('end');
    this.statusChange.next(0);
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