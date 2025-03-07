import { HTTP_INTERCEPTORS, HttpHandler, HttpInterceptor, createResponse } from '@hwy-fm/core';
import { Register } from '@hwy-fm/csr';
import { forwardRef, Inject, Injectable } from '@hwy-fm/di';
import { from, map, Observable } from 'rxjs';

import { AutomationPlugin } from '../automation/automation.plugin';
import { ChromeMessage } from './chrome.message';

@Injectable()
@Register([{ provide: HTTP_INTERCEPTORS, multi: true, useExisting: forwardRef(() => ChromeFetch) }])
export class ChromeFetch implements HttpInterceptor {
  @Inject(ChromeMessage) message: ChromeMessage;
  @Inject(AutomationPlugin) automation: AutomationPlugin;

  getChrome(req: RequestInfo, params: RequestInit | undefined) {
    const data = { isAutomation: this.automation.isAutomation, url: typeof req === 'string' ? req : req.url, params };
    return from(this.message.send('__record_request_event__', data)).pipe(
      map((result: any) => {
        const res = createResponse();
        res.json = async () => result;
        return res;
      })
    );
  }

  intercept(req: RequestInfo, params: RequestInit | undefined, next: HttpHandler): Observable<Response> {
    return typeof chromeCache !== 'undefined' ? this.getChrome(req, params) : next.handle(req, params);
  }
}
