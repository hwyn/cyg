/* eslint-disable max-len */
import { Controller, Get, Middleware, Params, Res } from '@fm/server';
import { Response, Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import fetch from 'node-fetch';

@Controller()
export class PayScript {
  private host = 'cyg.changyou.com';
  private cookies = 'CU=F4A174C0C0B84930B490ECE30486EADA; tgw_l7_route=c930580e76325087a11ef04faf5cb53a; _sm_au_c=kuOIXAKfcI1594JBZB9JRkRnMBTzcKz0w4dWuz45c+p8gAAAA06ZrP7VD1kFij90rZ1KO8u4Vevn+cycELbGHMD7UUwI=; qrcodeid=5a8a8ce21927eac799cb84e734085d77d606f917e3ddb9f76f0de46977347e963b87d662ca0ebee571e6168eb274b363';

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

  private getGoodsInfo(html: string) {
    const _remain = html.replace(/[\s\S]*data-remain="([^"]+)"[\s\S]*/ig, '$1');
    return {
      qt: 1,
      _remain,
      remain: Number(_remain),
      gc: html.replace(/[\s\S]*data-gc="([^"]+)"[\s\S]*/ig, '$1'),
      pid: html.replace(/[\s\S]*data-platformid="([^"]+)"[\s\S]*/ig, '$1'),
      gid: html.replace(/[\s\S]*data-gameid="([^"]+)"[\s\S]*/ig, '$1'),
      tm: html.replace(/[\s\S]*data-trademode="([^"]+)"[\s\S]*/ig, '$1'),
      gt: html.replace(/[\s\S]*data-gt="([^"]+)"[\s\S]*/ig, '$1'),
      gi: html.replace(/[\s\S]*data-gi="([^"]+)"[\s\S]*/ig, '$1'),
      formToken: html.replace(/[\s\S]*window.formToken = "([^"]+)"[\s\S]*/ig, '$1')
    }
  }

  private getOrderStatus(html: string) {
    return html.replace(/[\s\S]*class="goodsStatus">([^<]+)<[\s\S]*/ig, '$1');
  }

  private async getGoodsHtml(goodsCode: string, retryTimeout?: number): Promise<string> {
    const startDate = new Date().getTime();
    const res = await fetch(`http://cyg.changyou.com/details/?goodsCode=${goodsCode}`, { headers: this.getHeaders(goodsCode) });
    const latency = new Date().getTime() - startDate;
    let html = await res.text();
    const orderStatus = this.getOrderStatus(html);
    if (isNaN(this.getGoodsInfo(html).remain) && !['已下单', '已下架'].includes(orderStatus)) {
      await new Promise(resolve => setTimeout(resolve, 500));
      return this.getGoodsHtml(goodsCode, retryTimeout);
    }
    const remain = orderStatus === '公示中' ? this.getGoodsInfo(html).remain - (latency - latency % 2) / 2 : 0;
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
    return new Promise((resolve) => setInterval(() => new Date().getTime() >= endDate && resolve(null), 10));
  }

  private async callPay(goodsCode: string, remain: number) {
    console.log('pay order time', new Date(new Date().getTime() + remain).toLocaleTimeString());
    remain > 30000 && await this.getGoodsHtml(goodsCode, 30000);
    const html = await this.getGoodsHtml(goodsCode, 10000);
    await this.pending(this.getGoodsInfo(html).remain);
    // await this.stepFetch(`http://${this.host}/order/auth.json`, headers, goodsInfo);
    const headers = this.getHeaders(goodsCode);
    const body = this.getGoodsInfo(await this.getGoodsHtml(goodsCode));
    try {
      const res = await this.stepFetch(`http://${this.host}/order/confirmBuy.json`, headers, body);
      console.log('end order', body, await res.json());
    } catch (e) {
      console.log(body, e);
    }
  }

  @Get('/pay/:goodsCode')
  async pay(@Params('goodsCode') goodsCode: string, @Res() res: Response) {
    const html = await this.getGoodsHtml(goodsCode);
    this.callPay(goodsCode, this.getGoodsInfo(html).remain);
    res.end(html);
  }

  @Middleware()
  proxy(router: Router) {
    const proxyOptions = { target: 'http://cyg.changyou.com', secure: true, changeOrigin: true };
    const proxy = createProxyMiddleware('/', proxyOptions);
    router.use('/gameServer.json', proxy);
    router.use('/details/recommendList.json', proxy);
    router.use('/ads', proxy);
  }
}