import { emptyAgentView, object, readAgentEvents, reduceAgentEvent, string, type AgentView, type JsonObject } from './protocol';

export class ManagedAgentClient {
  token?: string;
  sessionId?: string;
  view = emptyAgentView();
  private stream?: AbortController;
  private commands: Promise<unknown> = Promise.resolve();
  private tools = new Map<string, Promise<void>>();
  private results = new Map<string, { success: boolean; output?: unknown; error?: string }>();
  private disposed = false;
  private heartbeat?: ReturnType<typeof setInterval>;
  private heartbeatPending = false;
  private cancelling = false;

  private recoveries = 0;
  private pendingInputs = 0;
  private buffered?: JsonObject[];
  private actions = new AbortController();
  private accountApps = new Map<string, { name: string; iconUrl?: string }>();
  constructor(private options: { endpoint: string; closeOnDispose?: boolean; keepAliveMs?: number; fetcher?: typeof fetch; onView: (view: AgentView) => void; execute: (action: JsonObject, signal: AbortSignal) => Promise<unknown> }) {}
  async request(body: JsonObject, signal?: AbortSignal) {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new Error('The agent connection timed out.')), 30_000);
    let response: Response;
    try { response = await (this.options.fetcher ?? fetch)(this.options.endpoint, { method: 'POST', keepalive: body.op === 'cancel' || body.op === 'close', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, token: this.token }), signal: signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal }); }
    finally { clearTimeout(timer); }
    if (!response.ok) { const error = object(await response.json()); throw new Error(string(error.error) || 'The agent connection failed.'); }
    return response;
  }
  private startHeartbeat() {
    if (!this.options.closeOnDispose || this.heartbeat || this.disposed) return;
    // Keep the open page's idle conversation alive without a model call or SSE stream.
    this.heartbeat = setInterval(() => {
      if (this.disposed || !this.token || this.stream || this.heartbeatPending) return;
      this.heartbeatPending = true;
      void this.request({ op: 'heartbeat' }).catch(() => {
        // A temporary network failure does not erase the completed answer.
        // The next user action reports an expired session if it cannot reconnect.
      }).finally(() => { this.heartbeatPending = false; });
    }, this.options.keepAliveMs ?? 60_000);
    this.heartbeat.unref?.();
  }
  private publish(view: AgentView) { this.view = view; if (!this.disposed) this.options.onView(this.pendingInputs && view.status === 'completed' ? { ...view, status: 'running' } : view); }
  private fail(error: unknown) { this.stream?.abort(); this.stream = undefined; this.publish({ ...this.view, status: 'failed', error: error instanceof Error ? error.message : 'The agent connection failed.' }); }
  send(message: string, attachments: unknown[], model: string, requestId: string, effort = 'high', restoredHistory?: string, canvasTheme?: 'light' | 'dark') {
    this.pendingInputs++;
    const work = this.commands.then(async () => {
      if (this.disposed || this.cancelling) throw new Error('The agent is stopping.');
      if (!this.token) {
        this.actions = new AbortController();
        this.publish({ ...emptyAgentView(), status: 'running' });
        await this.create(message, attachments, model, requestId, effort, restoredHistory, canvasTheme);
        return; // Initial input was submitted with creation; never send it twice.
      }
      if (this.view.status !== 'running') { this.recoveries = 0; this.actions = new AbortController(); this.publish({ ...emptyAgentView(), sessionId: this.sessionId, status: 'running' }); }
      if (!this.stream) await this.listen(); // Subscribe before submitting input; do not lose early events.
      await this.request({ op: 'send', message, attachments, requestId, model, effort, canvasTheme });
    });
    this.commands = work.catch(() => undefined);
    return work.catch(error => { this.fail(error); throw error; }).finally(() => { this.pendingInputs--; this.publish(this.view); this.closeSettledStream(); });
  }
  private async create(message: string, attachments: unknown[], model: string, requestId: string, effort: string, restoredHistory?: string, canvasTheme?: 'light' | 'dark') {
    const controller = new AbortController(); this.stream = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await this.request({ op: 'create', model, effort, restoredHistory, message, attachments, canvasTheme, requestId: `create:${requestId}` }, controller.signal);
      await new Promise<void>((resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('Session identity was not received. Initial input may have been accepted; do not resubmit blindly.')); }, 30_000);
        this.consume(response, controller, event => {
          if (event.type !== 'northstar.session') return;
          this.token = string(event.token); this.sessionId = string(event.sessionId);
          if (!this.token || !this.sessionId) { reject(new Error('Invalid session identity.')); return; }
          clearTimeout(timer);
          this.publish({ ...this.view, sessionId: this.sessionId });
          this.startHeartbeat();
          if (this.disposed) void this.request({ op: this.options.closeOnDispose ? 'close' : 'cancel', requestId: crypto.randomUUID() }).catch(() => undefined);
          resolve();
        }, error => reject(error));
      });
    } catch (error) { controller.abort(); if (this.stream === controller) this.stream = undefined; throw error; }
    finally { clearTimeout(timer); }
  }
  private async listen() {
    const controller = new AbortController(); this.stream = controller;
    try { this.consume(await this.request({ op: 'stream' }, controller.signal), controller); }
    catch (error) { if (this.stream === controller) this.stream = undefined; throw error; }
  }
  private consume(response: Response, controller: AbortController, identity?: (event: JsonObject) => void, creationFailure?: (error: Error) => void) {
    if (!response.body) throw new Error('The agent stream is unavailable.');
    const disconnected = (error?: unknown) => {
      if (identity && !this.token) { creationFailure?.(error instanceof Error ? error : new Error('Creation ended without a session identity.')); return; }
      if (!controller.signal.aborted && !this.disposed) void this.recover(controller).catch(failure => this.fail(failure));
    };
    void readAgentEvents(response.body, event => {
      const e = object(event);
      if (e.type === 'northstar.session') { identity?.(e); return; }
      if (this.disposed || controller.signal.aborted) return;
      if (this.buffered) this.buffered.push(e); else this.handle(e);
    }, controller.signal).then(() => disconnected()).catch(disconnected);
  }
  private handle(e: JsonObject) {
    this.publish(reduceAgentEvent(this.view, e));
    if (e.type === 'agent.session.requires_action' && !this.cancelling) {
      const actions = object(e.session).required_actions;
      if (Array.isArray(actions)) for (const action of actions) this.executeOnce(object(action), this.actions.signal);
    }
    this.closeSettledStream();
  }
  private closeSettledStream() {
    if (!this.pendingInputs && !this.buffered && ['completed', 'failed', 'stopped'].includes(this.view.status)) {
      this.stream?.abort(); this.stream = undefined;
    }
  }
  private async recover(previous: AbortController) {
    if (this.stream !== previous || this.disposed || this.cancelling) return;
    this.stream = undefined;
    if (++this.recoveries > 3) throw new Error('The connection repeatedly closed. Your session is retained; send a follow-up to continue.');
    await new Promise(resolve => setTimeout(resolve, 250 * this.recoveries));
    if (this.disposed || this.cancelling) return;
    // Subscribe first; otherwise output generated during snapshot retrieval is lost.
    this.buffered = [];
    try {
      await this.listen();
      await this.commands; // An idle snapshot before input acknowledgement is not completion.
      const snapshot = object(await (await this.request({ op: 'snapshot', turnId: this.view.turnId })).json());
      const turn = object(snapshot.turn);
      if (!this.view.turnId && turn.id) this.publish({ ...this.view, turnId: string(turn.id) });
      const settledItems = new Set<string>();
      for (const raw of Array.isArray(snapshot.items) ? snapshot.items : []) {
        const item = object(raw);
        if (item.turn_id !== this.view.turnId) continue;
        if (item.status === 'completed') settledItems.add(string(item.id));
        if (item.role === 'assistant' || item.type === 'web_search_call') this.publish(reduceAgentEvent(this.view, { type: 'agent.session.turn.item.done', item, turn_id: item.turn_id }));
      }
      if (turn.id === this.view.turnId && ['completed', 'failed', 'cancelled'].includes(string(turn.status))) {
        this.publish(reduceAgentEvent(this.view, { type: `agent.session.turn.${turn.status}`, turn }));
      }
      const queued = this.buffered; this.buffered = undefined;
      for (const event of queued) {
        if (event.type === 'agent.session.turn.output_text.delta' && settledItems.has(string(event.item_id))) continue;
        this.handle(event);
      }
      const session = object(snapshot.session);
      if (this.view.status === 'running' && Array.isArray(session.required_actions)) for (const action of session.required_actions) this.executeOnce(object(action), this.actions.signal);
      // Never infer success from idle or a closed stream.
      this.closeSettledStream();
    } finally { this.buffered = undefined; }
  }
  private toolActivity(action: JsonObject, status: 'started' | 'completed' | 'failed', output?: unknown) {
    const id = `tool:${action.turn_id}:${action.call_id}`;
    const names: Record<string, string> = { workspace_run: 'Run code', workspace_export: 'Keep output files', generate_image: 'Create an image', account_read: 'Read account apps', inspect_asset: 'Inspect account evidence', canvas_insert_flow: 'Place an app flow', read_source: 'Read a source', inspect_image: 'Inspect an image', canvas_read: 'Read the canvas', canvas_plan: 'Plan the composition', canvas_review: 'Review the rendered composition', canvas_edit: 'Edit the canvas' };
    const previous = this.view.activity.find(a => a.id === id);
    const args = object(action.arguments);
    const result = object(output);
    const returnedApps = (Array.isArray(result.apps) ? result.apps : []).map(object).filter(app => string(app.name));
    for (const app of returnedApps) this.accountApps.set(string(app.id), { name: string(app.name), iconUrl: string(app.iconUrl) || undefined });
    const knownApp = this.accountApps.get(string(args.appId));
    const appBadges = returnedApps.map(app => this.accountApps.get(string(app.id))!).filter(Boolean);
    if (!appBadges.length && knownApp) appBadges.push(knownApp);
    if (!appBadges.length && Array.isArray(output)) for (const part of output.map(object)) {
      if (part.type !== 'input_text') continue;
      try {
        const metadata = object(JSON.parse(string(part.text)));
        const match = [...this.accountApps.values()].find(app => app.name === metadata.app);
        if (match) appBadges.push(match);
      } catch { /* Non-account tool text has no app identity. */ }
    }
    const appName = appBadges.length === 1 ? appBadges[0].name : '';
    const accountLabel = action.name === 'account_read' ? ({ 'list-apps': 'Explore account apps', 'list-flows': `Explore ${appName || 'app'} flows`, 'flow-screens': `Read ${appName || 'app'} screenshots`, search: `Search ${appName || 'app'} captures`, marketing: `Read ${appName || 'app'} marketing`, business: `Read ${appName || 'app'} business records` }[string(args.operation)])
      : action.name === 'inspect_asset' && appName ? `Inspect ${appName} screenshot` : undefined;
    const activity = { id, requestId: string(action.turn_id), sequence: (previous?.sequence ?? 0) + 1, at: new Date().toISOString(), kind: 'activity' as const, status, apps: appBadges.length ? appBadges : previous?.apps, label: accountLabel || names[string(action.name)] || 'Run a tool', detail: string(args.summary) || string(args.url) || undefined };
    this.publish({ ...this.view, activity: previous ? this.view.activity.map(a => a.id === id ? activity : a) : [...this.view.activity, activity] });
  }
  private executeOnce(action: JsonObject, signal: AbortSignal) {
    const key = `${string(action.turn_id)}:${string(action.call_id)}`;
    if (!action.call_id || !action.turn_id || this.tools.has(key)) return;
    const work = (async () => {
      let result = this.results.get(key);
      if (!result) {
        this.toolActivity(action, 'started');
        try {
          const output = await this.options.execute(action, signal);
          result = ['canvas_edit', 'canvas_insert_flow'].includes(string(action.name)) && object(output).committed === false
            ? { success: false, error: JSON.stringify(output) }
            : { success: true, output };
        }
        catch (error) { result = { success: false, error: error instanceof Error ? error.message : 'Tool failed.' }; }
        this.results.set(key, result);
        if (!signal.aborted) this.toolActivity(action, result.success ? 'completed' : 'failed', result.output);
      }
      if (signal.aborted || this.cancelling || this.disposed) return;
      const receipt = { op: 'result', requestId: `result:${key}`, callId: action.call_id, turnId: action.turn_id, ...result };
      // Retry delivery, never the side effect. Server also checks whether the call is still pending.
      try { await this.request(receipt, signal); }
      catch (error) { if (signal.aborted) return; await this.request(receipt, signal).catch(() => { throw error; }); }
    })();
    this.tools.set(key, work);
    void work.catch(error => this.fail(error)).finally(() => this.tools.delete(key));
  }
  async cancel() {
    this.cancelling = true; this.actions.abort();
    await this.commands;
    try {
      if (this.token) await this.request({ op: 'cancel', requestId: crypto.randomUUID() });
      this.stream?.abort(); this.stream = undefined;
      this.publish({ ...this.view, status: 'stopped' });
    } catch (error) { this.fail(error); throw error; }
    finally { this.cancelling = false; }
  }
  dispose() {
    this.disposed = true; clearInterval(this.heartbeat); this.heartbeat = undefined; this.actions.abort(); this.stream?.abort(); this.stream = undefined;
    // Saved work restores separately; browser-owned tool execution stops on unmount.
    if (this.token && (this.options.closeOnDispose || this.view.status === 'running')) void this.request({ op: this.options.closeOnDispose ? 'close' : 'cancel', requestId: crypto.randomUUID() }).catch(() => undefined);
  }
}
