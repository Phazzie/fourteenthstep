/**
 * FILE 3: 03-autonomous-runner.ts
 * Section 2: The Application Layer (The Kitchen Manager — Traffic Control)
 *
 * Physical Law Compliance:
 * - Allowed Imports: ONLY 00-contracts-and-seams, 01-meeting-rules-chef, 02-speaker-selector-chef.
 * - Forbidden: Direct DB calls, LLM SDK calls, setTimeout/setInterval, HTTP frameworks.
 * - Zero hardcoded timers or strings (all sourced from injected MeetingConfig).
 * - Enforces Atomic Save FIRST -> Broadcast SECOND -> Schedule Next Tick THIRD.
 */

import {
  AIOutlet,
  BroadcastOutlet,
  ClockOutlet,
  MeetingConfig,
  MeetingState,
  StorageOutlet,
  TranscriptBeat,
  UserIntentAction,
} from './00-contracts-and-seams';
import { evaluateMeetingRules } from './01-meeting-rules-chef';
import { selectNextSpeaker } from './02-speaker-selector-chef';

export interface AutonomousRunnerDependencies {
  readonly storage: StorageOutlet;
  readonly ai: AIOutlet;
  readonly broadcast: BroadcastOutlet;
  readonly clock: ClockOutlet;
  readonly config: MeetingConfig;
}

export type HandleActionResult =
  | { readonly ok: true; readonly state: MeetingState }
  | {
      readonly ok: false;
      readonly error:
        | 'NOT_FOUND'
        | 'ACCESS_DENIED'
        | 'STORAGE_FAILURE'
        | 'AI_TRANSIENT_FAILURE';
    };

export class AutonomousMeetingRunner {
  private readonly storage: StorageOutlet;
  private readonly ai: AIOutlet;
  private readonly broadcast: BroadcastOutlet;
  private readonly clock: ClockOutlet;
  private readonly config: MeetingConfig;

  constructor(deps: AutonomousRunnerDependencies) {
    this.storage = deps.storage;
    this.ai = deps.ai;
    this.broadcast = deps.broadcast;
    this.clock = deps.clock;
    this.config = deps.config;
  }

  async handleAction(
    meetingId: string,
    requestingUserId: string,
    action: UserIntentAction,
  ): Promise<HandleActionResult> {
    // 1. Load meeting and strictly enforce ownerUserId === requestingUserId via StorageOutlet.
    const loadResult = await this.storage.loadMeeting(
      meetingId,
      requestingUserId,
    );
    if (!loadResult.ok) {
      return { ok: false, error: loadResult.error };
    }

    const state = loadResult.state;

    // 2. Handle JOIN_OR_REFRESH or START_MEETING
    if (
      action.type === 'JOIN_OR_REFRESH' ||
      action.type === 'START_MEETING'
    ) {
      const shouldRunLoop =
        action.type === 'START_MEETING' ? true : state.isAutonomousLoopRunning;

      const updatedState: MeetingState =
        action.type === 'START_MEETING' && !state.isAutonomousLoopRunning
          ? {
              ...state,
              isAutonomousLoopRunning: true,
              lastUpdatedTimestamp: state.lastUpdatedTimestamp + 1,
            }
          : state;

      if (action.type === 'START_MEETING' && !state.isAutonomousLoopRunning) {
        const saveRes = await this.storage.saveMeeting(updatedState);
        if (!saveRes.ok) {
          return { ok: false, error: saveRes.error };
        }
        await this.broadcast.publishRoomUpdate(meetingId, updatedState);
      }

      if (
        shouldRunLoop &&
        updatedState.currentPhase !== 'POST_MEETING_FELLOWSHIP' &&
        !updatedState.userHandRaised
      ) {
        this.clock.scheduleNextTick(
          meetingId,
          requestingUserId,
          this.config.pauseBetweenSpeakersMs,
        );
      }

      return { ok: true, state: updatedState };
    }

    // 3. Handle RAISE_HAND
    if (action.type === 'RAISE_HAND') {
      const updatedState: MeetingState = {
        ...state,
        userHandRaised: true,
        lastUpdatedTimestamp: state.lastUpdatedTimestamp + 1,
      };
      // Atomic Save First
      const saveResult = await this.storage.saveMeeting(updatedState);
      if (!saveResult.ok) {
        return { ok: false, error: saveResult.error };
      }
      // Broadcast Second (Do NOT cut off currently generating share)
      await this.broadcast.publishRoomUpdate(meetingId, updatedState);
      return { ok: true, state: updatedState };
    }

    // 4. Handle LOWER_HAND
    if (action.type === 'LOWER_HAND') {
      const updatedState: MeetingState = {
        ...state,
        userHandRaised: false,
        isAutonomousLoopRunning:
          state.currentPhase !== 'POST_MEETING_FELLOWSHIP',
        lastUpdatedTimestamp: state.lastUpdatedTimestamp + 1,
      };
      // Atomic Save First
      const saveResult = await this.storage.saveMeeting(updatedState);
      if (!saveResult.ok) {
        return { ok: false, error: saveResult.error };
      }
      // Broadcast Second
      await this.broadcast.publishRoomUpdate(meetingId, updatedState);
      // Schedule Next Tick Third (using configured handLoweredResumeDelayMs, e.g. 500ms)
      if (updatedState.currentPhase !== 'POST_MEETING_FELLOWSHIP') {
        this.clock.scheduleNextTick(
          meetingId,
          requestingUserId,
          this.config.handLoweredResumeDelayMs,
        );
      }
      return { ok: true, state: updatedState };
    }

    // 5. Handle RESUME_FROM_CRISIS
    if (action.type === 'RESUME_FROM_CRISIS') {
      const updatedState: MeetingState = {
        ...state,
        currentPhase: 'OPEN_SHARING',
        activeCrisisFlag: false,
        userHandRaised: false,
        beatsInCurrentPhase: 0,
        isAutonomousLoopRunning: true,
        lastUpdatedTimestamp: state.lastUpdatedTimestamp + 1,
      };
      const saveResult = await this.storage.saveMeeting(updatedState);
      if (!saveResult.ok) {
        return { ok: false, error: saveResult.error };
      }
      await this.broadcast.publishRoomUpdate(meetingId, updatedState);
      this.clock.scheduleNextTick(
        meetingId,
        requestingUserId,
        this.config.pauseBetweenSpeakersMs,
      );
      return { ok: true, state: updatedState };
    }

    // 6. Handle SUBMIT_SHARE
    if (action.type === 'SUBMIT_SHARE') {
      const userBeat: TranscriptBeat = {
        beatId: `${meetingId}-${state.transcript.length + 1}`,
        speakerId: 'USER',
        speakerName: state.userName ?? this.config.fallbackVisitorName,
        speakerRole: 'USER',
        dialogueText: action.dialogueText,
        timestamp: action.timestamp,
        phaseWhenSpoken: state.currentPhase,
        emotionalTone: this.config.defaultUserShareTone,
      };

      const ruleEvaluation = evaluateMeetingRules(
        state,
        userBeat,
        this.config,
      );

      const updatedState: MeetingState = {
        ...state,
        transcript: [...state.transcript, userBeat],
        userHandRaised: false,
        currentPhase: ruleEvaluation.nextPhase,
        activeCrisisFlag: ruleEvaluation.activeCrisisFlag,
        beatsInCurrentPhase: ruleEvaluation.nextBeatsInPhaseCount,
        isAutonomousLoopRunning:
          ruleEvaluation.nextPhase !== 'POST_MEETING_FELLOWSHIP',
        lastUpdatedTimestamp: action.timestamp,
      };

      // Atomic Save First
      const saveResult = await this.storage.saveMeeting(updatedState);
      if (!saveResult.ok) {
        return { ok: false, error: saveResult.error };
      }

      // Broadcast Second
      await this.broadcast.publishRoomUpdate(meetingId, updatedState);

      // Schedule Next Tick Third
      if (updatedState.currentPhase !== 'POST_MEETING_FELLOWSHIP') {
        this.clock.scheduleNextTick(
          meetingId,
          requestingUserId,
          this.config.pauseBetweenSpeakersMs,
        );
      } else {
        this.clock.cancelScheduledTick(meetingId);
      }

      return { ok: true, state: updatedState };
    }

    // 7. Handle TICK (The Autonomous Heartbeat)
    if (action.type === 'TICK') {
      const decision = selectNextSpeaker(state, this.config);

      if (
        decision.type === 'WAIT_FOR_USER_INPUT' ||
        decision.type === 'MEETING_COMPLETE'
      ) {
        const nextLoopFlag =
          decision.type === 'MEETING_COMPLETE'
            ? false
            : state.isAutonomousLoopRunning;

        const pausedOrDoneState: MeetingState = {
          ...state,
          isAutonomousLoopRunning: nextLoopFlag,
          lastUpdatedTimestamp: action.timestamp,
        };

        const saveResult = await this.storage.saveMeeting(pausedOrDoneState);
        if (!saveResult.ok) {
          return { ok: false, error: saveResult.error };
        }

        await this.broadcast.publishRoomUpdate(meetingId, pausedOrDoneState);
        this.clock.cancelScheduledTick(meetingId);

        return { ok: true, state: pausedOrDoneState };
      }

      // decision.type === 'CALL_AI_CHARACTER'
      const aiResult = await this.ai.generateCharacterShare({
        character: decision.character,
        state,
        config: this.config,
      });

      if (!aiResult.ok) {
        // Do NOT corrupt state or crash the loop; broadcast current state and reschedule tick.
        await this.broadcast.publishRoomUpdate(meetingId, state);
        this.clock.scheduleNextTick(
          meetingId,
          requestingUserId,
          this.config.pauseBetweenSpeakersMs,
        );
        return { ok: false, error: 'AI_TRANSIENT_FAILURE' };
      }

      const ruleEvaluation = evaluateMeetingRules(
        state,
        aiResult.beat,
        this.config,
      );

      const nextState: MeetingState = {
        ...state,
        transcript: [...state.transcript, aiResult.beat],
        currentPhase: ruleEvaluation.nextPhase,
        activeCrisisFlag: ruleEvaluation.activeCrisisFlag,
        beatsInCurrentPhase: ruleEvaluation.nextBeatsInPhaseCount,
        isAutonomousLoopRunning:
          ruleEvaluation.nextPhase !== 'POST_MEETING_FELLOWSHIP',
        lastUpdatedTimestamp: action.timestamp,
      };

      // Atomic Save First
      const saveResult = await this.storage.saveMeeting(nextState);
      if (!saveResult.ok) {
        return { ok: false, error: saveResult.error };
      }

      // Broadcast Second
      await this.broadcast.publishRoomUpdate(meetingId, nextState);

      // Self-Perpetuate Third
      if (
        nextState.currentPhase !== 'POST_MEETING_FELLOWSHIP' &&
        !nextState.userHandRaised
      ) {
        this.clock.scheduleNextTick(
          meetingId,
          requestingUserId,
          this.config.pauseBetweenSpeakersMs,
        );
      } else {
        this.clock.cancelScheduledTick(meetingId);
      }

      return { ok: true, state: nextState };
    }

    return { ok: true, state };
  }
}
