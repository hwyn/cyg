import { AutomationPlugin } from './automation/automation.plugin';
import { inject } from './utility';

export class RecordList<T = any> {
  private automation = inject(AutomationPlugin);
  constructor(private list: any[] = []) { }

  push<T>(item: T) {
    const { ele, ...data } = item as T & { ele: any };
    this.automation.updateInfo('push', data);
    return this.list.push(item);
  }

  splice(start: number, deleteCount?: number): T[] {
    this.automation.updateInfo('splice', [start, deleteCount]);
    return this.list.splice(start, deleteCount);
  }

  at(index: number) {
    return this.list.at(index);
  }

  toArray() {
    return this.list;
  }

  shift() {
    this.automation.updateInfo('shift');
    return this.list.shift();
  }

  unshift<T>(item: T) {
    const { ele, ...data } = item as T & { ele: any };
    this.automation.updateInfo('unshift', data);
    return this.list.unshift(item);
  }

  get length(): number {
    return this.list.length;
  }
}
