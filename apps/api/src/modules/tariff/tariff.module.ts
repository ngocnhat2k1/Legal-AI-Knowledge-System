import { Module } from '@nestjs/common';

import { TariffController } from './tariff.controller';
import { TariffService } from './tariff.service';

/**
 * The tariff lookup feature (TASK-011). Depends on the global DatabaseModule for
 * its single connection; owns no state of its own.
 */
@Module({
  controllers: [TariffController],
  providers: [TariffService],
})
export class TariffModule {}
