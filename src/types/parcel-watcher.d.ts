declare module "@parcel/watcher" {
  export type Event = {
    type: string;
    path: string;
  };

  export type AsyncSubscription = {
    unsubscribe(): Promise<void>;
  };

  export function subscribe(
    dir: string,
    callback: (err: Error | null, events: Event[]) => void,
    opts?: Record<string, unknown>,
  ): Promise<AsyncSubscription>;

  export const getEventsSince: ((dir: string, snapshotPath: string) => Promise<Event[]>) | undefined;
  export const writeSnapshot: ((dir: string, snapshotPath: string) => Promise<unknown>) | undefined;
}
