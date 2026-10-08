export interface ScreenMotionTiming { time: number; rate: number; duration: number; delay: number; endTime: number; iterations: number }

/** A shared elapsed-time window preserves stagger and different durations.
 * An infinite effect contributes one cycle; long sequences report truncation. */
export function screenMotionTimeline(items: readonly ScreenMotionTiming[]) {
  const entries=items.map(item=>{
    const rate=Number.isFinite(item.rate)?item.rate:1;
    const duration=Number.isFinite(item.duration)&&item.duration>0?item.duration:0;
    const continuous=!Number.isFinite(item.iterations);
    // Keep the absolute local time: reducing it modulo one cycle reverses the
    // phase of alternate animations and breaks alignment with sibling effects.
    const time=Number.isFinite(item.time)?item.time:0;
    const origin=rate ? -time/rate : 0;
    const end=Number.isFinite(item.endTime)?item.endTime:Math.max(0,item.delay)+duration;
    return {origin,rate,heldTime:time,end:!rate?0:continuous?duration/Math.abs(rate):rate>0?origin+Math.max(0,end)/rate:time/Math.abs(rate),continuous};
  });
  const start=0;
  const requestedEnd=Math.max(start,...entries.map(item=>item.end));
  const duration=Math.min(10_000,Math.max(0,requestedEnd-start));
  return {start,duration,truncated:requestedEnd-start>10_000,continuous:entries.some(item=>item.continuous),entries};
}
