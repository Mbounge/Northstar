import { deflateSync } from "node:zlib";

/** Valid synthetic PNG with a large metadata chunk, for request-size regression only. */
export function largeMediaFixture(variant = "primary"): string {
  function chunk(kind: string, data: Buffer): Buffer {
    const payload = Buffer.concat([Buffer.from(kind), data]);
    let crc = 0xffffffff;
    for (const byte of payload) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, payload, checksum]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(800, 0);
  header.writeUInt32BE(400, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(400 * (800 * 3 + 1));
  for (let y = 0; y < 400; y++) {
    for (let x = 0; x < 800; x++) {
      const color = x > 100 && x < 700 && y > 90 && y < 310 ? [55, 48, 124] : [221, 231, 252];
      pixels.set(color, y * 2401 + 1 + x * 3);
    }
  }
  return `data:image/png;base64,${Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
    chunk("tEXt", Buffer.from(`Fixture\0${variant}${"transport-fixture".repeat(100_000)}`)),
    chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0)),
  ]).toString("base64")}`;
}
