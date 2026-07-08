import { validateEnv } from '../../../src/common/config/env.validation';

function validConfig(): Record<string, unknown> {
  return {
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/orders',
    FRONTEND_ORIGIN: 'http://localhost:5173',
    DB_POOL_SIZE: '10',
    PORT: '3000',
  };
}

describe('validateEnv', () => {
  it('passes with a fully valid config', () => {
    expect(() => validateEnv(validConfig())).not.toThrow();
  });

  it('fails fast when DATABASE_URL is missing', () => {
    const config = validConfig();
    delete config.DATABASE_URL;

    expect(() => validateEnv(config)).toThrow(/DATABASE_URL/);
  });

  it('fails fast when FRONTEND_ORIGIN is missing', () => {
    const config = validConfig();
    delete config.FRONTEND_ORIGIN;

    expect(() => validateEnv(config)).toThrow(/FRONTEND_ORIGIN/);
  });

  it('fails when DATABASE_URL is not a valid postgres URL', () => {
    const config = validConfig();
    config.DATABASE_URL = 'not-a-url';

    expect(() => validateEnv(config)).toThrow();
  });

  it('fails when PORT is out of range', () => {
    const config = validConfig();
    config.PORT = '99999';

    expect(() => validateEnv(config)).toThrow(/PORT/);
  });

  it('allows PORT and DB_POOL_SIZE to be omitted (both have runtime defaults elsewhere)', () => {
    const config = validConfig();
    delete config.PORT;
    delete config.DB_POOL_SIZE;

    expect(() => validateEnv(config)).not.toThrow();
  });
});
