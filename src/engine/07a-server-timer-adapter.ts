/**
 * FILE 7A: 07a-server-timer-adapter.ts
 * Section 4: The Infrastructure Layer (Real ClockOutlet & BroadcastOutlet Plug)
 *
 * - Manages a per-meeting server timer map (Map<string, NodeJS.Timeout>) that
 *   invokes autonomousRunner.handleAction(meetingId, ownerUserId, { type: 'TICK', timestamp: Date.now() }).
 * - Prevents duplicate overlapping timers and concurrent in-flight ticks for the same meetingId.
 * - Pushes real-time Server-Sent Events (SSE) updates to connected browser clients.
 */

import {
  BroadcastOutlet,
  ClockOutlet,
  MeetingState,
} from './00-contracts-and-seams';

export type TickCallback = (
  meetingId: string,
  ownerUserId: string,
  timestamp: number,
) => Promise<void>;

export type SseSubscriber = (state: MeetingState) => void;

export class ServerTimerAndBroadcastAdapter
  implements ClockOutlet, BroadcastOutlet
{
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly inFlightRooms = new Set<string>();
  private readonly subscribers = new Map<string, Set<SseSubscriber>>();
  private tickHandler: TickCallback | null = null;

  bindTickHandler(handler: TickCallback): void {
    this.tickHandler = handler;
  }

  scheduleNextTick(
    meetingId: string,
    ownerUserId: string,
    delayMs: number,
  ): void {
    // Always cancel any existing timer for this meetingId to prevent overlapping ticks
    this.cancelScheduledTick(meetingId);

    const safeDelay = Math.max(250, delayMs);
    const timeoutHandle = setTimeout(() => {
      this.timers.delete(meetingId);
      if (!this.tickHandler) {
        return;
      }

      // Guard against concurrent in-flight AI generation for the same room
      if (this.inFlightRooms.has(meetingId)) {
        this.scheduleNextTick(meetingId, ownerUserId, safeDelay);
        return;
      }

      this.inFlightRooms.add(meetingId);
      void this.tickHandler(meetingId, ownerUserId, Date.now()).finally(() => {
        this.inFlightRooms.delete(meetingId);
      });
    }, safeDelay);

    this.timers.set(meetingId, timeoutHandle);
  }

  cancelScheduledTick(meetingId: string): void {
    const existing = this.timers.get(meetingId);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(meetingId);
    }
  }

  async publishRoomUpdate(
    meetingId: string,
    state: MeetingState,
  ): Promise<void> {
    const roomSubscribers = this.subscribers.get(meetingId);
    if (!roomSubscribers || roomSubscribers.size === 0) {
      return;
    }

    for (const sendUpdate of roomSubscribers) {
      try {
        sendUpdate(state);
      } catch {
        // Ignore broken client stream; cleaned up on close
      }
    }
  }

  subscribeToRoom(meetingId: string, callback: SseSubscriber): () => void {
    let set = this.subscribers.get(meetingId);
    if (!set) {
      set = new Set<SseSubscriber>();
      this.subscribers.set(meetingId, set);
    }
    set.add(callback);

    return () => {
      const currentSet = this.subscribers.get(meetingId);
      if (currentSet) {
        currentSet.delete(callback);
        if (currentSet.size === 0) {
          this.subscribers.delete(meetingId);
        }
      }
    };
  }
}
