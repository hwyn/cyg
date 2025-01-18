import { useCallback, useEffect, useState } from 'react';

import { Action } from './action';
import { inject } from '../utility';
import { Plan } from './plan/plan';
import * as classes from './app.scss';
import { video, slowVideo, stop } from '../assets';

export const App = () => {
  const action = inject(Action);
  const [status, setStatus] = useState(0);
  const [plan, setPlan] = useState(false);

  const closePlan = useCallback(() => {
    setPlan(false);
    action.closePlan();
  }, []);

  const showPlan = useCallback(() => {
    setPlan(true);
    action.showPlan();
  }, []);

  const toggle = useCallback(() => {
    switch (status) {
      case 2: break;
      case 1: setStatus(0); action.stop();
      default: showPlan();
    }
  }, [status]);

  function onRecord() {
    setStatus(1);
    closePlan();
    action.start();
  }

  function run(item: any) {
    setStatus(2);
    closePlan();
    action.run(item);
  }

  useEffect(() => {
    const sb = action.runComplete.subscribe((result) => {
      setStatus(0);
      if (result !== true) console.log(result);
    });
    return () => sb.unsubscribe();
  }, []);

  return <>
    <div className={classes.container}>
      <div className={classes.toggle} onClick={toggle}>
        <img src={[video, slowVideo, stop][status] as string} />
      </div>
    </div>
    {plan ? <Plan onRun={run} onRecord={onRecord} onClose={closePlan} /> : null}
  </>;
}
