/**
 * FILE 8: 08-app-wiring.ts
 * Section 4: Composition Root (The Startup Switchboard)
 *
 * Centralizes all MeetingConfig constants, character roster lore, and
 * wires either the Real Infrastructure Adapters (05a, 06a, 07a) or the
 * Fake Adapters (05b, 06b, 07b) into 03-autonomous-runner via a single flag.
 */

import {
  AIOutlet,
  BroadcastOutlet,
  CharacterProfile,
  ClockOutlet,
  MeetingConfig,
  MeetingState,
  StorageOutlet,
} from './00-contracts-and-seams';
import { AutonomousMeetingRunner } from './03-autonomous-runner';
import { LlmVoiceAdapter } from './05a-llm-voice-adapter';
import { FakeVoiceAdapter } from './05b-fake-voice-adapter';
import { PersistenceStorageAdapter } from './06a-persistence-adapter';
import { FakeMemoryStorageAdapter } from './06b-fake-memory-adapter';
import { ServerTimerAndBroadcastAdapter } from './07a-server-timer-adapter';
import { FakeManualClockAndBroadcastAdapter } from './07b-fake-manual-clock-adapter';

export const DEFAULT_MEETING_CONFIG: MeetingConfig = {
  preMeetingChatterRequiredBeats: 1,
  openingRequiredBeats: 1,
  topicIntroRequiredBeats: 1,
  maxOpenSharesBeforeClosing: 5,
  closingRequiredBeats: 1,
  pauseBetweenSpeakersMs: 5500,
  handLoweredResumeDelayMs: 500,
  defaultUserShareTone: 'Honest & Grounded',
  fallbackVisitorName: 'Visitor',
  crisisTriggerKeywords: [
    'end it all',
    'kill myself',
    'suicide',
    'overdose',
    'relapsed tonight',
    'want to die',
    'cant keep going',
    'hurt myself',
  ],
};

export const DEFAULT_MEETING_TOPICS: readonly string[] = [
  'Staying Present When the Street Noise Gets Loud',
  'The Difference Between Secrecy and Solitude',
  'Rebuilding Trust One Uncomfortable Truth at a Time',
  'Letting Go of the Old Armor After Midnight',
];

export const DEFAULT_FELLOWSHIP_ROSTER: readonly CharacterProfile[] = [
  {
    id: 'char-marcus',
    name: 'Marcus V.',
    role: 'CHAIRPERSON',
    archetype: 'Late-Shift Transit Mechanic · 14 Years Clean',
    voiceExamples: [
      'We do not shoot our wounded in this basement, and we do not grade anybody’s share.',
      'My ego wants a parade for doing basic human things, so sitting in this plastic chair keeps me right-sized.',
    ],
    personalLore: [
      'spent two winters sleeping in a rusted 1998 Civic behind the bus depot before walking down these stairs',
      'still keeps his tarnished 24-hour aluminum chip taped inside his toolbox lid',
    ],
    recurringJokes: [
      'the church basement radiator only knows two settings: Siberia or surface of the sun',
      'the decaf pot has not been washed since the Bush administration',
    ],
    speakingTendencyWeight: 2,
  },
  {
    id: 'char-elena',
    name: 'Elena R.',
    role: 'SPONSOR',
    archetype: 'Retired ER Triage Nurse · 9 Years Clean',
    voiceExamples: [
      'Feelings are real, baby, but they are terrible drivers—let them sit in the backseat tonight.',
      'You do not have to figure out the rest of the year tonight; you only have to survive the next twenty minutes.',
    ],
    personalLore: [
      'used to chart vitals for twelve hours straight while hiding tremors behind double surgical gloves',
      'sponsors six women on the east side and answers her flip phone at 3 a.m. without fail',
    ],
    recurringJokes: [
      'my sponsor still makes me return rogue shopping carts in the rain to build character',
      'if stale store-brand cookies cured addiction we would all be saints by now',
    ],
    speakingTendencyWeight: 3,
  },
  {
    id: 'char-devon',
    name: 'Devon K.',
    role: 'MEMBER',
    archetype: 'Restless Sound Engineer · 94 Days Clean',
    voiceExamples: [
      'Around 11 p.m. my brain starts remixing every mistake I made since 2019 in surround sound.',
      'Showing up when I have nothing profound to say is the only thing keeping me tethered.',
    ],
    personalLore: [
      'pawned his favorite analog synthesizer three times to cover rent and bad habits before getting honest',
      'rides the #14 night bus forty minutes each way just to sit in the back row here',
    ],
    recurringJokes: [
      'stacking metal folding chairs after the meeting is officially my entire fitness routine',
      'I came for the spiritual awakening and stayed because my apartment has zero heat',
    ],
    speakingTendencyWeight: 3,
  },
  {
    id: 'char-sasha',
    name: 'Sasha T.',
    role: 'MEMBER',
    archetype: 'Former Sous-Chef · 18 Months Clean',
    voiceExamples: [
      'Chaos used to feel like oxygen to me; quiet rooms used to scare me more than the sirens did.',
      'Gratitude is not a bumper sticker for me—it is just noticing that my keys still fit my own front door.',
    ],
    personalLore: [
      'walked out of a Michelin-starred kitchen line mid-service to check into detox',
      'now bakes sourdough at 4 a.m. for a neighborhood co-op where nobody screams',
    ],
    recurringJokes: [
      'whoever bought hazelnut creamer this week deserves a Nobel Peace Prize',
      'my therapist says I am making progress, which mostly means I pause three seconds before arguing',
    ],
    speakingTendencyWeight: 2,
  },
];

export interface WiredApplicationContainer {
  readonly runner: AutonomousMeetingRunner;
  readonly storage: StorageOutlet;
  readonly ai: AIOutlet;
  readonly broadcast: BroadcastOutlet;
  readonly clock: ClockOutlet;
  readonly config: MeetingConfig;
  readonly realServerAdapter?: ServerTimerAndBroadcastAdapter;
}

/**
 * Single-line switchboard between Real Infrastructure Plugs ('REAL')
 * and Fake Deterministic Plugs ('FAKE').
 */
export const ACTIVE_WIRING_MODE: 'REAL' | 'FAKE' = 'REAL';

export function createWiredApplication(
  mode: 'REAL' | 'FAKE' = ACTIVE_WIRING_MODE,
  customConfig: MeetingConfig = DEFAULT_MEETING_CONFIG,
): WiredApplicationContainer {
  if (mode === 'FAKE') {
    const storage = new FakeMemoryStorageAdapter();
    const ai = new FakeVoiceAdapter();
    const clockAndBroadcast = new FakeManualClockAndBroadcastAdapter();
    const runner = new AutonomousMeetingRunner({
      storage,
      ai,
      broadcast: clockAndBroadcast,
      clock: clockAndBroadcast,
      config: customConfig,
    });

    return {
      runner,
      storage,
      ai,
      broadcast: clockAndBroadcast,
      clock: clockAndBroadcast,
      config: customConfig,
    };
  }

  // REAL INFRASTRUCTURE PLUGS
  const storage = new PersistenceStorageAdapter();
  const ai = new LlmVoiceAdapter();
  const serverTimerAndBroadcast = new ServerTimerAndBroadcastAdapter();

  const runner = new AutonomousMeetingRunner({
    storage,
    ai,
    broadcast: serverTimerAndBroadcast,
    clock: serverTimerAndBroadcast,
    config: customConfig,
  });

  serverTimerAndBroadcast.bindTickHandler(
    async (meetingId, ownerUserId, timestamp) => {
      await runner.handleAction(meetingId, ownerUserId, {
        type: 'TICK',
        timestamp,
      });
    },
  );

  return {
    runner,
    storage,
    ai,
    broadcast: serverTimerAndBroadcast,
    clock: serverTimerAndBroadcast,
    config: customConfig,
    realServerAdapter: serverTimerAndBroadcast,
  };
}

export function createInitialMeetingState(params: {
  readonly meetingId: string;
  readonly ownerUserId: string;
  readonly userName: string;
  readonly topic?: string;
}): MeetingState {
  const cleanName = params.userName.trim() || 'Friend';
  const deterministicSeed = Array.from(params.meetingId).reduce(
    (acc, char) => acc + char.charCodeAt(0),
    14,
  );
  const selectedTopic =
    params.topic?.trim() ||
    DEFAULT_MEETING_TOPICS[deterministicSeed % DEFAULT_MEETING_TOPICS.length];

  return {
    meetingId: params.meetingId,
    ownerUserId: params.ownerUserId,
    userName: cleanName,
    topic: selectedTopic,
    currentPhase: 'PRE_MEETING_CHATTER',
    roster: DEFAULT_FELLOWSHIP_ROSTER,
    transcript: [],
    userHandRaised: false,
    activeCrisisFlag: false,
    beatsInCurrentPhase: 0,
    isAutonomousLoopRunning: true,
    deterministicSeed,
    lastUpdatedTimestamp: Date.now(),
  };
}
