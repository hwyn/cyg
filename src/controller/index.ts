import { ControllerModel } from '@hwy-fm/server/controller';

import { PayScript } from './pay.controller';
import { RecordControl } from './record';

@ControllerModel({
  controller: [RecordControl, PayScript]
})
export class Module { }