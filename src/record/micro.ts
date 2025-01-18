import './record';

import { Application } from '@hwy-fm/csr';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/app';

@Application({
  skipSelector: [/^(?=.*cpos-file-upload)(?!.*input).*$/],
  ignoreSelector: ['record-root-tag'],
  loadingSelector: ['app-loading:nth-child(1)>div:nth-child(1)'],
})
export class MicroApplication {
  async main() {
    const root = createRoot(document.body);
    root.render(createElement(App));
    return root;
  }
}
