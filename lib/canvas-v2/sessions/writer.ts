/** Keep the same writer on refresh, without sharing it with a duplicated tab. */
export async function claimSessionWriter(
  key: string,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  locks: Pick<LockManager, 'request'> | undefined,
): Promise<string> {
  let candidate = storage.getItem(key) || crypto.randomUUID();
  // A tab duplicate can inherit sessionStorage. A document-lifetime browser lock
  // distinguishes that duplicate from a reload, whose old document has gone.
  if (locks) {
    for (;;) {
      const available = await new Promise<boolean>((resolve, reject) => {
        void locks.request(`northstar-writer:${candidate}`, { ifAvailable: true }, lock => {
          resolve(Boolean(lock));
          return lock ? new Promise<void>(() => {}) : undefined;
        }).catch(reject);
      });
      if (available) break;
      candidate = crypto.randomUUID();
    }
  } else {
    // Without browser locks, use a new writer and let the database arbitrate.
    candidate = crypto.randomUUID();
  }
  storage.setItem(key, candidate);
  return candidate;
}
