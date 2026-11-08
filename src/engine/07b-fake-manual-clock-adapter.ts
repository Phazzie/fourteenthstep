/**
 * FILE 7B: 07b-fake-manual-clock-adapter.ts
 * Section 4: The Infrastructure Layer (Fake ClockOutlet & BroadcastOutlet Plug)
 *
 * Allows automated verification tests to inspect scheduled ticks, verify
 * Atomic Save Before Broadcast ordering, and advance the autonomous heartbeat
 * deterministically without real timers.
 */

import {
  BroadcastOutlet,
  ClockOutlet,
  MeetingState,
} from './00-contracts-and-seams';
import { isMeetingStateRecord } from './06b-fake-memory-adapter';

export interface ScheduledTickRecord {
  readonly meetingId: string;
  readonly ownerUserId: string;
  readonly delayMs: number;
}

export class FakeManualClockAndBroadcastAdapter
  implements ClockOutlet, BroadcastOutlet
{
  private readonly scheduledTicks = new Map<string, ScheduledTickRecord>();
  private readonly publishedHistory: MeetingState[] = [];
  private currentSimulatedTimeMs = 1_700_000_000_000;

  scheduleNextTick(
    meetingId: string,
    ownerUserId: string,
    delayMs: number,
  ): void {
    // Prevent duplicate overlapping timers for the same meetingId by overwriting.
    this.scheduledTicks.set(meetingId, {
      meetingId,
      ownerUserId,
      delayMs,
    });
  }

  cancelScheduledTick(meetingId: string): void {
    this.scheduledTicks.delete(meetingId);
  }

  async publishRoomUpdate(
    _meetingId: string,
    state: MeetingState,
  ): Promise<void> {
    // Store deep snapshot of published state
    const cloned: unknown = JSON.parse(JSON.stringify(state));
    if (isMeetingStateRecord(cloned)) {
      this.publishedHistory.push(cloned);
    }
  }

  hasScheduledTick(meetingId: string): boolean {
    return this.scheduledTicks.has(meetingId);
  }

  getScheduledTick(meetingId: string): ScheduledTickRecord | undefined {
    return this.scheduledTicks.get(meetingId);
  }

  getPublishedHistory(): readonly MeetingState[] {
    return this.publishedHistory;
  }

  popNextTickTimestamp(meetingId: string): number | undefined {
    const record = this.scheduledTicks.get(meetingId);
    if (!record) {
      return undefined;
    }
    this.scheduledTicks.delete(meetingId);
    this.currentSimulatedTimeMs += record.delayMs;
    return this.currentSimulatedTimeMs;
  }
}
