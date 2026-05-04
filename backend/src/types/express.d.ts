import 'express';

declare global {
  namespace Express {
    interface Request {
      executionId?: string;
    }
  }
}

export {};
