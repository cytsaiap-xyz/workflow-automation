import { Response } from 'express';

export interface SseEvent { type: string; [key: string]: unknown; }

export class SseWriter {
  private closed = false;

  constructor(private res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.on('close', () => { this.closed = true; });
  }

  send(event: SseEvent): boolean {
    if (this.closed) return false;
    this.res.write(`data: ${JSON.stringify(event)}\n\n`);
    return true;
  }

  close(): void {
    if (!this.closed) {
      this.res.end();
      this.closed = true;
    }
  }

  isClosed(): boolean { return this.closed; }
}
