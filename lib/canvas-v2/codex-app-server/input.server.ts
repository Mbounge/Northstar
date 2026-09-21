import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseCanvasV2ChatAttachments } from '../chat-attachments';
import { string, type JsonObject } from '../managed-agent/protocol';
import type { UserInput } from './generated/v2/UserInput';

export function validateCodexInput(body: JsonObject) {
  const message = string(body.message).trim();
  if (!message || message.length > 80_000) throw new Error('Enter a message of up to 80,000 characters.');
  return { message, attachments: parseCanvasV2ChatAttachments(body.attachments) };
}
export async function codexInput(body: JsonObject, cwd: string): Promise<UserInput[]> {
  const { message, attachments } = validateCodexInput(body);
  const input: UserInput[] = [{ type: 'text', text: message, text_elements: [] }];
  if (body.canvasTheme === 'light' || body.canvasTheme === 'dark') input.push({ type: 'text',
    text: `Canvas display context: the user's current theme is ${body.canvasTheme}. Canvas tools return the latest theme and host color tokens. Make authored content compatible with both themes; preserve original evidence pixels.`, text_elements: [] });
  for (const a of attachments) {
    if (a.kind === 'text') input.push({ type: 'text', text: `Attached document: ${a.name}\n${a.text}`, text_elements: [] });
    else {
      const bytes = Buffer.from(a.dataUrl.slice(a.dataUrl.indexOf(',') + 1), 'base64');
      const name = createHash('sha256').update(bytes).digest('hex');
      const file = join(cwd, `${name}.${a.mimeType.split('/')[1]}`);
      await writeFile(file, bytes, { mode: 0o600 });
      // Codex owns model image preparation. Never squeeze original source pixels
      // into the managed Agents API's bounded image_url field.
      input.push({ type: 'localImage', path: file });
    }
  }
  return input;
}
