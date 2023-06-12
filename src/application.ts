import './controller';

import { Application } from '@fm/server';

import { Metadata } from './providers';

@Application(Metadata)
export class ServerApplication {

  public async start() {
    // todo
  }
}
