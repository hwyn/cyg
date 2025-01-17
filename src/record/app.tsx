import { runtimeInjector } from '@hwy-fm/csr';
import { useCallback } from 'react';

import { Record } from './record';
import { Api } from './api';

let record: Record, api: Api;
runtimeInjector((i) => (record = i.get(Record), api = i.get(Api)));

export const App = () => {
  const start = useCallback(() => record.start(), []);
  const end = useCallback(() => {
    const list = record.getRecord();
    api.addRecord('test', list);
    record.stop();
    record.run(list);
  }, []);

  return <div style={{ top: '50%', right: 0, position: 'fixed', zIndex: 9999 }}>
    <button onClick={start}>start</button>
    <br /><br />
    <button onClick={end}>stop</button>
  </div>;
}
