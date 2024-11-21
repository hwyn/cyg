/* eslint-disable max-len */
import { Controller, Get, Params, Res } from '@hwy-fm/server/controller';
import { HttpMiddleware } from '@hwy-fm/server/http-proxy';
import { Response } from 'express';
import type { ClientRequest, IncomingMessage } from 'http';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

@Controller()
export class PayScript {
  private latency: number = 0;
  private cookies: string;
  private host = 'cyg.changyou.com';
  private orderPayload: Map<string, Object[]> = new Map();
  private mapping: Map<string, number> = new Map();
  private cookiesField = path.join(process.cwd(), 'cookies.txt');

  constructor() {
    this.cookies = fs.existsSync(this.cookiesField) ? fs.readFileSync(this.cookiesField, { encoding: 'utf-8' }) : '';
    fs.writeFileSync(path.join(process.cwd(), 'log.txt'), '');
    this.clearTokenScript();
  }

  clearTokenScript() {
    setTimeout(() => {
      const currentDate = new Date().getTime();
      for (let [id, value] of this.orderPayload.entries()) {
        this.orderPayload.set(id, value.filter(({ createDate }: any) => currentDate - createDate < 600000));
      }
      this.clearTokenScript();
    }, 600000);
  }

  log(...args: any[]) {
    fs.appendFile(path.join(process.cwd(), 'log.txt'), args.map((item) => typeof item !== 'string' ? JSON.stringify(item) : item).join(' ') + '\n', () => { })
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
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36'
    };
  }

  private addPayload(goodsCode: string, goodsInfo: object) {
    const payloads = this.orderPayload.get(goodsCode) || [];
    payloads.push({ ...goodsInfo, createDate: new Date().getTime() });
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
      remain: isNaN(remain) ? 0 : remain - this.latency,
      gc: this.exec(html, /(?<=data-gc=")[^"]+/ig),
      pid: this.exec(html, /(?<=data-platformid=")[^"]+/ig),
      gid: this.exec(html, /(?<=data-gameid=")[^"]+/ig),
      tm: this.exec(html, /(?<=data-trademode=")[^"]+/ig),
      gt: this.exec(html, /(?<=data-gt=")[^"]+/ig),
      gi: this.exec(html, /(?<=data-gi=")[^"]+/ig),
      formToken: this.exec(html, /(?<=window.formToken = ")[^"]+/ig),
      orderStatus: this.exec(html, /(?<=class="goodsStatus">)[^<]+/ig),
    }
  }

  private async getGoodsHtml(goodsCode: string, retryTimeout?: number): Promise<string> {
    const startDate = new Date().getTime();
    const res = await fetch(`http://cyg.changyou.com/details/?goodsCode=${goodsCode}`, { headers: this.getHeaders(goodsCode) });
    let html = await res.text();
    const { remain: _remain, orderStatus, ...payload } = this.getGoodsInfo(html);
    this.updateCookie(res.headers.raw());
    this.latency = new Date().getTime() - startDate;
    if (isNaN(_remain) && !['已下单', '已下架'].includes(orderStatus)) {
      await new Promise(resolve => setTimeout(resolve, 100));
      return this.getGoodsHtml(goodsCode, retryTimeout);
    }
    const remain = orderStatus === '公示中' ? _remain : 0;
    this.addPayload(goodsCode, payload);
    html = html.replace(/([\s\S]*data-remain=")([^"]+)("[\s\S]*)/g, `$1${remain}$3`);
    if (retryTimeout && remain - retryTimeout > 0) {
      await this.pending(remain - retryTimeout);
      html = await this.getGoodsHtml(goodsCode);
    }
    return html;
  }

  private async stepFetch(url: string, headers: any, body: any) {
    return await fetch(url, { method: 'post', headers, body: Object.keys(body).map((key) => `${key}=${body[key]}`).join('&') });
  }

  private async pending(timeout: number) {
    const endDate = new Date().getTime() + timeout;
    if (isNaN(endDate) || endDate < 0) return;
    return new Promise((resolve) => {
      const si = setInterval(() => new Date().getTime() >= endDate && resolve(clearInterval(si)), 10);
    });
  }

  private async startPay(goodsCode: string, index: number) {
    const { createDate, ...payload } = this.getPayload(goodsCode) || {} as any;
    if (!createDate || new Date().getTime() - createDate > 600000) {
      this.log('The token has already been consumed');
      return this.callPay(goodsCode, index);
    }
    try {
      this.log(`start order: ${index}`, new Date().getTime());
      const res = await this.stepFetch(`http://${this.host}/order/confirmBuy.json`, this.getHeaders(goodsCode), payload);
      const json = await res.json();
      if (json.code === 402) {
        this.log('token date:', new Date().getTime() - createDate);
        this.orderPayload.set(goodsCode, []);
      }
      if (json.code !== 200) throw new Error(`${json.code}: ${json.msg}`);
      this.log(`end order: ${index}`, payload, json);
    } catch (e: any) {
      this.log(`retry: ${index}`, e?.message);
      this.startPay(goodsCode, index)
    }
  }

  private async callPay(goodsCode: string, index: number) {
    let html = await this.getGoodsHtml(goodsCode);
    let { remain, orderStatus } = this.getGoodsInfo(html);
    if (['已下单', '已下架'].includes(orderStatus)) return this.log(orderStatus);
    else if ('公示中' === orderStatus && remain > 0) {
      this.log(`pay order time: ${index}`, new Date(new Date().getTime() + remain).toLocaleTimeString());
      while (remain > 5000) {
        remain = this.getGoodsInfo(await this.getGoodsHtml(goodsCode, remain > 60000 ? remain - remain % 60000 : remain - 5000)).remain;
        this.log(goodsCode, new Date(new Date().getTime() + remain).toLocaleTimeString(), remain);
      }
      html = await this.getGoodsHtml(goodsCode, 2500);
      await this.pending(this.getGoodsInfo(html).remain);
    }
    this.startPay(goodsCode, index);
  }

  @Get('/pay/:goodsCode')
  async pay(@Params('goodsCode') goodsCode: string, @Res() res: Response) {
    let html = await this.getGoodsHtml(goodsCode);
    if (!this.mapping.has(goodsCode)) {
      for (let i = 0; i < 10; i++) {
        if (this.latency) await this.pending(this.latency);
        this.callPay(goodsCode, i);
      }
      this.mapping.set(goodsCode, 10);
    }
    res.end(html);
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
    return [{ host: 'http://cyg.changyou.com', proxyApi: ['*'], options: this.createOptions() }];
  }
}