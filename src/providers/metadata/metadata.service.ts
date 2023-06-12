import { Injectable } from '@fm/di';
import { MetadataInfo } from '@fm/server';
import fs from 'fs';
import yaml from 'js-yaml';
import { merge } from 'lodash';
import path from 'path';

@Injectable()
export class Metadata implements MetadataInfo {
  protected sourceRoot = path.join(process.cwd(), 'src');
  protected isDevelopment = process.env.NODE_ENV === 'development';

  protected loadYml(filePath: string) {
    const file = path.join(this.resourcesRoot, filePath);
    return fs.existsSync(file) ? yaml.load(fs.readFileSync(file, 'utf-8')) : {};
  }

  public async load() {
    return this.ymlList.reduce((info: any, ymlPath: string) => merge(info, this.loadYml(ymlPath)), this.metadata);
  }

  protected get metadata() {
    return { sourceRoot: this.sourceRoot };
  }

  protected get ymlList() {
    return ['application.yml', ...this.isDevelopment ? ['application-dev.yml'] : []];
  }

  protected get resourcesRoot() {
    return path.join(this.sourceRoot, 'resources');
  }
}
