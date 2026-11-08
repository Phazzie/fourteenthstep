/**
 * FILE 0: 00-contracts-and-seams.ts
 * Section 0: The Seams (The Wall Outlets & Shared Dictionary)
 *
 * Physical Law Compliance:
 * - Zero active logic or math.
 * - Zero external imports (pure TypeScript interfaces and types only).
 */

export type MeetingPhase =
  | 'PRE_MEETING_CHATTER'
  | 'OPENING'
  | 'TOPIC_INTRO'
  | 'OPEN_SHARING'
  | 'CRISIS_MODE'
  | 'CLOSING'
  | 'POST_MEETING_FELLOWSHIP';

export interface CharacterProfile {
  readonly id: string;
  readonly name: string;
  readonly role: 'CHAIRPERSON' | 'SPONSOR' | 'MEMBER' | 'VISITOR';
  readonly archetype: string;
  readonly voiceExamples: readonly string[];
  readonly personalLore: readonly string[];
  readonly recurringJokes: readonly string[];
  readonly speakingTendencyWeight: number;
}

export interface TranscriptBeat {
  readonly beatId: string;
  readonly speakerId: string;
  readonly speakerName: string;
  readonly speakerRole: 'USER' | CharacterProfile['role'];
  readonly dialogueText: string;
  readonly timestamp: number;
  readonly phaseWhenSpoken: MeetingPhase;
  readonly emotionalTone: string;
}

export interface MeetingState {
  readonly meetingId: string;
  readonly ownerUserId: string;
  readonly userName?: string;
  readonly topic: string;
  readonly currentPhase: MeetingPhase;
  readonly roster: readonly CharacterProfile[];
  readonly transcript: readonly TranscriptBeat[];
  readonly userHandRaised: boolean;
  readonly activeCrisisFlag: boolean;
  readonly beatsInCurrentPhase: number;
  readonly isAutonomousLoopRunning: boolean;
  readonly deterministicSeed: number;
  readonly lastUpdatedTimestamp: number;
}

export interface MeetingConfig {
  readonly preMeetingChatterRequiredBeats: number;
  readonly openingRequiredBeats: number;
  readonly topicIntroRequiredBeats: number;
  readonly maxOpenSharesBeforeClosing: number;
  readonly closingRequiredBeats: number;
  readonly pauseBetweenSpeakersMs: number;
  readonly handLoweredResumeDelayMs: number;
  readonly defaultUserShareTone: string;
  readonly fallbackVisitorName: string;
  readonly crisisTriggerKeywords: readonly string[];
}

export type NextActionDecision =
  | {
      readonly type: 'CALL_AI_CHARACTER';
      readonly character: CharacterProfile;
      readonly reason: string;
    }
  | {
      readonly type: 'WAIT_FOR_USER_INPUT';
      readonly reason: string;
    }
  | {
      readonly type: 'MEETING_COMPLETE';
      readonly reason: string;
    };

export type UserIntentAction =
  | { readonly type: 'JOIN_OR_REFRESH' }
  | { readonly type: 'START_MEETING' }
  | { readonly type: 'RAISE_HAND' }
  | { readonly type: 'LOWER_HAND' }
  | {
      readonly type: 'SUBMIT_SHARE';
      readonly dialogueText: string;
      readonly timestamp: number;
    }
  | { readonly type: 'RESUME_FROM_CRISIS' }
  | { readonly type: 'TICK'; readonly timestamp: number };

export type StorageLoadResult =
  | { readonly ok: true; readonly state: MeetingState }
  | {
      readonly ok: false;
      readonly error: 'NOT_FOUND' | 'ACCESS_DENIED' | 'STORAGE_FAILURE';
    };

export type StorageSaveResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: 'STORAGE_FAILURE' };

export interface StorageOutlet {
  loadMeeting(
    meetingId: string,
    requestingUserId: string,
  ): Promise<StorageLoadResult>;
  saveMeeting(state: MeetingState): Promise<StorageSaveResult>;
}

export type AIGenerateResult =
  | { readonly ok: true; readonly beat: TranscriptBeat }
  | { readonly ok: false; readonly error: string };

export interface AIOutlet {
  generateCharacterShare(params: {
    readonly character: CharacterProfile;
    readonly state: MeetingState;
    readonly config: MeetingConfig;
  }): Promise<AIGenerateResult>;
}

export interface BroadcastOutlet {
  publishRoomUpdate(meetingId: string, state: MeetingState): Promise<void>;
}

export interface ClockOutlet {
  scheduleNextTick(
    meetingId: string,
    ownerUserId: string,
    delayMs: number,
  ): void;
  cancelScheduledTick(meetingId: string): void;
}
