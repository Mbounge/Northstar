import { object, string } from '../managed-agent/protocol';
import type { CodexTransport } from '../codex-app-server/rpc.server';
import type { FilmReviewer, FilmVisualReview } from './studio.server';
import type { NorthstarEffort } from '../model-catalog';
import type { UserInput } from '../codex-app-server/generated/v2/UserInput';

const schema = {
  type: 'object', additionalProperties: false, required: ['passed', 'findings', 'limitations'],
  properties: {
    passed: {type:'boolean'},
    findings:{type:'array',maxItems:12,items:{
      type:'object',additionalProperties:false,required:['beat','observation','repair'],
      properties:{beat:{type:'integer',minimum:1,maximum:8},observation:{type:'string',maxLength:700},repair:{type:'string',maxLength:700}},
    }},
    limitations:{type:'string',maxLength:700},
  },
};

export function filmReviewer(factory: () => Promise<CodexTransport>, options: {key:string; model:string; effort:NorthstarEffort; brief:string}): FilmReviewer {
  return async ({ task, context, images }, requestSignal) => {
    const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(120_000)]);
    signal.throwIfAborted();
    const rpc = await factory();
    let abort: () => void = () => {};
    try {
      const completed = new Promise<string>((resolve,reject) => {
        abort = () => { reject(signal.reason); rpc.close(); };
        signal.addEventListener('abort', abort,{once:true});
        rpc.onClose(reject);
        let answer = '';
        rpc.onMessage(message => {
          const params = object(message.params), item = object(params.item), turn = object(params.turn);
          if (message.method && message.id !== undefined) { rpc.reject(message.id as string|number,'Film review has no tools.'); return; }
          if (message.method==='item/completed' && item.type==='agentMessage' && item.phase!=='commentary') answer=string(item.text);
          if (message.method==='turn/completed') {
            if (turn.status==='completed' && answer.trim()) resolve(answer);
            else reject(Error('The independent film editor did not return a verdict.'));
          }
          if (message.method==='error' && !params.willRetry) reject(Error('The independent film editor could not finish.'));
        });
      });
      void completed.catch(()=>{});
      signal.throwIfAborted();
      await rpc.request('initialize',{clientInfo:{name:'northstar-film-review',version:'1.0.0'},capabilities:{experimentalApi:true}});
      rpc.notify('initialized',{});
      await rpc.request('account/login/start',{type:'apiKey',apiKey:options.key});
      const thread = await rpc.request('thread/start',{model:options.model,allowProviderModelFallback:false,cwd:rpc.cwd,
        approvalPolicy:'never',sandbox:'read-only',ephemeral:true,developerInstructions:task + ' Return passed=true only when no repair is needed. Provide a concise observation for each reviewed beat. For a passing beat return an empty repair string.', dynamicTools:[],
        config:{'features.shell_tool':false,'features.multi_agent':false,'features.code_mode':false,web_search:'disabled'}});
      const threadId = string(object(thread.thread).id);
      if (!threadId) throw Error('The independent film editor could not start.');
      const samples = (context as {samples?:unknown[]}).samples ?? [];
      const input: UserInput[] = [{type:'text',text:JSON.stringify({brief:options.brief,...context}),text_elements:[]}];
      for (const [index,image] of images.entries()) {
        input.push({type:'text',text:`Frame ${index+1}. ${JSON.stringify(samples[index] ?? {})}`,text_elements:[]},
          {type:'image',url:'data:image/jpeg;base64,'+image.toString('base64')});
      }
      await rpc.request('turn/start',{threadId,model:options.model,effort:options.effort,outputSchema:schema,input});
      const verdict = JSON.parse(await completed) as FilmVisualReview;
      if (typeof verdict.passed !== 'boolean' || !Array.isArray(verdict.findings) || typeof verdict.limitations !== 'string' ||
        verdict.findings.some(finding=>!Number.isInteger(finding.beat)||finding.beat<1||finding.beat>8||
          typeof finding.observation!=='string'||typeof finding.repair!=='string') ||
        (verdict.passed && verdict.findings.some(finding=>finding.repair.trim()))) throw Error('The film review returned an inconsistent verdict.');
      return verdict;
    } finally {
      signal.removeEventListener('abort', abort);
      rpc.close();
    }
  };
}
