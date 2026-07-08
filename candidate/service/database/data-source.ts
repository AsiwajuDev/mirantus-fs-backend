import { existsSync } from 'node:fs';
import { join } from 'node:path';

import * as dotenv from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';

import { ORDER_ENTITIES } from '../src/orders/entities';

// Same precedence as ConfigModule.forRoot() in app.module.ts: this
// project's actual local file is .env.local (no plain .env exists),
// so dotenv/config's hardcoded ".env" default would silently no-op.
const envLocalPath = join(__dirname, '..', '.env.local');
dotenv.config({
  path: existsSync(envLocalPath) ? envLocalPath : join(__dirname, '..', '.env'),
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run migrations');
}

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: databaseUrl,
  entities: ORDER_ENTITIES,
  migrations: [`${__dirname}/migrations/*.{ts,js}`],
  synchronize: false,
  poolSize: Number(process.env.DB_POOL_SIZE) || 10,
};

const dataSource = new DataSource(dataSourceOptions);

export default dataSource;
