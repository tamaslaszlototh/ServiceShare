import { ipcMain, IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron';
import {
  EventChannel,
  InvokeChannel,
  IpcEventContract,
  IpcInvokeContract,
  IpcSendContract,
  IPC_CHANNELS,
  SendChannel,
} from '../shared/ipc';

/**
 * Typed wrappers over Electron's IPC primitives. Each takes the contract's
 * channel key (not a wire string) and checks the handler against that channel's
 * declared arguments and result, so the main-process handlers cannot diverge
 * from the preload adapter.
 */
export function handle<K extends InvokeChannel>(
  channel: K,
  handler: (
    event: IpcMainInvokeEvent,
    ...args: IpcInvokeContract[K]['args']
  ) => IpcInvokeContract[K]['result'] | Promise<IpcInvokeContract[K]['result']>,
): void {
  ipcMain.handle(
    IPC_CHANNELS.invoke[channel],
    handler as (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
  );
}

export function onSend<K extends SendChannel>(
  channel: K,
  handler: (event: IpcMainEvent, ...args: IpcSendContract[K]['args']) => void,
): void {
  ipcMain.on(
    IPC_CHANNELS.send[channel],
    handler as (event: IpcMainEvent, ...args: unknown[]) => void,
  );
}

export function emit<K extends EventChannel>(
  sender: WebContents,
  channel: K,
  event: IpcEventContract[K],
): void {
  sender.send(IPC_CHANNELS.events[channel], event);
}
