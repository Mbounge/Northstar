/** Host state retention should not walk an app's DOM once per wheel event or
 * once per idle second. This closure is embedded in the isolated runtime. */
export const SCREEN_STATE_CHECKPOINT_SOURCE = String.raw`(options => {
  let dirty = true;
  let checkpointData;
  let timer;
  let timerDelay = 0;
  let input;
  const checkpoint = () => {
    if (options.isHidden()) return;
    const data = options.readData();
    const serialized = data === undefined ? undefined : JSON.stringify(data);
    if (!dirty && !input && serialized === checkpointData) return;
    const retainedState = options.readSnapshot();
    dirty = false;
    checkpointData = serialized;
    const pending = input;
    input = undefined;
    options.send(pending ? { userInput: true, ...pending, retainedState } : { checkpoint: true, retainedState });
  };
  const schedule = delay => {
    if (timer !== undefined) {
      if (delay >= timerDelay) return;
      options.cancel(timer);
    }
    timerDelay = delay;
    timer = options.schedule(() => { timer = undefined; checkpoint(); }, delay);
  };
  return {
    checkpoint,
    markDirty() { dirty = true; schedule(80); },
    queueInput(userInputType, inputSequence) {
      dirty = true;
      // Notify the host immediately so its human-interaction guard cannot be
      // delayed by snapshot batching. This first notification carries no DOM.
      if (!input) options.send({ userInput: true, userInputType, inputSequence });
      input = { userInputType, inputSequence };
      // Scrolling can generate hundreds of events while the same retained
      // state is changing. Typing/clicks still checkpoint on the next task.
      schedule(userInputType === 'wheel' ? 80 : 0);
    },
    dispose() { if (timer !== undefined) options.cancel(timer); timer = undefined; },
  };
})`;
