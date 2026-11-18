/** Shared errors without importing the harness/tool graph. */
export class StudioError extends Error { constructor(message,status=400){super(message);this.status=status;} }
export const assert=(condition,message,status=400)=>{if(!condition)throw new StudioError(message,status);};
