import { notFound } from 'next/navigation';
import { HumanMultiplayerFixture } from './workspace';
import { isFixturePeer } from './seed';

export default async function HumanMultiplayerPage({ searchParams }: { searchParams: Promise<{ room?: string; peer?: string; device?: string; personal?: string }> }) {
  if (process.env.NODE_ENV === 'production' || process.env.NORTHSTAR_E2E !== '1') notFound();
  const params = await searchParams;
  const room = /^[a-zA-Z0-9_-]{1,80}$/.test(params.room || '') ? params.room! : 'disposable-multiplayer';
  const peer = isFixturePeer(params.peer) ? params.peer : 'alice';
  const device = /^[a-zA-Z0-9_-]{1,40}$/.test(params.device || '') ? params.device! : 'first';
  return <HumanMultiplayerFixture room={room} peer={peer} device={device} personal={params.personal === '1'} />;
}
