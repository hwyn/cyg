/* eslint-disable max-len */
import { ContentType, Controller, Get, Middleware, Params, Req, Res } from '@hwy-fm/server/controller';
import { HttpMiddleware } from '@hwy-fm/server/http-proxy';
import express, { Response, Request, Router } from 'express';
import type { ClientRequest, IncomingMessage } from 'http';
import fetch, { FetchError } from 'node-fetch';
import fs from 'fs';
import path from 'path';

@Controller()
export class PayScript {
  private cookies: string;
  private host = 'cyg.changyou.com';
  private latency: number = 0;
  private availableTimer = 0;
  private orderPayload: Map<string, Object[]> = new Map();
  private orderEndTimer: Map<string, number> = new Map();
  private orderError: Map<string, Record<string, any>> = new Map();
  private mapping: Map<string, number> = new Map();
  private cookiesField = path.join(process.cwd(), 'cookies.txt');
  private tokenExpired = 600000;
  private userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36';

  constructor() {
    this.cookies = fs.existsSync(this.cookiesField) ? fs.readFileSync(this.cookiesField, { encoding: 'utf-8' }) : '';
    if (!fs.existsSync(path.join(process.cwd(), 'order.txt'))) fs.writeFileSync(path.join(process.cwd(), 'order.txt'), '');
    fs.writeFileSync(path.join(process.cwd(), 'log.txt'), '');
    this.clearTokenScript();
  }

  clearTokenScript() {
    setTimeout(() => {
      const currentDate = Date.now();
      for (let [id, value] of this.orderPayload.entries()) {
        this.orderPayload.set(id, value.filter(({ createDate }: any) => currentDate - createDate < this.tokenExpired));
      }
      this.clearTokenScript();
    }, this.tokenExpired);
  }

  log(...args: any[]) {
    fs.appendFile(path.join(process.cwd(), 'log.txt'), args.map((item) => typeof item !== 'string' ? JSON.stringify(item) : item).join(' ') + '\n', () => { })
  }

  parseDate(date: number) {
    const _date = new Date(date);
    return _date.toLocaleDateString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false // 使用 24 小时制
    }) + '.' + (`00${_date.getMilliseconds()}`.slice(-3));
  }

  parseTime(date: number) {
    const day = (date - date % 86400000) / 86400000;
    const hour = ('0' + (date % 86400000 - date % 3600000) / 3600000).slice(-2);
    const minute = ('0' + (date % 3600000 - date % 60000) / 60000).slice(-2);
    const seconds = ('0' + (date % 60000 - date % 1000) / 1000).slice(-2);
    const milliseconds = ('00' + date % 1000).slice(-3);
    return `${day}天${hour}小时${minute}分${seconds}.${milliseconds}`;
  }

  parseCookie(cookie: string) {
    return cookie.split(';').reduce((obj: any, item: string) => {
      const [name, value] = item.split('=');
      return name ? Object.assign(obj, { [name]: value }) : obj;
    }, {});
  }

  updateCookie(raw: { [k: string]: string[]; }) {
    const setCookies = [...(raw['set-cookie'] || []), ...(raw['Set-Cookie'] || [])];
    if (!setCookies.length) {
      return;
    }
    const newCookie = Object.assign(this.parseCookie(this.cookies), this.parseCookie(setCookies.map((item) => item.split(';')[0] || '').join(';')));
    this.cookies = Object.keys(newCookie).map((key) => key + '=' + newCookie[key]).join(';');
    fs.writeFileSync(this.cookiesField, this.cookies, { encoding: 'utf-8' });
  }

  private getHeaders(goodsCode: string) {
    return {
      Host: this.host,
      cookie: this.cookies,
      Origin: `http://${this.host}`,
      Referer: `http://${this.host}/details/?goodsCode=${goodsCode}`,
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': this.userAgent
    }
  }

  private addPayload(goodsCode: string, goodsInfo: object) {
    const payloads = this.orderPayload.get(goodsCode) || [];
    payloads.push({ ...goodsInfo, createDate: Date.now() });
    this.orderPayload.set(goodsCode, payloads);
  }

  private getPayload(goodsCode: string): object | undefined {
    return (this.orderPayload.get(goodsCode) || []).pop();
  }

  private exec(str: string, rex: RegExp): string {
    return (rex.exec(str) || [])[0] || '';
  }

  private getGoodsInfo(html: string) {
    const remain = Number(this.exec(html, /(?<=data-remain=")[^"]+/ig));
    return {
      qt: 1,
      remain: isNaN(remain) ? Infinity : remain,
      gc: this.exec(html, /(?<=data-gc=")[^"]+/ig),
      pid: this.exec(html, /(?<=data-platformid=")[^"]+/ig),
      gid: this.exec(html, /(?<=data-gameid=")[^"]+/ig),
      tm: this.exec(html, /(?<=data-trademode=")[^"]+/ig),
      gt: this.exec(html, /(?<=data-gt=")[^"]+/ig),
      gi: this.exec(html, /(?<=data-gi=")[^"]+/ig),
      formToken: this.exec(html, /(?<=window.formToken = ")[^"]+/ig),
      orderStatus: this.exec(html, /(?<=class="goodsStatus">)[^<]+/ig)
    };
  }

  private async getGoodsHtml(goodsCode: string, retryTimeout?: number, notRetry?: boolean): Promise<string> {
    const startDate = Date.now();
    try {
      let minEndTimer = this.orderEndTimer.get(goodsCode) || Infinity;
      const res = await fetch(`http://${this.host}/details/?goodsCode=${goodsCode}`, { headers: this.getHeaders(goodsCode), timeout: 3000 });
      let html = await res.text();
      const serverResDate = new Date(res.headers.get('date')!).getTime();
      const latency = Date.now() - startDate;
      const { remain: _remain, orderStatus, ...payload } = this.getGoodsInfo(html);
      const endTimer = serverResDate + (orderStatus === '公示中' ? _remain : 0);
      this.updateCookie(res.headers.raw());
      this.addPayload(goodsCode, payload);
      this.latency = this.latency < latency ? latency : this.latency;
      this.orderEndTimer.set(goodsCode, minEndTimer = minEndTimer > endTimer ? endTimer : minEndTimer);
      const remain = minEndTimer - Date.now();
      if (retryTimeout && remain > 0) {
        await this.pending(remain - retryTimeout);
        html = await this.getGoodsHtml(goodsCode);
      }
      return html;
    } catch (e) {
      console.log((e as FetchError).message);
      if (!this.checkRetry(goodsCode)) return '<span class="goodsStatus">已下架</span>';
    }
    return notRetry ? '' : this.getGoodsHtml(goodsCode, retryTimeout ? retryTimeout + startDate - Date.now() : undefined);
  }

  private async stepFetch(url: string, headers: any, body: any): Promise<any> {
    return await fetch(url, { method: 'post', headers, body: Object.keys(body).map((key) => `${key}=${body[key]}`).join('&') });
  }

  private async pending(timeout: number) {
    const endDate = Date.now() + timeout;
    if (isNaN(endDate) || endDate < 10) return;
    return new Promise((resolve) => {
      const si = setInterval(() => Date.now() >= endDate && resolve(clearInterval(si)), 10);
    });
  }

  private checkRetry(goodsCode: string) {
    const error = this.orderError.get(goodsCode);
    return ![200, 401, 1426, 1422, 'invalid json'].includes(error?.code);
  }

  private async asyncStartPay(goodsCode: string, payload: object, createDate: number): Promise<any> {
    try {
      const startDate = Date.now();
      this.log(`pay order start:`, this.parseDate(startDate));
      let res = await this.stepFetch(`http://${this.host}/order/confirmBuy.json`, this.getHeaders(goodsCode), payload);
      const json = await res.json();
      if ([402, 1426].includes(json.code)) this.orderPayload.set(goodsCode, []);
      if (this.checkRetry(goodsCode)) this.orderError.set(goodsCode, json);
      if (json.code !== 200) {
        throw new Error(`pay error ${json.code}: ${json.msg}`);
      };
      const finish = new Date(res.headers.get('date')!).getTime();
      const deadline = this.orderEndTimer.get(goodsCode)!;
      fs.appendFileSync(path.join(process.cwd(), 'order.txt'), `goods: ${goodsCode} deadline: ${this.parseDate(this.orderEndTimer.get(goodsCode)!)} open: ${this.parseDate(startDate)} finish: ${this.parseDate(new Date(res.headers.get('date')!).getTime())} tokenDate: ${this.parseDate(createDate)} distance: ${finish - deadline}\n`)
    } catch (e: any) {
      if (e?.message.includes('invalid json response body')) {
        this.orderError.set(goodsCode, { code: 'invalid json' });
      }
      this.log(e?.message);
    }
  }

  private async startPay(goodsCode: string) {
    const startDate = Date.now();
    const { createDate, ...payload } = this.getPayload(goodsCode) || {} as any;

    if (!this.checkRetry(goodsCode)) return;
    if (!createDate || Date.now() - createDate > this.tokenExpired) return this.callPay(goodsCode);
    this.getGoodsHtml(goodsCode, undefined, true);
    this.asyncStartPay(goodsCode, payload, createDate);
    setTimeout(() => this.startPay(goodsCode), 25 + startDate - Date.now());
  }

  private async callPay(goodsCode: string) {
    let html = await this.getGoodsHtml(goodsCode);
    let remain = this.orderEndTimer.get(goodsCode)! - Date.now();
    let { orderStatus } = this.getGoodsInfo(html);
    if (['已下单', '已下架'].includes(orderStatus)) {
      this.orderPayload.set(goodsCode, []);
      return this.log(orderStatus);
    } else if ('公示中' === orderStatus && remain > 0) {
      this.log(`pay order time:`, this.parseTime(remain), this.parseDate(this.orderEndTimer.get(goodsCode)!));
      while (remain > this.latency * 2) {
        await this.getGoodsHtml(goodsCode, remain > 60000 ? remain - remain % (remain > 600000 ? 300000 : 5000) : remain - 250);
        remain = this.orderEndTimer.get(goodsCode)! - Date.now();
        this.log(`pay order time:`, this.parseTime(remain), this.parseDate(this.orderEndTimer.get(goodsCode)!));
      }
      await this.pending(this.orderEndTimer.get(goodsCode)! + this.availableTimer - this.latency - Date.now());
    }
    this.startPay(goodsCode);
  }

  @Get('/pay/:goodsCode')
  async pay(@Params('goodsCode') goodsCode: string, @Res() res: Response) {
    if (!this.mapping.has(goodsCode)) {
      this.mapping.set(goodsCode, 10);
      this.callPay(goodsCode);
    }
    res.end(await this.getGoodsHtml(goodsCode));
  }

  createOptions() {
    return {
      on: {
        proxyReq: (proxyReq: ClientRequest) => proxyReq.setHeader('cookie', this.cookies),
        proxyRes: (proxyRes: IncomingMessage) => this.updateCookie(proxyRes.headers as { [k: string]: string[]; })
      }
    }
  }

  @HttpMiddleware()
  proxy() {
    return [
      { host: `http://${this.host}`, proxyApi: ['*'], options: this.createOptions() }
    ];
  }
}