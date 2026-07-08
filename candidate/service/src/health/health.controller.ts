import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { HealthService } from './health.service';

// `/health` and `/ready` are top-level, sibling routes per SPEC.md §4,
// not nested under a `/health` prefix.
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  checkLiveness(): { status: 'ok' } {
    return this.healthService.checkLiveness();
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async checkReadiness(): Promise<{ status: 'ok' }> {
    const isReady = await this.healthService.checkReadiness();
    if (!isReady) {
      // No details about the underlying DB failure leak into the
      // response — the global exception filter shapes this the same
      // as any other error.
      throw new ServiceUnavailableException();
    }
    return { status: 'ok' };
  }
}
