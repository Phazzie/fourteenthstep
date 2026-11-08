/**
 * FILE 5A: 05a-llm-voice-adapter.ts
 * Section 4: The Infrastructure Layer (Real AIOutlet Plug)
 *
 * Uses @google/genai (gemini-3.8-flash) on the server to generate
 * authentic character shares grounded in the character's archetype,
 * voiceExamples, personalLore, and recurringJokes, with an automatic
 * deterministic fallback to FakeVoiceAdapter (05b) if the API key is
 * missing or a transient network issue occurs.
 */

import { GoogleGenAI, Type } from '@google/genai';
import {
  AIGenerateResult,
  AIOutlet,
  CharacterProfile,
  MeetingConfig,
  MeetingState,
  TranscriptBeat,
} from './00-contracts-and-seams';
import { FakeVoiceAdapter } from './05b-fake-voice-adapter';

interface ParsedLlmShare {
  readonly dialogueText: string;
  readonly emotionalTone: string;
}

function parseLlmShareJson(rawText: string): ParsedLlmShare | null {
  try {
    const parsed: unknown = JSON.parse(rawText.trim());
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const candidate = parsed as Record<string, unknown>;
    const dialogueText =
      typeof candidate['dialogueText'] === 'string'
        ? candidate['dialogueText'].trim()
        : '';
    const emotionalTone =
      typeof candidate['emotionalTone'] === 'string'
        ? candidate['emotionalTone'].trim()
        : 'Grounded & Honest';

    if (!dialogueText) {
      return null;
    }
    return {
      dialogueText,
      emotionalTone: emotionalTone || 'Grounded & Honest',
    };
  } catch {
    return null;
  }
}

export class LlmVoiceAdapter implements AIOutlet {
  private readonly fallbackAdapter = new FakeVoiceAdapter();

  async generateCharacterShare(params: {
    readonly character: CharacterProfile;
    readonly state: MeetingState;
    readonly config: MeetingConfig;
  }): Promise<AIGenerateResult> {
    const apiKey = process.env['GEMINI_API_KEY'];

    // If GEMINI_API_KEY is missing or still set to the .env.example placeholder,
    // seamlessly fall back to the deterministic FakeVoiceAdapter (05b).
    if (
      !apiKey ||
      apiKey === 'MY_GEMINI_API_KEY' ||
      apiKey.trim().length === 0
    ) {
      return this.fallbackAdapter.generateCharacterShare(params);
    }

    const { character, state } = params;
    const recentTranscript = state.transcript
      .slice(-6)
      .map(
        (beat) =>
          `[${beat.phaseWhenSpoken}] ${beat.speakerName} (${beat.speakerRole}): "${beat.dialogueText}"`,
      )
      .join('\n');

    const visitorContext = state.userName
      ? `The human visitor sitting in the circle tonight is named "${state.userName}".`
      : 'A quiet newcomer is sitting in the circle tonight.';

    const phaseInstructions: Record<MeetingState['currentPhase'], string> = {
      PRE_MEETING_CHATTER:
        'Share a brief, warm, grounded pre-meeting remark (1-2 sentences) while people grab coffee and settle into metal folding chairs.',
      OPENING:
        'As Chairperson, open The 14th Step meeting warmly and ground the room in confidentiality and presence (2-3 sentences).',
      TOPIC_INTRO: `Introduce tonight's recovery topic ("${state.topic}") with a brief personal reflection and invite open sharing (2-3 sentences).`,
      OPEN_SHARING: `Share honestly from the heart on the topic "${state.topic}" (2-4 sentences). Reference your personal lore or recurring humor naturally without sounding scripted, and respond organically to recent shares in the room.`,
      CRISIS_MODE:
        'A member in the room just expressed deep distress or crisis. Respond with immediate, grounded, non-judgmental warmth and safety support as a seasoned recovery sponsor/chairperson (2-3 sentences). Remind them they are not alone right now and mention 988 support.',
      CLOSING:
        'As Chairperson, wrap up the meeting with gratitude for everyone who shared, remind the room of anonymity, and close the formal portion (2-3 sentences).',
      POST_MEETING_FELLOWSHIP:
        'Offer a casual post-meeting fellowship remark by the coffee pot (1-2 sentences).',
    };

    const systemInstruction = [
      `You are roleplaying ${character.name} (${character.role} — ${character.archetype}) in "The 14th Step", a late-night urban recovery fellowship meeting.`,
      visitorContext,
      `Character Voice Examples: ${character.voiceExamples.join(' | ')}`,
      `Personal Lore: ${character.personalLore.join(' | ')}`,
      `Recurring Inside Jokes: ${character.recurringJokes.join(' | ')}`,
      'Speak in first-person ("I"). Never break character, never give preachy clinical lectures, and keep your share concise (2 to 4 sentences).',
    ].join('\n');

    const prompt = [
      `Current Meeting Phase: ${state.currentPhase}`,
      `Meeting Topic: ${state.topic}`,
      `Phase Direction: ${phaseInstructions[state.currentPhase]}`,
      recentTranscript.length > 0
        ? `Recent Room Transcript:\n${recentTranscript}`
        : 'Recent Room Transcript: (Room is just gathering)',
      'Return JSON with dialogueText and emotionalTone.',
    ].join('\n\n');

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              dialogueText: {
                type: Type.STRING,
                description:
                  'The spoken first-person dialogue of the character (2-4 sentences).',
              },
              emotionalTone: {
                type: Type.STRING,
                description:
                  'A 2-3 word description of the emotional tone (e.g. "Raw & Grateful").',
              },
            },
            required: ['dialogueText', 'emotionalTone'],
          },
        },
      });

      const rawText = response.text;
      if (!rawText) {
        return this.fallbackAdapter.generateCharacterShare(params);
      }

      const validated = parseLlmShareJson(rawText);
      if (!validated) {
        return this.fallbackAdapter.generateCharacterShare(params);
      }

      const nextBeatIndex = state.transcript.length + 1;
      const beat: TranscriptBeat = {
        beatId: `${state.meetingId}-beat-${nextBeatIndex}`,
        speakerId: character.id,
        speakerName: character.name,
        speakerRole: character.role,
        dialogueText: validated.dialogueText,
        timestamp: Date.now(),
        phaseWhenSpoken: state.currentPhase,
        emotionalTone: validated.emotionalTone,
      };

      return { ok: true, beat };
    } catch {
      // Automatic fallback to FakeVoiceAdapter so the meeting loop never stalls
      return this.fallbackAdapter.generateCharacterShare(params);
    }
  }
}
