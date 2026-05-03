import { describe, it, expect } from 'vitest';
import type { InputParameter } from '../types/workflow';

describe('InputParameter type', () => {
  it('accepts file type with accept field', () => {
    const fileInput: InputParameter = {
      name: 'document',
      type: 'file',
      accept: '.pdf,.pptx,.txt',
      required: true,
    };
    expect(fileInput.type).toBe('file');
    expect(fileInput.accept).toBe('.pdf,.pptx,.txt');
  });

  it('still accepts existing primitive types', () => {
    const stringInput: InputParameter = { name: 'q', type: 'string', defaultValue: 'x' };
    const numberInput: InputParameter = { name: 'n', type: 'number', defaultValue: 3 };
    expect(stringInput.type).toBe('string');
    expect(numberInput.type).toBe('number');
  });
});
