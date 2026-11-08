/**
 * FILE 2: 02-speaker-selector-chef.ts
 * Section 1: The Domain Layer (Pure Rules)
 *
 * Physical Law Compliance:
 * - Allowed Imports: ONLY 00-contracts-and-seams.
 * - Forbidden: Math.random(), timers, external libraries, hardcoded thresholds.
 * - Uses deterministic seed + transcript length weighted by speakingTendencyWeight.
 */

import {
  CharacterProfile,
  MeetingConfig,
  MeetingState,
  NextActionDecision,
} from './00-contracts-and-seams';

function selectChairperson(
  roster: readonly CharacterProfile[],
): CharacterProfile {
  const chair = roster.find((member) => member.role === 'CHAIRPERSON');
  return chair ?? roster[0];
}

function selectCrisisSupportLeader(
  roster: readonly CharacterProfile[],
): CharacterProfile {
  const sponsor = roster.find((member) => member.role === 'SPONSOR');
  if (sponsor) {
    return sponsor;
  }
  return selectChairperson(roster);
}

function pickWeightedCandidateDeterministically(
  candidates: readonly CharacterProfile[],
  seedValue: number,
): CharacterProfile {
  if (candidates.length === 1) {
    return candidates[0];
  }

  const weightedPool: CharacterProfile[] = [];
  for (const candidate of candidates) {
    const normalizedWeight = Math.max(
      1,
      Math.round(candidate.speakingTendencyWeight),
    );
    for (let index = 0; index < normalizedWeight; index += 1) {
      weightedPool.push(candidate);
    }
  }

  const poolToUse = weightedPool.length > 0 ? weightedPool : candidates;
  const safeIndex = Math.abs(seedValue) % poolToUse.length;
  return poolToUse[safeIndex];
}

export function selectNextSpeaker(
  currentState: MeetingState,
  config: MeetingConfig,
): NextActionDecision {
  // 1. If POST_MEETING_FELLOWSHIP (or if max shares exceeded), the meeting is complete.
  if (currentState.currentPhase === 'POST_MEETING_FELLOWSHIP') {
    return {
      type: 'MEETING_COMPLETE',
      reason: `Closing sequence finished (${config.closingRequiredBeats} closing beats completed).`,
    };
  }

  const transcriptLength = currentState.transcript.length;
  const lastBeat =
    transcriptLength > 0
      ? currentState.transcript[transcriptLength - 1]
      : undefined;

  // 2. If CRISIS_MODE, select SPONSOR or CHAIRPERSON to respond supportively.
  // If the last speaker in transcript was already the Sponsor/Chairperson in CRISIS_MODE,
  // yield the floor and wait for the user's response.
  if (currentState.currentPhase === 'CRISIS_MODE') {
    if (
      lastBeat &&
      lastBeat.phaseWhenSpoken === 'CRISIS_MODE' &&
      (lastBeat.speakerRole === 'SPONSOR' ||
        lastBeat.speakerRole === 'CHAIRPERSON')
    ) {
      return {
        type: 'WAIT_FOR_USER_INPUT',
        reason: 'Awaiting user response in crisis support mode.',
      };
    }

    const crisisSupportCharacter = selectCrisisSupportLeader(
      currentState.roster,
    );
    return {
      type: 'CALL_AI_CHARACTER',
      character: crisisSupportCharacter,
      reason: 'Crisis support intervention by Sponsor/Chairperson.',
    };
  }

  // 3. If userHandRaised === true and in OPEN_SHARING, pause AI loop for user input.
  if (
    currentState.userHandRaised &&
    currentState.currentPhase === 'OPEN_SHARING'
  ) {
    return {
      type: 'WAIT_FOR_USER_INPUT',
      reason: 'User raised hand to share.',
    };
  }

  // 4. If OPENING, TOPIC_INTRO, or CLOSING, select CHAIRPERSON (fallback to first roster member).
  if (
    currentState.currentPhase === 'OPENING' ||
    currentState.currentPhase === 'TOPIC_INTRO' ||
    currentState.currentPhase === 'CLOSING'
  ) {
    const chairperson = selectChairperson(currentState.roster);
    return {
      type: 'CALL_AI_CHARACTER',
      character: chairperson,
      reason: `Chairperson leads ${currentState.currentPhase}.`,
    };
  }

  // 5. If PRE_MEETING_CHATTER or OPEN_SHARING:
  const lastSpeakerId = lastBeat ? lastBeat.speakerId : undefined;

  // Filter roster to exclude lastSpeakerId so nobody speaks twice in a row.
  const nonRepeatingCandidates = currentState.roster.filter(
    (member) => member.id !== lastSpeakerId,
  );
  const candidateBase =
    nonRepeatingCandidates.length > 0
      ? nonRepeatingCandidates
      : currentState.roster;

  let eligibleCandidates: readonly CharacterProfile[] = candidateBase;

  if (currentState.currentPhase === 'OPEN_SHARING') {
    const speakersInOpenSharing = new Set(
      currentState.transcript
        .filter((beat) => beat.phaseWhenSpoken === 'OPEN_SHARING')
        .map((beat) => beat.speakerId),
    );

    const unspokenInOpenSharing = candidateBase.filter(
      (member) => !speakersInOpenSharing.has(member.id),
    );

    if (unspokenInOpenSharing.length > 0) {
      eligibleCandidates = unspokenInOpenSharing;
    }
  }

  const deterministicLookupValue =
    currentState.deterministicSeed + currentState.transcript.length;

  const selectedCharacter = pickWeightedCandidateDeterministically(
    eligibleCandidates,
    deterministicLookupValue,
  );

  return {
    type: 'CALL_AI_CHARACTER',
    character: selectedCharacter,
    reason: 'Autonomous floor selection',
  };
}
