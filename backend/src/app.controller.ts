import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  // Used by the deploy platform and docker-compose to check the API is up.
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
