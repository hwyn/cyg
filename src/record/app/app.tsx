import { useCallback, useEffect, useState } from 'react';

import { Action } from './action';
import { AutomationPlugin } from '../automation/automation.plugin';
import { inject } from '../utility';
import { Plan } from './plan/plan';
import { ScreenShot } from './screenshot';
import * as classes from './app.scss';
import { video, slowVideo, stop } from '../assets';

export const App = () => {
  const action = inject(Action);
  const automation = inject(AutomationPlugin);
  const [status, setStatus] = useState(0);
  const [plan, setPlan] = useState(false);
  const [screenshot, setScreenshot] = useState(false);

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
      case 1: action.stop(showPlan); break;
      case 2: action.end();
      default: showPlan();
    }
  }, [status]);

  const onScreenshot = useCallback(async () => {
    setScreenshot(true);
    await automation.screenshot(action.execName);
    setScreenshot(false);
  }, []);

  function onRecord() {
    closePlan();
    action.start();
  }

  function run(item: any) {
    closePlan();
    action.run(item);
  }

  useEffect(() => {
    const statusSub = action.statusChange.subscribe((status) => setStatus(status));
    return () => statusSub.unsubscribe();
  }, []);

  return (
    <>
      <div style={{ display: screenshot ? 'none' : undefined }}>
        <div className={classes.container}>
          <div className={classes.toggle} onClick={toggle}>
            <img src={[video, slowVideo, stop][status] as string} />
          </div>
          {plan ? <Plan onRun={run} onRecord={onRecord} onClose={closePlan} /> : null}
        </div>
        {action.screenshot ? <ScreenShot onScreenshot={onScreenshot} /> : null}
      </div>
      {screenshot ? <div className={['record-full-screen', classes['full-screen']].join(' ')}></div> : null}
    </>
  );
}
