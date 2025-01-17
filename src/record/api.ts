import { Inject, Injectable } from '@hwy-fm/di';
import { HttpClient } from '@hwy-fm/core';

import { Record } from './record';
@Injectable()
export class Api {
  @Inject(Record) record: Record;
  @Inject(HttpClient) http: HttpClient;

  addRecord(name: string, list: any[]) {
    return this.http.post(`/record/push/${name}.json`, { headers: { 'content-type': 'application/json' }, body: JSON.stringify(list) });
  }

  getRecord(name: string) {
    return this.http.get<any[]>(`/record/${name}.json`);
  }
}