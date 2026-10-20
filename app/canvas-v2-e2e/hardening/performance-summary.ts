/** Host callback timing only; this is not a GPU presentation FPS estimate. */
export function summarizeIntervals(input: readonly number[]) {
  const values=input.filter(value=>Number.isFinite(value)&&value>0).sort((a,b)=>a-b);
  const percentile=(p:number)=>values.length?values[Math.max(0,Math.ceil(values.length*p)-1)]:null;
  return {samples:values.length,medianMs:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99),maxMs:values.at(-1)??null,meanMs:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,over34ms:values.filter(value=>value>34).length,over50ms:values.filter(value=>value>50).length};
}

/** Bounded, standard Long Animation Frame script metadata only. */
export function publicFrameScripts(input:unknown){
  if(!Array.isArray(input))return[];
  const text=(value:unknown,limit=160)=>typeof value==='string'?value.slice(0,limit):null;
  const number=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:null;
  return input.slice(0,12).map(value=>{const script=value&&typeof value==='object'?value as Record<string,unknown>:{};return{
    sourceURL:text(script.sourceURL,512),sourceFunctionName:text(script.sourceFunctionName),sourceCharPosition:number(script.sourceCharPosition),
    invoker:text(script.invoker),invokerType:text(script.invokerType,80),windowAttribution:text(script.windowAttribution,80),
    startTimeMs:number(script.startTime),durationMs:number(script.duration),executionStartMs:number(script.executionStart),
    forcedStyleAndLayoutDurationMs:number(script.forcedStyleAndLayoutDuration),pauseDurationMs:number(script.pauseDuration),
  }});
}
