import { Module } from '@nestjs/common';

import { ConfirmationService } from './confirmation.service';
import { TariffController } from './tariff.controller';
import { TariffService } from './tariff.service';

/**
 * The tariff lookup feature (TASK-011) plus the point-of-use confirmation loop
 * (Phase 3). Depends on the global DatabaseModule for its single connection.
 */
@Module({
  controllers: [TariffController],
  providers: [TariffService, ConfirmationService],
})
export class TariffModule {}
