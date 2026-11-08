/**
 * FILE 6B: 06b-fake-memory-adapter.ts
 * Section 4: The Infrastructure Layer (Fake StorageOutlet Plug)
 *
 * Stores MeetingState snapshots in an isolated in-memory Map, performing
 * deep immutable cloning so roster mappings, visitor lore, and transcript
 * arrays serialize/deserialize cleanly and enforcing strict ownerUserId ownership.
 */

import {
  MeetingState,
  StorageLoadResult,
  StorageOutlet,
  StorageSaveResult,
} from './00-contracts-and-seams';

export function isMeetingStateRecord(value: unknown): value is MeetingState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj['meetingId'] === 'string' &&
    typeof obj['ownerUserId'] === 'string' &&
    typeof obj['topic'] === 'string' &&
    typeof obj['currentPhase'] === 'string' &&
    Array.isArray(obj['roster']) &&
    Array.isArray(obj['transcript']) &&
    typeof obj['userHandRaised'] === 'boolean' &&
    typeof obj['activeCrisisFlag'] === 'boolean' &&
    typeof obj['beatsInCurrentPhase'] === 'number' &&
    typeof obj['isAutonomousLoopRunning'] === 'boolean' &&
    typeof obj['deterministicSeed'] === 'number' &&
    typeof obj['lastUpdatedTimestamp'] === 'number'
  );
}

export class FakeMemoryStorageAdapter implements StorageOutlet {
  private readonly store = new Map<string, string>();
  private shouldSimulateFailure = false;

  setSimulateFailure(flag: boolean): void {
    this.shouldSimulateFailure = flag;
  }

  async loadMeeting(
    meetingId: string,
    requestingUserId: string,
  ): Promise<StorageLoadResult> {
    if (this.shouldSimulateFailure) {
      return { ok: false, error: 'STORAGE_FAILURE' };
    }

    const serialized = this.store.get(meetingId);
    if (!serialized) {
      return { ok: false, error: 'NOT_FOUND' };
    }

    try {
      const parsed: unknown = JSON.parse(serialized);
      if (!isMeetingStateRecord(parsed)) {
        return { ok: false, error: 'STORAGE_FAILURE' };
      }
      if (parsed.ownerUserId !== requestingUserId) {
        return { ok: false, error: 'ACCESS_DENIED' };
      }
      return { ok: true, state: parsed };
    } catch {
      return { ok: false, error: 'STORAGE_FAILURE' };
    }
  }

  async saveMeeting(state: MeetingState): Promise<StorageSaveResult> {
    if (this.shouldSimulateFailure) {
      return { ok: false, error: 'STORAGE_FAILURE' };
    }

    try {
      const serialized = JSON.stringify(state);
      this.store.set(state.meetingId, serialized);
      return { ok: true };
    } catch {
      return { ok: false, error: 'STORAGE_FAILURE' };
    }
  }

  listMeetingsForOwner(ownerUserId: string): readonly MeetingState[] {
    const matches: MeetingState[] = [];
    for (const serialized of this.store.values()) {
      try {
        const parsed: unknown = JSON.parse(serialized);
        if (isMeetingStateRecord(parsed) && parsed.ownerUserId === ownerUserId) {
          matches.push(parsed);
        }
      } catch {
        // Ignore malformed entry
      }
    }
    return matches;
  }
}
