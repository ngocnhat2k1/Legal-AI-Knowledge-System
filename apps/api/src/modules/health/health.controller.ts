import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { HealthService, type HealthReport } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async check(): Promise<HealthReport> {
    const report = await this.health.check();
    // A health check that returns 200 while the database is down is a lie a load
    // balancer will believe. Degraded → 503, with the report as the body.
    if (report.status !== 'ok') {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }
}
