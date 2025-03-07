import * as classes from './app.scss';
import { screenshot } from '../assets';

export const ScreenShot = ({ onScreenshot }: any) => {
  return (
    <div className={classes.container} style={{ zIndex: 9999, bottom: '240px' }}>
      <div className={classes.toggle} onClick={onScreenshot}>
        <img src={screenshot} />
      </div>
    </div>
  );
}
