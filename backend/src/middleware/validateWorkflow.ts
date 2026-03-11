import { Request, Response, NextFunction } from 'express';

const VALID_STEP_TYPES = [
  'trigger-manual',
  'trigger-cron',
  'trigger-webhook',
  'script-js',
  'script-python',
  'http-request',
  'if-else',
  'set-variable',
  'wait',
  'notification-slack',
  'action-email',
  'action-slack',
  'connector-db',
  'ai-prompt',
  'ai-structured-output',
  'ai-agent',
] as const;

const VALID_STATUSES = ['draft', 'active', 'paused'] as const;

function fail(res: Response, message: string): void {
  res.status(400).json({ success: false, error: message });
}

function validateStep(step: any, stationIndex: number, stepIndex: number): string | null {
  if (typeof step.id !== 'string' || step.id.trim() === '') {
    return `definition.stations[${stationIndex}].steps[${stepIndex}].id must be a non-empty string`;
  }
  if (typeof step.name !== 'string' || step.name.trim() === '') {
    return `definition.stations[${stationIndex}].steps[${stepIndex}].name must be a non-empty string`;
  }
  if (typeof step.type !== 'string' || !(VALID_STEP_TYPES as readonly string[]).includes(step.type)) {
    return `definition.stations[${stationIndex}].steps[${stepIndex}].type must be one of: ${VALID_STEP_TYPES.join(', ')}`;
  }
  return null;
}

function validateStation(station: any, index: number): string | null {
  if (typeof station.id !== 'string' || station.id.trim() === '') {
    return `definition.stations[${index}].id must be a non-empty string`;
  }
  if (typeof station.name !== 'string' || station.name.trim() === '') {
    return `definition.stations[${index}].name must be a non-empty string`;
  }
  if (!Array.isArray(station.steps)) {
    return `definition.stations[${index}].steps must be an array`;
  }
  for (let i = 0; i < station.steps.length; i++) {
    const err = validateStep(station.steps[i], index, i);
    if (err) return err;
  }
  return null;
}

function validateDefinition(definition: any): string | null {
  if (typeof definition !== 'object' || definition === null || Array.isArray(definition)) {
    return 'definition must be an object';
  }
  if (!Array.isArray(definition.stations)) {
    return 'definition.stations must be an array';
  }
  for (let i = 0; i < definition.stations.length; i++) {
    const err = validateStation(definition.stations[i], i);
    if (err) return err;
  }
  return null;
}

export function validateCreateWorkflow(req: Request, res: Response, next: NextFunction): void {
  const { name, definition, status } = req.body;

  if (typeof name !== 'string' || name.trim() === '') {
    return fail(res, 'name must be a non-empty string');
  }

  if (definition === undefined || definition === null) {
    return fail(res, 'definition is required');
  }

  const defError = validateDefinition(definition);
  if (defError) {
    return fail(res, defError);
  }

  if (status !== undefined) {
    if (!(VALID_STATUSES as readonly string[]).includes(status)) {
      return fail(res, `status must be one of: ${VALID_STATUSES.join(', ')}`);
    }
  }

  next();
}

export function validateUpdateWorkflow(req: Request, res: Response, next: NextFunction): void {
  const { name, definition, status } = req.body;

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim() === '') {
      return fail(res, 'name must be a non-empty string');
    }
  }

  if (definition !== undefined) {
    const defError = validateDefinition(definition);
    if (defError) {
      return fail(res, defError);
    }
  }

  if (status !== undefined) {
    if (!(VALID_STATUSES as readonly string[]).includes(status)) {
      return fail(res, `status must be one of: ${VALID_STATUSES.join(', ')}`);
    }
  }

  next();
}
