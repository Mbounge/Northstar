export const DEFAULT_SNAPSHOT_MAX_BYTES = 100 * 1024 * 1024;

export function assertSnapshotSize(bytes: number, maxBytes: number): void {
  if (bytes <= maxBytes) return;
  throw Object.assign(new Error(`Encoded snapshot is ${bytes} bytes; limit is ${maxBytes} bytes. Your open canvas is still available.`), { stage: 'size', bytes });
}
