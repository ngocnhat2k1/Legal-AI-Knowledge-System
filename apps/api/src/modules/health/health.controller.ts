import { Controller, Get, Query, ServiceUnavailableException } from '@nestjs/common';

import { HealthService, type HealthReport } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  // `?llm=deep` asks the model a fixed one-word question instead of only checking that the CLI exists;
  // it costs a spawn, so it is opt-in and cached (health.llm.ts). Anything else keeps the cheap answer.
  @Get()
  async check(@Query('llm') llm?: string): Promise<HealthReport> {
    const report = await this.health.check(llm === 'deep');
    // A health check that returns 200 while the database is down is a lie a load
    // balancer will believe. Degraded → 503, with the report as the body.
    if (report.status !== 'ok') {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }
}
