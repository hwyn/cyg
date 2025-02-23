import path from 'path';
import { ApplicationPlugin, Input } from '@hwy-fm/server';
import { app, Tray } from 'electron';
import puppeteer from 'puppeteer-core';

@ApplicationPlugin()
export class ServerPlugin {
  private url = 'http://localhost:3001';
  private driveConfig: Record<string, any>;

  constructor(@Input(`chrome.${process.platform || 'default'}`) private executablePath: string) {
    const extension = path.join(process.cwd(), 'chrome-extension');
    this.driveConfig = {
      executablePath: this.executablePath,
      headless: false,
      args: [
        '--disable-infobars',
        '--no-default-browser-check',
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`
      ],
      ignoreDefaultArgs: ['--enable-automation']
    }
  }

  async openBrowser() {
    const browser = await puppeteer.launch(this.driveConfig);

    try {
      let info: any;
      const [page] = await browser.pages();
      browser.on('targetdestroyed', async () => !(await browser.pages()).length && browser.close());
      await page.setViewport(null);
      await page.exposeFunction('__record__automation__message__', async ({ action, data }: any) => {
        switch (action) {
          case 'stop':
          case 'end': info = undefined; break;
          case 'start': info = { status: action, list: data }; break;
          case 'run': info = { status: action, ...data }; break;
          case 'push': info?.list.push(data); break;
          case 'unshift': info?.list.unshift(data); break;
          case 'splice': info?.list.splice(data[0], data[1]); break;
          case 'shift': info?.list.shift(); break;
          case 'get': return info ?? { status: 0 };
          case 'screenshot': return page.screenshot({ path: path.join(process.cwd(), `screenshot/${data}`), fullPage: true });
        }
      });
      await page.goto(this.url, { waitUntil: 'networkidle0', timeout: 0 });
    } catch (e) {
      browser.close();
    }
  }

  createMenu() {
    if (process.platform !== 'win32') app.dock.hide();
    new Tray(path.join(process.cwd(), 'public', 'icon.png')).on('click', () => this.openBrowser());
  }

  async register() {
    if (app) {
      app.on('ready', () => this.createMenu());
      process.on('SIGTERM', () => app.quit());
      process.on('SIGKILL', () => {
        app.quit();
        console.log('kill')
      });
    }
  }
}
