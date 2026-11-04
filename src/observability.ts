// Request-local state: never store correlation or timings at module scope.
export class RequestMetrics {
  readonly requestId = crypto.randomUUID();
  private readonly timings = new Map<string, number>();

  constructor(private readonly tracing?: ExecutionContext['tracing']) {}

  async measure<T>(name: string, action: () => Promise<T>): Promise<T> {
    const start = performance.now();
    let outcome = 'ok';
    try {
      return await (this.tracing ? this.tracing.enterSpan(name, action) : action());
    } catch (error) {
      outcome = 'error';
      throw error;
    } finally {
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      this.timings.set(name, durationMs);
      this.log({ event: 'operation', operation: name, durationMs, outcome }, outcome === 'error');
    }
  }

  log(fields: Record<string, string | number | boolean>, error = false) {
    const message = JSON.stringify({ ...fields, requestId: this.requestId });
    if (error) console.error(message);
    else console.log(message);
  }

  finish(response: Response, method: string, route: string, durationMs: number): Response {
    this.log({ event: 'request', method, route, status: response.status, durationMs }, response.status >= 500);
    const headers = new Headers(response.headers);
    headers.set('x-request-id', this.requestId);
    headers.set('server-timing', [...this.timings, ['worker', durationMs] as const]
      .map(([name, duration]) => `${name.replace(/[^a-zA-Z0-9_-]/g, '_')};dur=${duration.toFixed(2)}`).join(', '));
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
}
