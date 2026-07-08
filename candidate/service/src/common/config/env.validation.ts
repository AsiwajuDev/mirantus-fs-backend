// Decorator metadata (`@Type`, `@IsInt`, etc.) needs the `reflect-metadata`
// polyfill applied before this module's decorators run. Nest's own
// bootstrap always imports it first, but this module can also run
// standalone (e.g. a unit test calling validateEnv() directly, outside
// any Nest app) — confirmed by a real `Reflect.getMetadata is not a
// function` failure without this import present.
import 'reflect-metadata';

import { Type, plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  validateSync,
} from 'class-validator';

// Fails fast on startup (SPEC.md §7) — @nestjs/config's `validate` option
// runs once, synchronously, before the module tree finishes assembling.
// `IsUrl({ require_tld: false })` accepts both `postgresql://...` and
// `http://localhost:5173` — a plain TLD-requiring URL check would
// wrongly reject `localhost`. `PORT`/`DB_POOL_SIZE` use explicit
// `@Type(() => Number)` (matching `QueryOrdersDto`'s convention) rather
// than `enableImplicitConversion`, which depends on `design:type`
// metadata reflection that isn't reliably available outside Nest's own
// bootstrap (confirmed: a standalone unit test calling this function
// directly threw `Reflect.getMetadata is not a function` without it).
class EnvironmentVariables {
  @IsUrl({
    require_tld: false,
    require_protocol: true,
    protocols: ['postgres', 'postgresql'],
  })
  DATABASE_URL!: string;

  @IsUrl({
    require_tld: false,
    require_protocol: true,
    protocols: ['http', 'https'],
  })
  FRONTEND_ORIGIN!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  DB_POOL_SIZE?: number;

  @IsOptional()
  @IsString()
  NODE_ENV?: string;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config);

  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n${errors.toString()}`);
  }

  return validated;
}
