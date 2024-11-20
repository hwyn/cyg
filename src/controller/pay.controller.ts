/* eslint-disable max-len */
import { Controller, Get, Params, Res } from '@hwy-fm/server/controller';
import { HttpMiddleware } from '@hwy-fm/server/http-proxy';
import { Response } from 'express';
import fetch from 'node-fetch';
import { ClientRequest } from 'http';

@Controller()
export class PayScript {
  private latency: number = 100;
  private mapping: Map<string, number> = new Map();
  private host = 'cyg.changyou.com';
  private cookies = 'tgw_l7_route=0b0ad2afaa54120d3415ba55e7eb31f5; qrcodeid=c9a092e940e01713916da19785be1eda07825e63e9d1c63fa3d49327c880c0e9d37b3eb8a69de9a7f2fc98beed527ed9; CU=E0DAED4C40844557930AC0D1676FC83F';

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
    const { remain: _remain, orderStatus } = this.getGoodsInfo(html);
    this.latency = new Date().getTime() - new Date(res.headers.get('date') ?? startDate).getTime();

    if (isNaN(_remain) && !['已下单', '已下架'].includes(orderStatus)) {
      await new Promise(resolve => setTimeout(resolve, 100));
      return this.getGoodsHtml(goodsCode, retryTimeout);
    }
    const remain = orderStatus === '公示中' ? _remain : 0;
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

  private async callPay(goodsCode: string, index: number) {
    let html = await this.getGoodsHtml(goodsCode);
    let { remain, orderStatus } = this.getGoodsInfo(html);
    if (['已下单', '已下架'].includes(orderStatus)) return console.log(orderStatus);
    else if ('公示中' === orderStatus && remain > 0) {
      console.log(`pay order time: ${index}`, new Date(new Date().getTime() + remain).toLocaleTimeString());
      while (remain > 60000) {
        remain = this.getGoodsInfo(await this.getGoodsHtml(goodsCode, remain > 180000 ? remain - 180000 : remain - 60000)).remain;
        console.log(goodsCode, new Date(new Date().getTime() + remain).toLocaleTimeString(), remain);
      }
      remain > 30000 && await this.getGoodsHtml(goodsCode, 30000);
      html = await this.getGoodsHtml(goodsCode, 10000);
      await this.pending(this.getGoodsInfo(html).remain);
    }

    // await this.stepFetch(`http://${this.host}/order/auth.json`, headers, goodsInfo);
    const body = this.getGoodsInfo(html);
    try {
      console.log(`start order: ${index}`,new Date().getTime());
      const res = await this.stepFetch(`http://${this.host}/order/confirmBuy.json`, this.getHeaders(goodsCode), body);
      const json = await res.json();
      if (json.code !== 200) throw new Error(`${json.code}: ${json.msg}`);
      console.log(`end order: ${index}`, body, json);
    } catch (e: any) {
      console.log(`retry: ${index}`, body.orderStatus, e?.message);
      this.callPay(goodsCode, index);
    }
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
      on: { proxyReq: (proxyReq: ClientRequest) => proxyReq.setHeader('cookie', this.cookies) }
    }
  }

  @HttpMiddleware()
  proxy() {
    return [{ host: 'http://cyg.changyou.com', proxyApi: ['*'], options: this.createOptions() }];
  }
}