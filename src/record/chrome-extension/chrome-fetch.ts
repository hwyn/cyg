import { HTTP_INTERCEPTORS, HttpHandler, HttpInterceptor, createResponse } from '@hwy-fm/core';
import { Register } from '@hwy-fm/csr';
import { forwardRef, Inject, Injectable } from '@hwy-fm/di';
import { Observable } from 'rxjs';

import { AutomationPlugin } from '../automation/automation.plugin';

@Injectable()
@Register([{ provide: HTTP_INTERCEPTORS, multi: true, useExisting: forwardRef(() => ChromeFetch) }])
export class ChromeFetch implements HttpInterceptor {
  @Inject(AutomationPlugin) automation: AutomationPlugin;

  getChrome(req: RequestInfo, params: RequestInit | undefined) {
    return new Observable<Response>((subscribe) => {
      chrome.runtime.sendMessage({ action: 'fetch', isAutomation: this.automation.isAutomation, url: typeof req === 'string' ? req : req.url, params }, (data: any) => {
        if (chrome.runtime.lastError) {
          console.error('消息发送失败:', chrome.runtime.lastError);
          return subscribe.error(chrome.runtime.lastError);
        }
        const res = createResponse();
        res.json = async () => data;
        subscribe.next(res);
        subscribe.complete();
      });
    });
  }

  intercept(req: RequestInfo, params: RequestInit | undefined, next: HttpHandler): Observable<Response> {
    return typeof chromeCache !== 'undefined' ? this.getChrome(req, params) : next.handle(req, params);
  }
}
