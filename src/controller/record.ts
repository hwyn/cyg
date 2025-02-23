import { Body, ContentType, Controller, createEmbeddedMiddleware, Get, Params, Post } from '@hwy-fm/server/controller';
import bodyParser, { OptionsJson } from 'body-parser';
import fs from 'fs';
import path from 'path';

const BodyParser = createEmbeddedMiddleware((options?: OptionsJson) => [
  bodyParser.urlencoded({ extended: true }),
  bodyParser.json(options)
]);

@Controller('/record')
export class RecordControl {
  private folder = path.join(process.cwd(), 'record');
  private mappingFilePath: string = path.join(this.folder, 'mapping.json');
  private mapping: any[] = [];

  constructor() {
    if (!fs.existsSync(this.folder)) fs.mkdirSync(this.folder);
    if (!fs.existsSync(this.mappingFilePath)) fs.writeFileSync(this.mappingFilePath, '[]', 'utf-8');
    if (!fs.existsSync(path.join(process.cwd(), 'screenshot'))) fs.mkdirSync(path.join(process.cwd(), 'screenshot'));
    this.mapping = JSON.parse(fs.readFileSync(this.mappingFilePath, 'utf-8'));
  }

  private findOne(item: any) {
    return this.mapping.find(({ name, date }) => item.name === name && date === item.date);
  }

  private saveList() {
    fs.writeFileSync(this.mappingFilePath, JSON.stringify(this.mapping, null, '\t'), 'utf-8');
  }

  private saveFile(name: string, list: any) {
    fs.writeFileSync(path.join(this.folder, `${name}.json`), JSON.stringify(list, null, '\t'), 'utf-8');
  }

  private responseOk(data: string) {
    return { code: data };
  }

  @Get('/list')
  async list() {
    return this.mapping;
  }

  @Get('/:name')
  @ContentType('application/json')
  async get(@Params('name') name: string) {
    return JSON.parse(fs.readFileSync(path.join(this.folder, `${name}.json`), 'utf-8').replace(/%RECORD TEST NAME%/g, 'Xiang Ni - ' + new Date().toLocaleDateString('zh').replace(/\//g, ' ')));
  }

  @Post('/push')
  @BodyParser({ limit: `50mb` })
  async push(@Body() list: any[]) {
    const defaultName = '操作录制';
    const index = this.mapping.reduceRight((i: string, item) => `${defaultName}${i}` === item.name ? i + 1 : i, 1);
    const name = index ? `${defaultName}${index}` : defaultName;
    const item = { name, date: Date.now() };
    this.mapping.unshift(item);
    this.saveList();
    this.saveFile(name, list);
    return item;
  }

  @Post('/delete')
  @BodyParser()
  async delete(@Body() body: any) {
    const filePath = path.join(this.folder, `${body.name}.json`);
    this.mapping = this.mapping.filter(({ name, date }) => body.name !== name || body.date !== date);
    this.saveList();
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return this.responseOk('ok');
  }

  @Post('/rename/:name')
  @BodyParser()
  async rename(@Params('name') name: string, @Body() body: any) {
    const item = this.findOne(body);
    if (!item) return this.responseOk('non-ok');
    item.name = name;
    this.saveList();
    fs.renameSync(path.join(this.folder, `${body.name}.json`), path.join(this.folder, `${name}.json`));
    return this.responseOk('ok');
  }
}