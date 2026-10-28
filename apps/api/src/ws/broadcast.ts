import { WsEvent } from '@relicbourse/shared';

type EventBroadcaster = (marketId: string, events: WsEvent[]) => void;

let activeBroadcaster: EventBroadcaster | null = null;

export function registerBroadcaster(broadcaster: EventBroadcaster): void {
  activeBroadcaster = broadcaster;
}

export function broadcastMarketEvents(marketId: string, events: WsEvent[]): void {
  // Commit-then-broadcast contract:
  // Routes call this function ONLY AFTER the database transaction has committed.
  // Never called inside withTransaction.
  if (activeBroadcaster && events.length > 0) {
    activeBroadcaster(marketId, events);
  }
}
