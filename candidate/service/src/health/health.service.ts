import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // Pure liveness check per SPEC.md §4 — no database dependency, so a
  // DB outage never masks whether the process itself is up.
  checkLiveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  async checkReadiness(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
