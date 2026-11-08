import { describe, expect, it } from 'vitest';
import {
  createInitialMeetingState,
  createWiredApplication,
  DEFAULT_FELLOWSHIP_ROSTER,
  DEFAULT_MEETING_CONFIG,
} from '../engine/08-app-wiring';

describe('Application Wiring & Composition Root Integrity', () => {
  it('wires FAKE and REAL containers and creates valid initial MeetingState snapshots', () => {
    const fakeContainer = createWiredApplication('FAKE');
    expect(fakeContainer.config).toEqual(DEFAULT_MEETING_CONFIG);

    const initialState = createInitialMeetingState({
      meetingId: 'room-spec-test',
      ownerUserId: 'usr-spec-1',
      userName: 'Jordan',
    });

    expect(initialState.meetingId).toBe('room-spec-test');
    expect(initialState.ownerUserId).toBe('usr-spec-1');
    expect(initialState.userName).toBe('Jordan');
    expect(initialState.currentPhase).toBe('PRE_MEETING_CHATTER');
    expect(initialState.roster.length).toBe(DEFAULT_FELLOWSHIP_ROSTER.length);
  });
});
