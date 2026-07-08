import type { NextFunction, Request, Response } from 'express';

import { getCorrelationId } from '../../../src/common/correlation/correlation-context';
import { CorrelationMiddleware } from '../../../src/common/correlation/correlation.middleware';

function buildReqRes(headers: Record<string, string> = {}) {
  const setHeader = jest.fn();
  const req = { headers } as unknown as Request;
  const res = { setHeader } as unknown as Response;
  return { req, res, setHeader };
}

describe('CorrelationMiddleware', () => {
  const middleware = new CorrelationMiddleware();

  it('generates a new correlation id when none is provided', () => {
    const { req, res, setHeader } = buildReqRes();
    let capturedDuringNext: string | undefined;
    const next: NextFunction = () => {
      capturedDuringNext = getCorrelationId();
    };

    middleware.use(req, res, next);

    expect(capturedDuringNext).toBeDefined();
    expect(setHeader).toHaveBeenCalledWith(
      'x-correlation-id',
      capturedDuringNext,
    );
  });

  it('reuses a client-supplied x-correlation-id header', () => {
    const { req, res, setHeader } = buildReqRes({
      'x-correlation-id': 'client-id',
    });
    let captured: string | undefined;
    const next: NextFunction = () => {
      captured = getCorrelationId();
    };

    middleware.use(req, res, next);

    expect(captured).toBe('client-id');
    expect(setHeader).toHaveBeenCalledWith('x-correlation-id', 'client-id');
  });

  it('ignores an empty x-correlation-id header and generates a new one instead', () => {
    const { req, res } = buildReqRes({ 'x-correlation-id': '' });
    let captured: string | undefined;
    const next: NextFunction = () => {
      captured = getCorrelationId();
    };

    middleware.use(req, res, next);

    expect(captured).toBeTruthy();
  });
});
