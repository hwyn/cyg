import { Injectable } from '@hwy-fm/di';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';

@Injectable()
export class Instance {
  async render(container: HTMLElement | ShadowRoot) {
    const root = createRoot(container);
    root.render(createElement(App));
    return root;
  }
}
