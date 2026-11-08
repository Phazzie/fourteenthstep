/**
 * FILE 1: 01-meeting-rules-chef.ts
 * Section 1: The Domain Layer (Pure Rules)
 *
 * Physical Law Compliance:
 * - Allowed Imports: ONLY 00-contracts-and-seams.
 * - Zero external imports, zero side effects, zero hardcoded phase thresholds.
 */

import {
  MeetingConfig,
  MeetingPhase,
  MeetingState,
  TranscriptBeat,
} from './00-contracts-and-seams';

export interface PhaseRuleEvaluation {
  readonly nextPhase: MeetingPhase;
  readonly activeCrisisFlag: boolean;
  readonly nextBeatsInPhaseCount: number;
}

export function evaluateMeetingRules(
  currentState: MeetingState,
  latestBeat: TranscriptBeat,
  config: MeetingConfig,
): PhaseRuleEvaluation {
  const normalizedDialogue = latestBeat.dialogueText.toLowerCase();

  // 1. Inspect if any keyword in config.crisisTriggerKeywords is matched.
  const isCrisisTriggered = config.crisisTriggerKeywords.some((keyword) => {
    const normalizedKeyword = keyword.toLowerCase().trim();
    return (
      normalizedKeyword.length > 0 &&
      normalizedDialogue.includes(normalizedKeyword)
    );
  });

  // 2. If matched, immediately transition to CRISIS_MODE and reset beat count.
  if (isCrisisTriggered) {
    return {
      nextPhase: 'CRISIS_MODE',
      activeCrisisFlag: true,
      nextBeatsInPhaseCount: 0,
    };
  }

  // 3. If already in CRISIS_MODE with activeCrisisFlag === true, remain in CRISIS_MODE
  // until explicitly cleared via RESUME_FROM_CRISIS.
  if (
    currentState.currentPhase === 'CRISIS_MODE' &&
    currentState.activeCrisisFlag
  ) {
    return {
      nextPhase: 'CRISIS_MODE',
      activeCrisisFlag: true,
      nextBeatsInPhaseCount: currentState.beatsInCurrentPhase + 1,
    };
  }

  // 4. Increment beat count in current phase.
  const incrementedBeats = currentState.beatsInCurrentPhase + 1;

  // 5. Evaluate phase transitions deterministically using config thresholds.
  switch (currentState.currentPhase) {
    case 'PRE_MEETING_CHATTER': {
      if (incrementedBeats >= config.preMeetingChatterRequiredBeats) {
        return {
          nextPhase: 'OPENING',
          activeCrisisFlag: false,
          nextBeatsInPhaseCount: 0,
        };
      }
      return {
        nextPhase: 'PRE_MEETING_CHATTER',
        activeCrisisFlag: false,
        nextBeatsInPhaseCount: incrementedBeats,
      };
    }

    case 'OPENING': {
      if (incrementedBeats >= config.openingRequiredBeats) {
        return {
          nextPhase: 'TOPIC_INTRO',
          activeCrisisFlag: false,
          nextBeatsInPhaseCount: 0,
        };
      }
      return {
        nextPhase: 'OPENING',
        activeCrisisFlag: false,
        nextBeatsInPhaseCount: incrementedBeats,
      };
    }

    case 'TOPIC_INTRO': {
      if (incrementedBeats >= config.topicIntroRequiredBeats) {
        return {
          nextPhase: 'OPEN_SHARING',
          activeCrisisFlag: false,
          nextBeatsInPhaseCount: 0,
        };
      }
      return {
        nextPhase: 'TOPIC_INTRO',
        activeCrisisFlag: false,
        nextBeatsInPhaseCount: incrementedBeats,
      };
    }

    case 'OPEN_SHARING': {
      if (incrementedBeats >= config.maxOpenSharesBeforeClosing) {
        return {
          nextPhase: 'CLOSING',
          activeCrisisFlag: false,
          nextBeatsInPhaseCount: 0,
        };
      }
      return {
        nextPhase: 'OPEN_SHARING',
        activeCrisisFlag: false,
        nextBeatsInPhaseCount: incrementedBeats,
      };
    }

    case 'CLOSING': {
      if (incrementedBeats >= config.closingRequiredBeats) {
        return {
          nextPhase: 'POST_MEETING_FELLOWSHIP',
          activeCrisisFlag: false,
          nextBeatsInPhaseCount: 0,
        };
      }
      return {
        nextPhase: 'CLOSING',
        activeCrisisFlag: false,
        nextBeatsInPhaseCount: incrementedBeats,
      };
    }

    case 'CRISIS_MODE': {
      return {
        nextPhase: 'OPEN_SHARING',
        activeCrisisFlag: false,
        nextBeatsInPhaseCount: 0,
      };
    }

    case 'POST_MEETING_FELLOWSHIP': {
      return {
        nextPhase: 'POST_MEETING_FELLOWSHIP',
        activeCrisisFlag: false,
        nextBeatsInPhaseCount: incrementedBeats,
      };
    }
  }
}
