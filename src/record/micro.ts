import './record';
import './automation/automation.plugin';
import './chrome-extension/chrome-fetch';

import { Application } from '@hwy-fm/csr';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/app';
import { recordConfig } from './record.config';

@Application(recordConfig)
export class MicroApplication {
  async main() {
    const root = createRoot(document.body);
    root.render(createElement(App));
    return () => root.unmount();
  }
}
