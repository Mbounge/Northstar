import type { LiveSessionState, NorthstarSnapshot, SessionCommand } from './types';

type Message = {kind:'hello'} | {kind:'state'; full:boolean; state:{snapshot:Partial<NorthstarSnapshot>;busy:boolean;title:string}}
  | {kind:'command'; id:string; command:SessionCommand} | {kind:'ack'; id:string; error?:string};
type Port = Pick<BroadcastChannel,'postMessage'|'close'> & {onmessage:((event:MessageEvent<Message>)=>void)|null};

/** One execution owner; other same-origin tabs subscribe and send user actions. */
export class LiveSessionChannel {
  private seen = new Map<string,Promise<string|undefined>>();
  private pending = new Map<string,{command:SessionCommand; resolve:()=>void; reject:(error:Error)=>void}>();
  private previous?:LiveSessionState;
  private received?:LiveSessionState;
  private receivedAt=0;
  constructor(private port:Port, private handlers:{
    owns:()=>boolean; read:()=>LiveSessionState|undefined;
    receive:(state:LiveSessionState)=>void;
    execute:(command:SessionCommand)=>Promise<void>;
  }) { port.onmessage=event=>{void this.receive(event.data);}; }
  request() {
    if(!this.received || Date.now()-this.receivedAt>10000)this.port.postMessage({kind:'hello'});
    for(const [id,pending] of this.pending) {
      if(this.handlers.owns())void this.receive({kind:'command',id,command:pending.command});
      else this.port.postMessage({kind:'command',id,command:pending.command});
    }
  }
  publish(full=false) {
    const state=this.handlers.read();if(!this.handlers.owns() || !state)return;
    full ||= !this.previous;
    const snapshot:Partial<NorthstarSnapshot>={...state.snapshot};
    if(!full && this.previous) {
      if(state.snapshot.revision===this.previous.snapshot.revision)delete snapshot.revision;
      // Do not re-clone large image inventories for every streamed text chunk.
      const before=this.previous.snapshot.memory,after=state.snapshot.memory;
      const same=(a:unknown,b:unknown):boolean=>a===b || (Array.isArray(a) && Array.isArray(b) && a.length===b.length && a.every((v,i)=>v===b[i] || (Array.isArray(v) && Array.isArray(b[i]) && v.length===b[i].length && v.every((part,j)=>part===b[i][j]))));
      if(before && after && (Object.keys(after) as (keyof typeof after)[]).every(key=>same(before[key],after[key])))delete snapshot.memory;
    }
    this.previous=state;this.port.postMessage({kind:'state',full,state:{snapshot,busy:state.busy,title:state.title}});
  }
  command(command:SessionCommand):Promise<void> {
    const id=crypto.randomUUID();
    return new Promise((resolve,reject)=>{
      this.pending.set(id,{command,resolve,reject});
      if(this.handlers.owns())void this.receive({kind:'command',id,command});
      else this.port.postMessage({kind:'command',id,command});
    });
  }
  private async receive(message:Message) {
    if(message.kind==='state' && !this.handlers.owns()) {
      if(!message.full && !this.received){this.port.postMessage({kind:'hello'});return;}
      this.received={...message.state,snapshot:{...this.received?.snapshot,...message.state.snapshot} as NorthstarSnapshot};
      this.receivedAt=Date.now();this.handlers.receive(this.received);
    }
    if(message.kind==='hello')this.publish(true);
    if(message.kind==='ack') {
      const pending=this.pending.get(message.id);this.pending.delete(message.id);
      if(message.error)pending?.reject(new Error(message.error));else pending?.resolve();
    }
    if(message.kind==='command' && this.handlers.owns()) {
      let result=this.seen.get(message.id);
      if(!result) {
        result=this.handlers.execute(message.command).then(()=>undefined,error=>error instanceof Error?error.message:String(error));
        this.seen.set(message.id,result);
      }
      const error=await result;
      // BroadcastChannel does not deliver a document's messages back to itself.
      // A promoted follower must also acknowledge its own queued command.
      if(this.pending.has(message.id))await this.receive({kind:'ack',id:message.id,error});
      this.port.postMessage({kind:'ack',id:message.id,error});this.publish();
    }
  }
  close() {
    this.port.onmessage=null;this.port.close();
    for(const pending of this.pending.values())pending.reject(new Error('The session connection closed.'));
    this.pending.clear();
  }
}
