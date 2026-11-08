/**
 * FILE 5B: 05b-fake-voice-adapter.ts
 * Section 4: The Infrastructure Layer (Fake AIOutlet Plug)
 *
 * Deterministically returns realistic, character-specific recovery shares
 * using the character's voiceExamples, personalLore, and recurringJokes
 * so offline tests and fallback runs execute in 0ms without external API calls.
 */

import {
  AIGenerateResult,
  AIOutlet,
  CharacterProfile,
  MeetingConfig,
  MeetingState,
  TranscriptBeat,
} from './00-contracts-and-seams';

export class FakeVoiceAdapter implements AIOutlet {
  private shouldSimulateTransientFailure = false;

  setSimulateTransientFailure(flag: boolean): void {
    this.shouldSimulateTransientFailure = flag;
  }

  async generateCharacterShare(params: {
    readonly character: CharacterProfile;
    readonly state: MeetingState;
    readonly config: MeetingConfig;
  }): Promise<AIGenerateResult> {
    if (this.shouldSimulateTransientFailure) {
      return {
        ok: false,
        error: 'Simulated transient AI generation timeout.',
      };
    }

    const { character, state } = params;
    const nextBeatIndex = state.transcript.length + 1;
    const timestamp = state.lastUpdatedTimestamp + 1000;

    let dialogueText = '';
    let emotionalTone = 'Grounded & Reflective';

    const loreSnippet =
      character.personalLore[
        nextBeatIndex % Math.max(1, character.personalLore.length)
      ] ?? 'showing up one night at a time';
    const voiceSnippet =
      character.voiceExamples[
        nextBeatIndex % Math.max(1, character.voiceExamples.length)
      ] ?? 'Glad to be in this circle tonight.';
    const jokeSnippet =
      character.recurringJokes[
        nextBeatIndex % Math.max(1, character.recurringJokes.length)
      ] ?? 'the basement coffee is still strong enough to strip paint';

    switch (state.currentPhase) {
      case 'PRE_MEETING_CHATTER': {
        emotionalTone = 'Warm & Casual';
        dialogueText = `${voiceSnippet} Good seeing everybody trickle in—remember, ${jokeSnippet}.`;
        break;
      }

      case 'OPENING': {
        emotionalTone = 'Steady & Welcoming';
        dialogueText = `Welcome to The 14th Step. I'm ${character.name}, and I'll be chairing tonight. Let's take a quiet breath together and leave the street noise outside.`;
        break;
      }

      case 'TOPIC_INTRO': {
        emotionalTone = 'Focused & Intentional';
        dialogueText = `Tonight's topic is "${state.topic}". For me, that ties right back to ${loreSnippet}. The floor is now open for anyone who needs to share.`;
        break;
      }

      case 'CRISIS_MODE': {
        emotionalTone = 'Compassionate & Urgent Support';
        dialogueText = `I hear how heavy tonight is for you, and I'm really glad you didn't keep that in the dark. You are not alone in this room. Let's pause the regular rotation right here—we are sitting with you, and if you are in immediate danger, please reach out to 988 or lean on us right now.`;
        break;
      }

      case 'OPEN_SHARING': {
        emotionalTone = 'Vulnerable & Honest';
        dialogueText = `I'm ${character.name}. Thinking about "${state.topic}", I keep coming back to ${loreSnippet}. ${voiceSnippet} Even when ${jokeSnippet}, sitting in these chairs keeps me honest. With that, I'll pass.`;
        break;
      }

      case 'CLOSING': {
        emotionalTone = 'Grateful & Resolute';
        dialogueText = `Thank you all for the honesty in the circle tonight. What you hear in this room stays in this room. Keep coming back—it works if you work it.`;
        break;
      }

      case 'POST_MEETING_FELLOWSHIP': {
        emotionalTone = 'Relaxed Fellowship';
        dialogueText = `Meeting's adjourned, folks. Stick around if you want to talk one-on-one by the coffee pot.`;
        break;
      }
    }

    const beat: TranscriptBeat = {
      beatId: `${state.meetingId}-beat-${nextBeatIndex}`,
      speakerId: character.id,
      speakerName: character.name,
      speakerRole: character.role,
      dialogueText,
      timestamp,
      phaseWhenSpoken: state.currentPhase,
      emotionalTone,
    };

    return { ok: true, beat };
  }
}
