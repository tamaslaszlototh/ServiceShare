import { describe, it, expect } from 'vitest';
import { EventChannel, IPC_CHANNELS, InvokeChannel, SendChannel } from './ipc';

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

// Compile-time: the runtime channel map and the payload contracts stay aligned.
type _InvokeAligned = Assert<Equal<keyof typeof IPC_CHANNELS.invoke, InvokeChannel>>;
type _SendAligned = Assert<Equal<keyof typeof IPC_CHANNELS.send, SendChannel>>;
type _EventsAligned = Assert<Equal<keyof typeof IPC_CHANNELS.events, EventChannel>>;

describe('IPC contract', () => {
  const groups = [IPC_CHANNELS.invoke, IPC_CHANNELS.send, IPC_CHANNELS.events];

  it('names the wire channel identically to its contract key', () => {
    for (const group of groups) {
      for (const [key, wire] of Object.entries(group)) {
        expect(wire).toBe(key);
      }
    }
  });

  it('keeps every channel name unique across invoke, send and events', () => {
    const wireNames = groups.flatMap((group) => Object.values(group));
    expect(new Set(wireNames).size).toBe(wireNames.length);
  });

  it('has no dead progress channel', () => {
    expect('progress' in IPC_CHANNELS.events).toBe(false);
  });
});
