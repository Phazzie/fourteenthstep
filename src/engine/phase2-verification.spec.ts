/**
 * PHASE 2 AUTOMATED VERIFICATION SUITE + ADVERSARIAL AUDIT TESTS
 * Proves that a full meeting runs autonomously from PRE_MEETING_CHATTER through
 * POST_MEETING_FELLOWSHIP (CLOSING sequence), handles "RAISE_HAND" / "LOWER_HAND" (500ms)
 * interruption, enforces ownerUserId privacy, recovers from transient AI failures
 * without state corruption, and enters CRISIS_MODE using ONLY the Fake Adapters.
 */

import { describe, expect, it } from 'vitest';
import {
  CharacterProfile,
  MeetingConfig,
  MeetingState,
} from './00-contracts-and-seams';
import { AutonomousMeetingRunner } from './03-autonomous-runner';
import { FakeVoiceAdapter } from './05b-fake-voice-adapter';
import { FakeMemoryStorageAdapter } from './06b-fake-memory-adapter';
import { FakeManualClockAndBroadcastAdapter } from './07b-fake-manual-clock-adapter';

const TEST_CONFIG: MeetingConfig = {
  preMeetingChatterRequiredBeats: 1,
  openingRequiredBeats: 1,
  topicIntroRequiredBeats: 1,
  maxOpenSharesBeforeClosing: 3,
  closingRequiredBeats: 1,
  pauseBetweenSpeakersMs: 2500,
  handLoweredResumeDelayMs: 500,
  defaultUserShareTone: 'Honest & Grounded',
  fallbackVisitorName: 'Visitor',
  crisisTriggerKeywords: [
    'end it all',
    'relapsed tonight',
    'cant keep going',
    'overdose',
  ],
};

const TEST_ROSTER: readonly CharacterProfile[] = [
  {
    id: 'char-marcus',
    name: 'Marcus V.',
    role: 'CHAIRPERSON',
    archetype: 'Old-Timer Chairperson (14 Years Clean)',
    voiceExamples: ['Let us keep the focus on today.'],
    personalLore: ['slept in a 1998 Honda Civic before finding the basement'],
    recurringJokes: ['the decaf pot is just an urban legend'],
    speakingTendencyWeight: 2,
  },
  {
    id: 'char-elena',
    name: 'Elena R.',
    role: 'SPONSOR',
    archetype: 'No-Nonsense Street Sponsor',
    voiceExamples: ['Feelings are not facts, kid.'],
    personalLore: ['worked three night shifts at the diner in early recovery'],
    recurringJokes: ['my sponsor still makes me return shopping carts'],
    speakingTendencyWeight: 3,
  },
  {
    id: 'char-devon',
    name: 'Devon K.',
    role: 'MEMBER',
    archetype: 'Restless Creative (90 Days)',
    voiceExamples: ['My head gets loud around midnight.'],
    personalLore: ['traded studio gear for rent money two winters ago'],
    recurringJokes: ['folding metal chairs is my only cardio'],
    speakingTendencyWeight: 2,
  },
];

function createSeedMeetingState(
  meetingId: string,
  ownerUserId: string,
): MeetingState {
  return {
    meetingId,
    ownerUserId,
    userName: 'Alex',
    topic: 'Surrendering Control When the Street Gets Loud',
    currentPhase: 'PRE_MEETING_CHATTER',
    roster: TEST_ROSTER,
    transcript: [],
    userHandRaised: false,
    activeCrisisFlag: false,
    beatsInCurrentPhase: 0,
    isAutonomousLoopRunning: true,
    deterministicSeed: 42,
    lastUpdatedTimestamp: 1_700_000_000_000,
  };
}

describe('The 14th Step — Phase 2 Autonomous Engine & Adversarial Verification', () => {
  it('runs a full meeting autonomously from PRE_MEETING_CHATTER through CLOSING to POST_MEETING_FELLOWSHIP', async () => {
    const storage = new FakeMemoryStorageAdapter();
    const ai = new FakeVoiceAdapter();
    const clockAndBroadcast = new FakeManualClockAndBroadcastAdapter();

    const runner = new AutonomousMeetingRunner({
      storage,
      ai,
      broadcast: clockAndBroadcast,
      clock: clockAndBroadcast,
      config: TEST_CONFIG,
    });

    const initial = createSeedMeetingState('room-autonomous-1', 'user-1');
    await storage.saveMeeting(initial);

    // Join and arm the first tick
    const joinRes = await runner.handleAction('room-autonomous-1', 'user-1', {
      type: 'JOIN_OR_REFRESH',
    });
    expect(joinRes.ok).toBe(true);
    expect(clockAndBroadcast.hasScheduledTick('room-autonomous-1')).toBe(true);

    const visitedPhases: string[] = [initial.currentPhase];

    // Step the manual clock until the meeting completes
    let safetyCounter = 0;
    while (
      clockAndBroadcast.hasScheduledTick('room-autonomous-1') &&
      safetyCounter < 20
    ) {
      safetyCounter += 1;
      const tickTimestamp =
        clockAndBroadcast.popNextTickTimestamp('room-autonomous-1')!;
      const tickRes = await runner.handleAction('room-autonomous-1', 'user-1', {
        type: 'TICK',
        timestamp: tickTimestamp,
      });
      expect(tickRes.ok).toBe(true);
      if (tickRes.ok) {
        if (
          visitedPhases[visitedPhases.length - 1] !== tickRes.state.currentPhase
        ) {
          visitedPhases.push(tickRes.state.currentPhase);
        }
      }
    }

    expect(visitedPhases).toEqual([
      'PRE_MEETING_CHATTER',
      'OPENING',
      'TOPIC_INTRO',
      'OPEN_SHARING',
      'CLOSING',
      'POST_MEETING_FELLOWSHIP',
    ]);

    const finalLoad = await storage.loadMeeting('room-autonomous-1', 'user-1');
    expect(finalLoad.ok).toBe(true);
    if (finalLoad.ok) {
      expect(finalLoad.state.currentPhase).toBe('POST_MEETING_FELLOWSHIP');
      expect(finalLoad.state.transcript.length).toBe(7);
    }
  });

  it('handles RAISE_HAND interruption, LOWER_HAND 500ms resume, and SUBMIT_SHARE during OPEN_SHARING', async () => {
    const storage = new FakeMemoryStorageAdapter();
    const ai = new FakeVoiceAdapter();
    const clockAndBroadcast = new FakeManualClockAndBroadcastAdapter();

    const runner = new AutonomousMeetingRunner({
      storage,
      ai,
      broadcast: clockAndBroadcast,
      clock: clockAndBroadcast,
      config: TEST_CONFIG,
    });

    const initial: MeetingState = {
      ...createSeedMeetingState('room-hand-1', 'user-1'),
      currentPhase: 'OPEN_SHARING',
      beatsInCurrentPhase: 0,
    };
    await storage.saveMeeting(initial);

    // User raises hand
    const raiseRes = await runner.handleAction('room-hand-1', 'user-1', {
      type: 'RAISE_HAND',
    });
    expect(raiseRes.ok).toBe(true);
    if (raiseRes.ok) {
      expect(raiseRes.state.userHandRaised).toBe(true);
    }

    // Next autonomous tick yields floor to user (WAIT_FOR_USER_INPUT) and cancels timer
    const tickRes = await runner.handleAction('room-hand-1', 'user-1', {
      type: 'TICK',
      timestamp: 1_700_000_005_000,
    });
    expect(tickRes.ok).toBe(true);
    expect(clockAndBroadcast.hasScheduledTick('room-hand-1')).toBe(false);

    // User lowers hand -> schedules immediate 500ms resume tick
    const lowerRes = await runner.handleAction('room-hand-1', 'user-1', {
      type: 'LOWER_HAND',
    });
    expect(lowerRes.ok).toBe(true);
    expect(clockAndBroadcast.getScheduledTick('room-hand-1')?.delayMs).toBe(500);

    // User raises hand again and submits their share
    await runner.handleAction('room-hand-1', 'user-1', { type: 'RAISE_HAND' });
    const shareRes = await runner.handleAction('room-hand-1', 'user-1', {
      type: 'SUBMIT_SHARE',
      dialogueText:
        'Just grateful to be sitting in this circle tonight and staying honest.',
      timestamp: 1_700_000_010_000,
    });
    expect(shareRes.ok).toBe(true);
    if (shareRes.ok) {
      expect(shareRes.state.userHandRaised).toBe(false);
      expect(shareRes.state.transcript.length).toBe(1);
      expect(shareRes.state.transcript[0].speakerId).toBe('USER');
      expect(clockAndBroadcast.getScheduledTick('room-hand-1')?.delayMs).toBe(
        2500,
      );
    }
  });

  it('immediately enters CRISIS_MODE when crisis keywords are spoken, Sponsor responds next, and RESUME_FROM_CRISIS recovers', async () => {
    const storage = new FakeMemoryStorageAdapter();
    const ai = new FakeVoiceAdapter();
    const clockAndBroadcast = new FakeManualClockAndBroadcastAdapter();

    const runner = new AutonomousMeetingRunner({
      storage,
      ai,
      broadcast: clockAndBroadcast,
      clock: clockAndBroadcast,
      config: TEST_CONFIG,
    });

    const initial: MeetingState = {
      ...createSeedMeetingState('room-crisis-1', 'user-1'),
      currentPhase: 'OPEN_SHARING',
    };
    await storage.saveMeeting(initial);

    // User submits a share matching crisisTriggerKeywords
    const crisisShareRes = await runner.handleAction(
      'room-crisis-1',
      'user-1',
      {
        type: 'SUBMIT_SHARE',
        dialogueText: 'I relapsed tonight and I cant keep going like this.',
        timestamp: 1_700_000_020_000,
      },
    );

    expect(crisisShareRes.ok).toBe(true);
    if (crisisShareRes.ok) {
      expect(crisisShareRes.state.currentPhase).toBe('CRISIS_MODE');
      expect(crisisShareRes.state.activeCrisisFlag).toBe(true);
    }

    // Next tick must call the SPONSOR ('char-elena') to respond supportively
    const sponsorTickRes = await runner.handleAction(
      'room-crisis-1',
      'user-1',
      {
        type: 'TICK',
        timestamp: 1_700_000_022_500,
      },
    );
    expect(sponsorTickRes.ok).toBe(true);
    if (sponsorTickRes.ok) {
      const latestBeat =
        sponsorTickRes.state.transcript[
          sponsorTickRes.state.transcript.length - 1
        ];
      expect(latestBeat.speakerRole).toBe('SPONSOR');
      expect(latestBeat.phaseWhenSpoken).toBe('CRISIS_MODE');
    }

    // Subsequent tick in CRISIS_MODE after Sponsor spoke must wait for user input
    const waitTickRes = await runner.handleAction('room-crisis-1', 'user-1', {
      type: 'TICK',
      timestamp: 1_700_000_025_000,
    });
    expect(waitTickRes.ok).toBe(true);
    expect(clockAndBroadcast.hasScheduledTick('room-crisis-1')).toBe(false);

    // Resume from crisis transitions cleanly back to OPEN_SHARING and arms clock
    const resumeRes = await runner.handleAction('room-crisis-1', 'user-1', {
      type: 'RESUME_FROM_CRISIS',
    });
    expect(resumeRes.ok).toBe(true);
    if (resumeRes.ok) {
      expect(resumeRes.state.currentPhase).toBe('OPEN_SHARING');
      expect(resumeRes.state.activeCrisisFlag).toBe(false);
      expect(clockAndBroadcast.hasScheduledTick('room-crisis-1')).toBe(true);
    }

    // Enforces strict ACCESS_DENIED if another user tries to load the private room
    const intruderRes = await runner.handleAction(
      'room-crisis-1',
      'intruder-user-999',
      {
        type: 'JOIN_OR_REFRESH',
      },
    );
    expect(theIntruderCheck(intruderRes)).toBe('ACCESS_DENIED');
  });

  it('survives transient AI failures without corrupting state and reschedules the next tick', async () => {
    const storage = new FakeMemoryStorageAdapter();
    const ai = new FakeVoiceAdapter();
    const clockAndBroadcast = new FakeManualClockAndBroadcastAdapter();

    const runner = new AutonomousMeetingRunner({
      storage,
      ai,
      broadcast: clockAndBroadcast,
      clock: clockAndBroadcast,
      config: TEST_CONFIG,
    });

    const initial = createSeedMeetingState('room-resilience-1', 'user-1');
    await storage.saveMeeting(initial);

    ai.setSimulateTransientFailure(true);
    const failedTick = await runner.handleAction(
      'room-resilience-1',
      'user-1',
      {
        type: 'TICK',
        timestamp: 1_700_000_001_000,
      },
    );

    expect(failedTick.ok).toBe(false);
    expect(clockAndBroadcast.hasScheduledTick('room-resilience-1')).toBe(true);

    const loadedAfterFailure = await storage.loadMeeting(
      'room-resilience-1',
      'user-1',
    );
    expect(loadedAfterFailure.ok).toBe(true);
    if (loadedAfterFailure.ok) {
      expect(loadedAfterFailure.state.transcript.length).toBe(0);
      expect(loadedAfterFailure.state.currentPhase).toBe('PRE_MEETING_CHATTER');
    }
  });
});

function theIntruderCheck(res: { ok: boolean; error?: string }): string {
  return res.ok ? 'ALLOWED' : (res.error ?? 'UNKNOWN');
}
