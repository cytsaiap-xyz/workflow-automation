import { createContext, runInContext, Context } from 'vm';
import { spawn } from 'child_process';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { StepConfig } from '../types/workflow';
import { createLogger } from '../utils/logger';
import { getEnvAllowlist, isHostAllowed } from './httpAllowlist';

const log = createLogger('scriptRunner');

export interface ScriptResult {
  success: boolean;
  output?: any;
  error?: string;
  logs: string[];
}

export class ScriptRunner {
  /**
   * Execute JavaScript code in a sandboxed VM
   */
  static async executeJS(code: string, inputData: Record<string, any>, timeout = 30000): Promise<ScriptResult> {
    const logs: string[] = [];
    
    try {
      // Create sandbox context
      const sandbox: Context = {
        ...inputData,
        console: {
          log: (...args: any[]) => logs.push(args.map(a => JSON.stringify(a)).join(' ')),
          error: (...args: any[]) => logs.push(`[ERROR] ${args.map(a => JSON.stringify(a)).join(' ')}`),
          warn: (...args: any[]) => logs.push(`[WARN] ${args.map(a => JSON.stringify(a)).join(' ')}`)
        },
        JSON,
        Math,
        Date,
        Array,
        Object,
        String,
        Number,
        Boolean,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        encodeURIComponent,
        decodeURIComponent,
        setTimeout: undefined, // Disabled for security
        setInterval: undefined,
        fetch: undefined // Could enable if needed
      };

      const context = createContext(sandbox);

      // Wrap code to capture return value
      const wrappedCode = `
        (function() {
          ${code}
        })()
      `;

      const result = runInContext(wrappedCode, context, {
        timeout,
        displayErrors: true
      });

      return {
        success: true,
        output: result,
        logs
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
        logs
      };
    }
  }

  /**
   * Execute Python code via subprocess
   */
  static async executePython(code: string, context: { variables: Record<string, any>, inputData: Record<string, any>, steps: Record<string, any> }, timeout = 30000): Promise<ScriptResult> {
    return new Promise((resolve) => {
      const logs: string[] = [];
      let output = '';
      let errorOutput = '';

      // Helper to escape JSON string for safe Python multiline string injection
      const escapeForPython = (obj: any) => {
        return JSON.stringify(obj || {}).replace(/\\/g, '\\\\').replace(/'''/g, "\\'\\'\\'");
      };

      // Prepare Python script with input data and steps (Zero-Config access)
      const pythonScript = `
import json
import sys

# Input data (legacy)
input_data = json.loads('''${escapeForPython(context.inputData)}''')

# Steps (Zero-Config access) - access via steps['Step Name']['output']
steps = json.loads('''${escapeForPython(context.steps)}''')

# User code
${code}
`;

      const pythonCmd = process.env.PYTHON_CMD || 'python';
      const python = spawn(pythonCmd, ['-c', pythonScript], {
        timeout
      });

      python.stdout.on('data', (data) => {
        const str = data.toString();
        output += str;
        logs.push(str.trim());
      });

      python.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      python.on('close', (exitCode) => {
        if (exitCode === 0) {
          // Try to parse the last line as JSON output
          let parsedOutput: any;
          try {
            const lines = output.trim().split('\n');
            const lastLine = lines[lines.length - 1];
            parsedOutput = JSON.parse(lastLine);
          } catch {
            parsedOutput = output.trim();
          }

          resolve({
            success: true,
            output: parsedOutput,
            logs
          });
        } else {
          resolve({
            success: false,
            error: errorOutput || `Python exited with code ${exitCode}`,
            logs
          });
        }
      });

      python.on('error', (err) => {
        resolve({
          success: false,
          error: `Failed to start Python: ${err.message}`,
          logs
        });
      });
    });
  }

  /**
   * Execute HTTP Request
   */
  static async executeHttpRequest(config: StepConfig, inputData: Record<string, any>): Promise<ScriptResult> {
    const logs: string[] = [];

    try {
      const url = this.interpolateVariables(config.url || '', inputData);
      const method = config.method || 'GET';
      const headers = config.headers || {};
      let body = config.body;

      if (body) {
        body = this.interpolateVariables(body, inputData);
      }

      const allowlist = getEnvAllowlist();
      if (!isHostAllowed(url, allowlist)) {
        return {
          success: false,
          error: `URL host blocked by HTTP_ALLOWLIST: ${url}. Update HTTP_ALLOWLIST env to permit.`,
          logs: [`Blocked outbound request to ${url}`],
        };
      }

      logs.push(`Making ${method} request to ${url}`);

      const { status, statusText, data } = await this.httpRequest(url, method, headers, body);

      let responseData: any;
      try {
        responseData = JSON.parse(data);
      } catch {
        responseData = data;
      }

      logs.push(`Response status: ${status}`);

      if (status >= 200 && status < 300) {
        return {
          success: true,
          output: { status, statusText, data: responseData },
          logs
        };
      } else {
        return {
          success: false,
          error: `HTTP ${status}: ${statusText}`,
          output: { status, statusText, data: responseData },
          logs
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
        logs
      };
    }
  }

  /**
   * Node 16-compatible HTTP request using built-in http/https modules
   */
  private static httpRequest(
    url: string,
    method: string,
    headers: Record<string, string>,
    body?: string
  ): Promise<{ status: number; statusText: string; data: string }> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const transport = parsed.protocol === 'https:' ? https : http;

      const options: http.RequestOptions = {
        method,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        timeout: 30000
      };

      const req = transport.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            statusText: res.statusMessage || '',
            data
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request to ${url} timed out`));
      });

      if (body && method !== 'GET') {
        req.write(body);
      }
      req.end();
    });
  }

  /**
   * Evaluate condition expression
   */
  static evaluateCondition(condition: string, context: Record<string, any>): boolean {
    try {
      const interpolated = this.interpolateVariables(condition, context);
      // Use VM sandbox instead of new Function + with() for safer evaluation
      const sandbox = createContext({ ...context });
      const result = runInContext(`(${interpolated})`, sandbox, { timeout: 1000 });
      return Boolean(result);
    } catch (error) {
      log.error('Condition evaluation error: %s', error);
      return false;
    }
  }

  /**
   * Interpolate variables in a string
   * Replaces ${path.to.value} with actual values from context
   */
  static interpolateVariables(template: string, context: Record<string, any>): string {
    // Handle both ${var} and {{var}}
    const regex = /\$\{([^}]+)\}|\{\{([^}]+)\}\}/g;
    return template.replace(regex, (match, path1, path2) => {
      const path = (path1 || path2).trim();
      try {
        const value = this.getValueByPath(context, path);
        if (typeof value === 'object') {
          return JSON.stringify(value);
        }
        return value !== undefined && value !== null ? String(value) : '';
      } catch {
        return match;
      }
    });
  }

  /**
   * Get value from object by dot-notation path
   */
  static getValueByPath(obj: Record<string, any>, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}
