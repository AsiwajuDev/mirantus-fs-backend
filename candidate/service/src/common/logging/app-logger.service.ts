import { Injectable, type LoggerService } from '@nestjs/common';

import { getCorrelationId } from '../correlation/correlation-context';

// SPEC.md §7: `patientReference` is never logged — full stop, at any
// log level, regardless of what else is present alongside it. Enforced
// here, once, rather than trusted to every call site's discipline.
//
// Two layers, found necessary by @security-auditor: stripping the key
// (below) only catches *structured* metadata objects. It does nothing
// for a raw string that merely *mentions* the field — e.g.
// HttpExceptionFilter logs `exception.message`/`.stack` for unexpected
// errors, and a Postgres constraint-violation message embeds the
// literal offending value inline (`Key (patient_reference)=(...)`).
// No constraint touches this column today, so that exact leak isn't
// reachable yet, but the spec's "full stop" wording doesn't allow
// relying on today's schema staying that way. `SENSITIVE_MENTION_PATTERN`
// redacts the *entire* string wherever the field name appears at all,
// rather than trying to precisely parse every driver's error format —
// coarse, but not bypassable by a format change.
const REDACTED_KEYS = ['patientReference'];
const REDACTED_PLACEHOLDER = '[REDACTED]';
const SENSITIVE_MENTION_PATTERN = /patient_?reference/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        REDACTED_KEYS.includes(key) ? REDACTED_PLACEHOLDER : redact(val),
      ]),
    );
  }
  if (typeof value === 'string' && SENSITIVE_MENTION_PATTERN.test(value)) {
    return REDACTED_PLACEHOLDER;
  }
  return value;
}

function isMetaObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

@Injectable()
export class AppLogger implements LoggerService {
  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('log', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('verbose', message, optionalParams);
  }

  private write(
    level: 'log' | 'error' | 'warn' | 'debug' | 'verbose',
    message: unknown,
    optionalParams: unknown[],
  ): void {
    // Nest's own framework logs pass a trailing context string (e.g.
    // "NestFactory", "InstanceLoader"); application code (per
    // logging-and-audit's example) passes a metadata object instead.
    // Both shapes are supported without requiring call sites to care
    // which logger implementation is active.
    const context = optionalParams.find(
      (param): param is string => typeof param === 'string',
    );
    const metaObjects = optionalParams.filter(isMetaObject);
    const meta = metaObjects.reduce<Record<string, unknown>>(
      (acc, obj) => ({ ...acc, ...(redact(obj) as Record<string, unknown>) }),
      {},
    );

    const entry = {
      level,
      message: redact(message),
      ...(context !== undefined ? { context } : {}),
      correlationId: getCorrelationId(),
      timestamp: new Date().toISOString(),
      ...meta,
    };

    const line = JSON.stringify(entry);
    if (level === 'error') {
      console.error(line);
    } else {
      console.log(line);
    }
  }
}
