/**
 * FILE 4: 04-meeting-room-screen.ts
 * Section 3: The Presentation Layer (The Waiter — Passive Screen)
 *
 * Physical Law Compliance:
 * - Zero client-side phase transition timers, zero "Next Speaker" buttons.
 * - Subscribes passively to the server's BroadcastOutlet SSE stream.
 * - Sends only human intent signals ("JOIN_OR_REFRESH", "RAISE_HAND",
 *   "LOWER_HAND", "SUBMIT_SHARE", "RESUME_FROM_CRISIS") to 03-autonomous-runner.
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  signal,
  ViewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import {
  CharacterProfile,
  MeetingPhase,
  MeetingState,
  UserIntentAction,
} from '../engine/00-contracts-and-seams';
import { isMeetingStateRecord } from '../engine/06b-fake-memory-adapter';

interface ApiActionEnvelope {
  readonly ok: boolean;
  readonly state?: MeetingState;
  readonly error?: string;
}

function parseApiActionEnvelope(raw: unknown): ApiActionEnvelope {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'INVALID_SERVER_RESPONSE' };
  }
  const record = raw as Record<string, unknown>;
  const ok = record['ok'] === true;
  const state = isMeetingStateRecord(record['state'])
    ? record['state']
    : undefined;
  const error =
    typeof record['error'] === 'string' ? record['error'] : undefined;
  return { ok, state, error };
}

interface PhaseDescriptor {
  readonly code: MeetingPhase;
  readonly label: string;
  readonly guidance: string;
}

const PHASE_TIMELINE: readonly PhaseDescriptor[] = [
  {
    code: 'PRE_MEETING_CHATTER',
    label: '01. Basement Arrival',
    guidance: 'Coffee is brewing and chairs are unfolding before the bell.',
  },
  {
    code: 'OPENING',
    label: '02. Chairperson Opening',
    guidance: 'Grounding the room in anonymity and quiet presence.',
  },
  {
    code: 'TOPIC_INTRO',
    label: '03. Topic Reading',
    guidance: 'Setting the reflection anchor for tonight’s circle.',
  },
  {
    code: 'OPEN_SHARING',
    label: '04. Open Floor Sharing',
    guidance:
      'Autonomous round-robin floor. Raise your hand anytime to claim the next turn.',
  },
  {
    code: 'CLOSING',
    label: '05. Closing Serenity',
    guidance: 'Wrapping up the formal hour and protecting anonymity.',
  },
  {
    code: 'POST_MEETING_FELLOWSHIP',
    label: '06. Parking Lot & Coffee Pot',
    guidance: 'Formal meeting complete. Transcript preserved in room history.',
  },
];

@Component({
  selector: 'app-meeting-room-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatIconModule],
  template: `
    <div class="min-h-screen bg-[#0A0B0E] text-[#F1F5F9] flex flex-col selection:bg-amber-500/30 selection:text-amber-200">
      <!-- Top Bar Contract: 3 Zones separated by gap-8 -->
      <header class="flex items-center justify-between gap-8 px-6 py-4 border-b border-white/10 bg-[#0E1015]">
        <!-- Zone 1: Single text element wordmark -->
        <a
          href="/"
          (click)="scrollToTop($event)"
          class="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          THE 14TH STEP
        </a>

        <!-- Zone 2: 4 concise single-line text navigation links -->
        <nav class="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <button
            type="button"
            (click)="activeDrawerTab.set('circle')"
            class="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            [class.text-white]="activeDrawerTab() === 'circle'"
          >
            Fellowship Circle
          </button>
          <button
            type="button"
            (click)="activeDrawerTab.set('roster')"
            class="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            [class.text-white]="activeDrawerTab() === 'roster'"
          >
            Character Lore
          </button>
          <button
            type="button"
            (click)="activeDrawerTab.set('architecture')"
            class="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            [class.text-white]="activeDrawerTab() === 'architecture'"
          >
            Seam Architecture
          </button>
          <button
            type="button"
            (click)="resetRoomCycle()"
            [disabled]="!hasJoinedRoom() || isSubmitting()"
            class="hover:text-white transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 cursor-pointer"
          >
            New Topic Cycle
          </button>
        </nav>

        <!-- Zone 3: 1 primary action -->
        <div class="flex items-center gap-3 shrink-0">
          @if (hasJoinedRoom()) {
            <button
              type="button"
              (click)="toggleHandRaise()"
              [disabled]="isSubmitting() || meetingState()?.currentPhase === 'POST_MEETING_FELLOWSHIP'"
              class="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
              [class.bg-amber-500]="!meetingState()?.userHandRaised"
              [class.text-slate-950]="!meetingState()?.userHandRaised"
              [class.hover:bg-amber-400]="!meetingState()?.userHandRaised"
              [class.bg-slate-800]="meetingState()?.userHandRaised"
              [class.text-amber-300]="meetingState()?.userHandRaised"
              [class.border]="meetingState()?.userHandRaised"
              [class.border-amber-500/40]="meetingState()?.userHandRaised"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px] leading-none">
                {{ meetingState()?.userHandRaised ? 'pan_tool' : 'front_hand' }}
              </mat-icon>
              <span>
                {{
                  meetingState()?.userHandRaised
                    ? 'Lower Hand'
                    : 'Raise Hand to Share'
                }}
              </span>
            </button>
          } @else {
            <button
              type="button"
              (click)="focusNameInput()"
              class="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded-lg hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px] leading-none">meeting_room</mat-icon>
              <span>Enter Sanctuary</span>
            </button>
          }
        </div>
      </header>

      <!-- Minimal Name-Only Intake Gate -->
      @if (!hasJoinedRoom()) {
        <main class="flex-1 flex items-center justify-center px-6 py-12">
          <div class="w-full max-w-xl bg-[#12151C] border border-white/10 rounded-2xl p-8 md:p-10 shadow-md">
            <div class="text-xs font-mono text-amber-400 mb-3">
              St. Jude Basement Sanctuary · Late Night Autonomous Fellowship
            </div>

            <h1 class="font-display text-3xl md:text-4xl font-bold tracking-tight text-white mb-4">
              Pull up a folding chair.
            </h1>

            <p class="text-slate-300 text-base leading-relaxed mb-8">
              The coffee is hot and the room runs autonomously on the server. No last names, no clipboards, and no judgment—just tell the circle what first name you go by tonight.
            </p>

            <form (submit)="submitIntakeName($event)" class="space-y-5">
              <div>
                <label
                  for="visitor-first-name"
                  class="block text-xs font-medium text-slate-300 mb-2"
                >
                  Your First Name or Alias
                </label>
                <input
                  #nameInputRef
                  id="visitor-first-name"
                  type="text"
                  [formControl]="nameControl"
                  maxlength="48"
                  placeholder="e.g. Sam"
                  autocomplete="given-name"
                  class="w-full px-4 py-3 bg-[#0A0B0E] border border-white/15 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
                />
              </div>

              @if (errorBanner()) {
                <div class="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-xs text-red-200 flex items-center gap-2">
                  <mat-icon class="!w-4 !h-4 !text-[16px] text-red-400 shrink-0">error_outline</mat-icon>
                  <span>{{ errorBanner() }}</span>
                </div>
              }

              <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2">
                <div class="text-xs text-slate-400">
                  Private session · Server-authoritative state
                </div>

                <button
                  type="submit"
                  [disabled]="nameControl.invalid || isSubmitting()"
                  class="inline-flex items-center justify-center gap-2 px-6 py-3 bg-amber-500 text-slate-950 font-semibold text-sm rounded-xl hover:bg-amber-400 transition-colors disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <mat-icon class="!w-4 !h-4 !text-[16px] leading-none">door_Sliding</mat-icon>
                  <span>{{ isSubmitting() ? 'Opening Door...' : 'Step Into the Circle' }}</span>
                </button>
              </div>
            </form>
          </div>
        </main>
      } @else {
        <!-- Active Autonomous Meeting Room -->
        @if (meetingState(); as state) {
          <!-- Crisis Support Alert Banner (Only when activeCrisisFlag is true) -->
          @if (state.currentPhase === 'CRISIS_MODE' || state.activeCrisisFlag) {
            <section
              aria-live="assertive"
              class="bg-red-950/80 border-b border-red-500/40 px-6 py-4"
            >
              <div class="max-w-[1400px] mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div class="flex items-start gap-3">
                  <mat-icon class="text-red-400 shrink-0 mt-0.5">health_and_safety</mat-icon>
                  <div>
                    <div class="text-sm font-semibold text-red-200">
                      Crisis Support Pause Active · The Room Is Holding Space With You
                    </div>
                    <p class="text-xs text-red-200/90 mt-0.5">
                      The autonomous rotation is paused so you are not rushed. If you or someone you know is in immediate danger, call or text <strong class="font-mono underline">988</strong> (Suicide &amp; Crisis Lifeline) anytime.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  (click)="resumeFromCrisis()"
                  [disabled]="isSubmitting()"
                  class="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-red-200 text-red-950 rounded-lg hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <mat-icon class="!w-4 !h-4 !text-[16px] leading-none">play_arrow</mat-icon>
                  <span>Resume Regular Sharing</span>
                </button>
              </div>
            </section>
          }

          <!-- Main 1440px Two-Zone Sandbox Layout -->
          <main class="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <!-- Left Zone (5 cols): Interactive Circle of Chairs + Phase Progress + Context Deck -->
            <section class="lg:col-span-5 flex flex-col gap-6">
              <!-- Room Topic & Unboxed Metadata Card -->
              <div class="bg-[#12151C] border border-white/10 rounded-2xl p-6">
                <div class="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono tabular-nums mb-2">
                  <span class="text-amber-400 font-medium">{{ formatPhaseLabel(state.currentPhase) }}</span>
                  <span aria-hidden="true">·</span>
                  <span>Beat {{ state.beatsInCurrentPhase }} in Phase</span>
                  <span aria-hidden="true">·</span>
                  <span>{{ state.transcript.length }} Total Shares</span>
                  <span aria-hidden="true">·</span>
                  <span>{{ streamConnected() ? 'Live Stream Synced' : 'Reconnecting Stream' }}</span>
                </div>

                <h1 class="font-display text-xl md:text-2xl font-bold text-white tracking-tight mb-2">
                  “{{ state.topic }}”
                </h1>

                <p class="text-xs text-slate-400 leading-relaxed">
                  {{ currentPhaseGuidance() }}
                </p>
              </div>

              <!-- View Switcher inside Left Deck -->
              <div class="bg-[#12151C] border border-white/10 rounded-2xl p-6">
                <div class="flex items-center justify-between gap-4 mb-6">
                  <div class="flex items-center gap-1 p-1 bg-[#0A0B0E] rounded-lg border border-white/5">
                    <button
                      type="button"
                      (click)="activeDrawerTab.set('circle')"
                      class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      [class.bg-[#1E2330]]="activeDrawerTab() === 'circle'"
                      [class.text-white]="activeDrawerTab() === 'circle'"
                      [class.text-slate-400]="activeDrawerTab() !== 'circle'"
                    >
                      Circle of Chairs
                    </button>
                    <button
                      type="button"
                      (click)="activeDrawerTab.set('roster')"
                      class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      [class.bg-[#1E2330]]="activeDrawerTab() === 'roster'"
                      [class.text-white]="activeDrawerTab() === 'roster'"
                      [class.text-slate-400]="activeDrawerTab() !== 'roster'"
                    >
                      Character Lore
                    </button>
                    <button
                      type="button"
                      (click)="activeDrawerTab.set('architecture')"
                      class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      [class.bg-[#1E2330]]="activeDrawerTab() === 'architecture'"
                      [class.text-white]="activeDrawerTab() === 'architecture'"
                      [class.text-slate-400]="activeDrawerTab() !== 'architecture'"
                    >
                      Seam Audit
                    </button>
                  </div>

                  <button
                    type="button"
                    (click)="switchVisitorName()"
                    class="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <mat-icon class="!w-3.5 !h-3.5 !text-[14px] leading-none">person_outline</mat-icon>
                    <span>Seat: {{ state.userName || 'Visitor' }}</span>
                  </button>
                </div>

                @if (activeDrawerTab() === 'circle') {
                  <!-- Visual Circle of Folding Chairs -->
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                    @for (member of state.roster; track member.id) {
                      @let isSpeaking = lastSpeakerId() === member.id;
                      <button
                        type="button"
                        (click)="selectInspectedCharacter(member)"
                        class="text-left p-4 rounded-xl border transition-all cursor-pointer"
                        [class.bg-[#1A1E29]]="isSpeaking"
                        [class.border-amber-400/70]="isSpeaking"
                        [class.bg-[#0D0F14]]="!isSpeaking"
                        [class.border-white/10]="!isSpeaking"
                        [class.hover:border-white/25]="!isSpeaking"
                      >
                        <div class="flex items-center justify-between gap-2 mb-1">
                          <span class="font-display font-semibold text-sm text-white">
                            {{ member.name }}
                          </span>
                          <span class="text-[11px] font-mono text-slate-400">
                            {{ member.role }}
                          </span>
                        </div>

                        <div class="text-xs text-slate-400 mb-2">
                          {{ member.archetype }}
                        </div>

                        <div class="text-[11px] font-mono text-slate-300 flex items-center gap-1.5">
                          <mat-icon class="!w-3.5 !h-3.5 !text-[14px] leading-none text-amber-400">
                            {{ isSpeaking ? 'mic' : 'event_seat' }}
                          </mat-icon>
                          <span>
                            {{ isSpeaking ? 'Speaking on Floor' : 'Listening in Circle' }}
                          </span>
                        </div>
                      </button>
                    }

                    <!-- Human Visitor Chair -->
                    @let userIsSpeaking = lastSpeakerId() === 'USER';
                    <div
                      class="p-4 rounded-xl border transition-all sm:col-span-2"
                      [class.bg-[#1A1E29]]="state.userHandRaised || userIsSpeaking"
                      [class.border-amber-400]="state.userHandRaised || userIsSpeaking"
                      [class.bg-[#0D0F14]]="!state.userHandRaised && !userIsSpeaking"
                      [class.border-white/10]="!state.userHandRaised && !userIsSpeaking"
                    >
                      <div class="flex items-center justify-between gap-4">
                        <div>
                          <div class="flex items-center gap-2">
                            <span class="font-display font-semibold text-sm text-white">
                              {{ state.userName || 'You' }} (Your Folding Chair)
                            </span>
                            <span class="text-xs font-mono text-amber-400">
                              · VISITOR
                            </span>
                          </div>
                          <p class="text-xs text-slate-400 mt-1">
                            {{
                              isUserFloorActive()
                                ? 'The room has yielded the microphone to you. Share whenever you are ready.'
                                : state.userHandRaised
                                  ? 'Your hand is raised. After the current speaker finishes, the floor yields to you.'
                                  : 'Passively listening to the autonomous fellowship loop.'
                            }}
                          </p>
                        </div>

                        <button
                          type="button"
                          (click)="toggleHandRaise()"
                          [disabled]="isSubmitting() || state.currentPhase === 'POST_MEETING_FELLOWSHIP'"
                          class="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
                          [class.bg-amber-500]="!state.userHandRaised"
                          [class.text-slate-950]="!state.userHandRaised"
                          [class.border-amber-400]="!state.userHandRaised"
                          [class.bg-transparent]="state.userHandRaised"
                          [class.text-amber-300]="state.userHandRaised"
                          [class.border-amber-500/40]="state.userHandRaised"
                        >
                          <mat-icon class="!w-4 !h-4 !text-[16px] leading-none">
                            {{ state.userHandRaised ? 'pan_tool' : 'front_hand' }}
                          </mat-icon>
                          <span>{{ state.userHandRaised ? 'Hand Raised' : 'Raise Hand' }}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- Phase Progression Ladder -->
                  <div class="border-t border-white/10 pt-5">
                    <div class="text-xs font-semibold text-slate-300 mb-3">
                      Autonomous Meeting Progression
                    </div>
                    <div class="space-y-2">
                      @for (step of phaseTimeline; track step.code) {
                        @let isCurrent = state.currentPhase === step.code;
                        <div
                          class="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg"
                          [class.bg-white/5]="isCurrent"
                          [class.text-white]="isCurrent"
                          [class.text-slate-400]="!isCurrent"
                        >
                          <span class="font-medium">{{ step.label }}</span>
                          <span class="font-mono text-[11px]">
                            {{ isCurrent ? 'ACTIVE PHASE' : '' }}
                          </span>
                        </div>
                      }
                    </div>
                  </div>
                }

                @if (activeDrawerTab() === 'roster') {
                  <!-- Character Lore & Voice Inspector -->
                  @let activeChar = inspectedCharacter() || state.roster[0];
                  <div class="space-y-4">
                    <div class="flex flex-wrap gap-2">
                      @for (member of state.roster; track member.id) {
                        <button
                          type="button"
                          (click)="selectInspectedCharacter(member)"
                          class="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          [class.bg-amber-500]="activeChar.id === member.id"
                          [class.text-slate-950]="activeChar.id === member.id"
                          [class.border-amber-400]="activeChar.id === member.id"
                          [class.bg-[#0A0B0E]]="activeChar.id !== member.id"
                          [class.text-slate-300]="activeChar.id !== member.id"
                          [class.border-white/10]="activeChar.id !== member.id"
                        >
                          {{ member.name }}
                        </button>
                      }
                    </div>

                    <div class="p-4 rounded-xl bg-[#0A0B0E] border border-white/10 space-y-3">
                      <div>
                        <div class="text-sm font-bold text-white">
                          {{ activeChar.name }} · {{ activeChar.role }}
                        </div>
                        <div class="text-xs text-slate-400">
                          {{ activeChar.archetype }} · Speaking Weight: {{ activeChar.speakingTendencyWeight }}
                        </div>
                      </div>

                      <div>
                        <div class="text-xs font-semibold text-slate-300 mb-1">
                          Personal Lore (Injected into 05a/05b AIOutlet)
                        </div>
                        <ul class="space-y-1 text-xs text-slate-400">
                          @for (lore of activeChar.personalLore; track lore) {
                            <li>• {{ lore }}</li>
                          }
                        </ul>
                      </div>

                      <div>
                        <div class="text-xs font-semibold text-slate-300 mb-1">
                          Voice Examples
                        </div>
                        <ul class="space-y-1 text-xs text-slate-300 italic">
                          @for (voice of activeChar.voiceExamples; track voice) {
                            <li>“{{ voice }}”</li>
                          }
                        </ul>
                      </div>

                      <div>
                        <div class="text-xs font-semibold text-slate-300 mb-1">
                          Recurring Basement Humor
                        </div>
                        <ul class="space-y-1 text-xs text-slate-400">
                          @for (joke of activeChar.recurringJokes; track joke) {
                            <li>• {{ joke }}</li>
                          }
                        </ul>
                      </div>
                    </div>
                  </div>
                }

                @if (activeDrawerTab() === 'architecture') {
                  <!-- Hexagonal Seam Architecture Inspector -->
                  <div class="space-y-3 text-xs text-slate-300">
                    <div class="p-3.5 rounded-xl bg-[#0A0B0E] border border-white/10">
                      <div class="font-semibold text-white mb-1">
                        01. The Blind Chef Law (Domain Layer)
                      </div>
                      <p class="text-slate-400 leading-relaxed">
                        <code class="text-amber-300">01-meeting-rules-chef</code> and <code class="text-amber-300">02-speaker-selector-chef</code> import strictly from <code class="text-amber-300">00-contracts-and-seams</code>. Speaker selection uses deterministic seed <span class="font-mono text-white">{{ state.deterministicSeed }}</span> + transcript length (<span class="font-mono text-white">{{ state.transcript.length }}</span>).
                      </p>
                    </div>

                    <div class="p-3.5 rounded-xl bg-[#0A0B0E] border border-white/10">
                      <div class="font-semibold text-white mb-1">
                        02. Atomic Persistence Before Broadcast
                      </div>
                      <p class="text-slate-400 leading-relaxed">
                        Every beat is saved to <code class="text-amber-300">StorageOutlet.saveMeeting</code> before <code class="text-amber-300">BroadcastOutlet.publishRoomUpdate</code> pushes to SSE and before <code class="text-amber-300">ClockOutlet.scheduleNextTick</code> arms the next server tick.
                      </p>
                    </div>

                    <div class="p-3.5 rounded-xl bg-[#0A0B0E] border border-white/10">
                      <div class="font-semibold text-white mb-1">
                        03. Private Room Ownership Guard
                      </div>
                      <p class="text-slate-400 leading-relaxed font-mono text-[11px]">
                        Room ID: {{ state.meetingId }} · Owner Verified
                      </p>
                    </div>
                  </div>
                }
              </div>
            </section>

            <!-- Right Zone (7 cols): Live Scrolling Transcript + Passive Human Intent Controls -->
            <section class="lg:col-span-7 flex flex-col bg-[#12151C] border border-white/10 rounded-2xl overflow-hidden min-h-[640px]">
              <!-- Transcript Header -->
              <div class="px-6 py-4 border-b border-white/10 flex items-center justify-between gap-4 bg-[#151922]">
                <div>
                  <h2 class="font-display text-base font-semibold text-white">
                    Live Sanctuary Transcript
                  </h2>
                  <div class="text-xs text-slate-400">
                    @if (state.currentPhase === 'POST_MEETING_FELLOWSHIP') {
                      Closing sequence finished · Coffee pot fellowship open
                    } @else if (isUserFloorActive()) {
                      Autonomous loop paused · Waiting for your share
                    } @else {
                      Autonomous server heartbeat active · New shares arrive automatically
                    }
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    (click)="refreshFromServer()"
                    [disabled]="isSubmitting()"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-[#0A0B0E] border border-white/10 rounded-lg hover:text-white hover:border-white/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <mat-icon class="!w-3.5 !h-3.5 !text-[14px] leading-none">sync</mat-icon>
                    <span>Verify Sync</span>
                  </button>
                </div>
              </div>

              <!-- Transcript Feed -->
              <div
                #transcriptContainer
                class="flex-1 p-6 space-y-4 overflow-y-auto max-h-[500px]"
              >
                @if (state.transcript.length === 0) {
                  <div class="py-16 text-center space-y-2">
                    <mat-icon class="text-slate-500 !w-8 !h-8 !text-[32px] mx-auto">coffee</mat-icon>
                    <div class="text-sm font-medium text-slate-300">
                      Chairs are unfolding in the basement...
                    </div>
                    <p class="text-xs text-slate-400 max-w-sm mx-auto">
                      The server heartbeat is armed. The first member will speak momentarily without any manual button press.
                    </p>
                  </div>
                } @else {
                  @for (beat of state.transcript; track beat.beatId) {
                    @let isUserBeat = beat.speakerId === 'USER';
                    <article
                      class="p-4 rounded-xl border transition-colors"
                      [class.bg-[#1B202C]]="isUserBeat"
                      [class.border-amber-500/30]="isUserBeat"
                      [class.bg-[#0D0F14]]="!isUserBeat"
                      [class.border-white/8]="!isUserBeat"
                    >
                      <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 mb-2">
                        <div class="flex items-center gap-2">
                          <span class="font-display font-semibold text-white text-sm">
                            {{ beat.speakerName }}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span class="font-mono text-[11px] text-amber-400">
                            {{ beat.speakerRole }}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span class="text-slate-400">
                            {{ beat.emotionalTone }}
                          </span>
                        </div>

                        <div class="font-mono text-[11px] tabular-nums text-slate-400">
                          {{ formatPhaseLabel(beat.phaseWhenSpoken) }} · {{ formatBeatTime(beat.timestamp) }}
                        </div>
                      </div>

                      <p class="text-[#E2E8F0] text-[15px] leading-relaxed">
                        “{{ beat.dialogueText }}”
                      </p>
                    </article>
                  }
                }
              </div>

              <!-- Passive Viewer & User Share Controls Footer -->
              <div class="p-6 border-t border-white/10 bg-[#0E1015]">
                @if (errorBanner()) {
                  <div class="mb-4 p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-xs text-red-200 flex items-center justify-between gap-2">
                    <span>{{ errorBanner() }}</span>
                    <button
                      type="button"
                      (click)="errorBanner.set(null)"
                      class="text-red-300 hover:text-white text-xs font-mono cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                }

                <form (submit)="submitUserShare($event)" class="space-y-3">
                  <div class="flex items-center justify-between gap-4 text-xs">
                    <label for="user-share-input" class="font-medium text-slate-300">
                      @if (isUserFloorActive()) {
                        <span class="text-amber-400 font-semibold">
                          The Floor Is Yours — Speak to the Circle
                        </span>
                      } @else {
                        <span>
                          Raise your hand to claim the floor next, or share directly with the circle
                        </span>
                      }
                    </label>

                    <span class="font-mono text-[11px] text-slate-400 tabular-nums">
                      {{ (shareControl.value || '').length }}/500
                    </span>
                  </div>

                  <div class="flex flex-col sm:flex-row gap-3">
                    <textarea
                      id="user-share-input"
                      rows="2"
                      maxlength="500"
                      [formControl]="shareControl"
                      [placeholder]="
                        state.userHandRaised || isUserFloorActive()
                          ? 'Speak honestly from where you are tonight...'
                          : 'Raise your hand first, or type your reflection here to share...'
                      "
                      class="flex-1 px-4 py-2.5 bg-[#0A0B0E] border border-white/15 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition-colors resize-none"
                    ></textarea>

                    <div class="flex sm:flex-col justify-end gap-2 shrink-0">
                      <button
                        type="submit"
                        [disabled]="
                          shareControl.invalid ||
                          isSubmitting() ||
                          (!state.userHandRaised && !isUserFloorActive())
                        "
                        class="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-500 text-slate-950 font-semibold text-xs rounded-xl hover:bg-amber-400 transition-colors disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <mat-icon class="!w-4 !h-4 !text-[16px] leading-none">record_voice_over</mat-icon>
                        <span>Submit Share</span>
                      </button>

                      <button
                        type="button"
                        (click)="toggleHandRaise()"
                        [disabled]="isSubmitting() || state.currentPhase === 'POST_MEETING_FELLOWSHIP'"
                        class="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#171A21] border border-white/10 text-slate-200 hover:text-white font-medium text-xs rounded-xl transition-colors disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <mat-icon class="!w-3.5 !h-3.5 !text-[14px] leading-none">
                          {{ state.userHandRaised ? 'pan_tool' : 'front_hand' }}
                        </mat-icon>
                        <span>{{ state.userHandRaised ? 'Lower Hand' : 'Raise Hand' }}</span>
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </section>
          </main>
        }
      }
    </div>
  `,
})
export class MeetingRoomScreen implements OnInit, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);

  @ViewChild('nameInputRef')
  nameInputRef?: ElementRef<HTMLInputElement>;

  @ViewChild('transcriptContainer')
  transcriptContainer?: ElementRef<HTMLDivElement>;

  readonly phaseTimeline = PHASE_TIMELINE;

  readonly meetingState = signal<MeetingState | null>(null);
  readonly hasJoinedRoom = signal<boolean>(false);
  readonly isSubmitting = signal<boolean>(false);
  readonly streamConnected = signal<boolean>(false);
  readonly errorBanner = signal<string | null>(null);
  readonly activeDrawerTab = signal<'circle' | 'roster' | 'architecture'>(
    'circle',
  );
  readonly inspectedCharacter = signal<CharacterProfile | null>(null);

  readonly nameControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(1)],
  });

  readonly shareControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(2)],
  });

  private ownerUserId = '';
  private meetingId = '';
  private eventSource: EventSource | null = null;
  private lastTranscriptCount = 0;

  readonly lastSpeakerId = computed(() => {
    const state = this.meetingState();
    if (!state || state.transcript.length === 0) {
      return null;
    }
    return state.transcript[state.transcript.length - 1].speakerId;
  });

  readonly isUserFloorActive = computed(() => {
    const state = this.meetingState();
    if (!state) {
      return false;
    }
    if (state.userHandRaised && state.currentPhase === 'OPEN_SHARING') {
      return true;
    }
    if (state.currentPhase === 'CRISIS_MODE') {
      return true;
    }
    return false;
  });

  readonly currentPhaseGuidance = computed(() => {
    const state = this.meetingState();
    if (!state) {
      return '';
    }
    if (state.currentPhase === 'CRISIS_MODE') {
      return 'Crisis support intervention active. The Sponsor/Chairperson holds the floor with you until you choose to resume.';
    }
    const found = PHASE_TIMELINE.find(
      (item) => item.code === state.currentPhase,
    );
    return found?.guidance ?? '';
  });

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    // Restore private session identity so refreshing mid-sentence loses zero state
    const savedUserId = sessionStorage.getItem('the14thstep_owner_uid');
    const savedMeetingId = sessionStorage.getItem('the14thstep_meeting_id');
    const savedName = sessionStorage.getItem('the14thstep_user_name');

    if (savedUserId) {
      this.ownerUserId = savedUserId;
    } else {
      this.ownerUserId = `usr_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
      sessionStorage.setItem('the14thstep_owner_uid', this.ownerUserId);
    }

    this.meetingId =
      savedMeetingId || `room_${this.ownerUserId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    sessionStorage.setItem('the14thstep_meeting_id', this.meetingId);

    if (savedName) {
      this.nameControl.setValue(savedName);
      void this.joinOrResumeRoom(savedName);
    }
  }

  ngOnDestroy(): void {
    this.closeStream();
  }

  focusNameInput(): void {
    this.nameInputRef?.nativeElement.focus();
  }

  scrollToTop(event: Event): void {
    event.preventDefault();
    if (isPlatformBrowser(this.platformId)) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  selectInspectedCharacter(member: CharacterProfile): void {
    this.inspectedCharacter.set(member);
    this.activeDrawerTab.set('roster');
  }

  switchVisitorName(): void {
    this.closeStream();
    this.hasJoinedRoom.set(false);
  }

  async submitIntakeName(event: Event): Promise<void> {
    event.preventDefault();
    if (this.nameControl.invalid || this.isSubmitting()) {
      return;
    }
    const cleanName = this.nameControl.value.trim();
    if (!cleanName) {
      return;
    }

    if (isPlatformBrowser(this.platformId)) {
      sessionStorage.setItem('the14thstep_user_name', cleanName);
    }

    await this.joinOrResumeRoom(cleanName);
  }

  private async joinOrResumeRoom(userName: string): Promise<void> {
    this.isSubmitting.set(true);
    this.errorBanner.set(null);

    try {
      const response = await fetch('/api/meetings/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: this.meetingId,
          ownerUserId: this.ownerUserId,
          userName,
        }),
      });

      const rawJson: unknown = await response.json();
      const payload = parseApiActionEnvelope(rawJson);

      if (!payload.ok || !payload.state) {
        this.errorBanner.set(
          `Could not enter room (${payload.error || 'UNKNOWN_ERROR'}).`,
        );
        return;
      }

      this.applyServerState(payload.state);
      this.hasJoinedRoom.set(true);
      this.connectSseStream();
    } catch {
      this.errorBanner.set(
        'Unable to reach the autonomous meeting server. Please try again.',
      );
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private connectSseStream(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.closeStream();

    const streamUrl = `/api/meetings/${encodeURIComponent(this.meetingId)}/stream?userId=${encodeURIComponent(this.ownerUserId)}`;
    const source = new EventSource(streamUrl);
    this.eventSource = source;

    source.onopen = () => {
      this.streamConnected.set(true);
    };

    source.onmessage = (event: MessageEvent<string>) => {
      try {
        const parsed: unknown = JSON.parse(event.data);
        if (isMeetingStateRecord(parsed)) {
          this.streamConnected.set(true);
          this.applyServerState(parsed);
        }
      } catch {
        // Ignore non-JSON keep-alive frames
      }
    };

    source.onerror = () => {
      this.streamConnected.set(false);
    };
  }

  private closeStream(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.streamConnected.set(false);
  }

  private applyServerState(state: MeetingState): void {
    this.meetingState.set(state);
    if (!this.inspectedCharacter() && state.roster.length > 0) {
      this.inspectedCharacter.set(state.roster[0]);
    }

    if (state.transcript.length !== this.lastTranscriptCount) {
      this.lastTranscriptCount = state.transcript.length;
      setTimeout(() => {
        const el = this.transcriptContainer?.nativeElement;
        if (el) {
          el.scrollTop = el.scrollHeight;
        }
      }, 40);
    }
  }

  async toggleHandRaise(): Promise<void> {
    const state = this.meetingState();
    if (!state || this.isSubmitting()) {
      return;
    }

    const action: UserIntentAction = state.userHandRaised
      ? { type: 'LOWER_HAND' }
      : { type: 'RAISE_HAND' };

    await this.dispatchIntent(action);
  }

  async submitUserShare(event: Event): Promise<void> {
    event.preventDefault();
    if (this.shareControl.invalid || this.isSubmitting()) {
      return;
    }

    const text = this.shareControl.value.trim();
    if (!text) {
      return;
    }

    const ok = await this.dispatchIntent({
      type: 'SUBMIT_SHARE',
      dialogueText: text,
      timestamp: Date.now(),
    });

    if (ok) {
      this.shareControl.setValue('');
    }
  }

  async resumeFromCrisis(): Promise<void> {
    await this.dispatchIntent({ type: 'RESUME_FROM_CRISIS' });
  }

  async refreshFromServer(): Promise<void> {
    await this.dispatchIntent({ type: 'JOIN_OR_REFRESH' });
  }

  async resetRoomCycle(): Promise<void> {
    if (this.isSubmitting()) {
      return;
    }
    this.isSubmitting.set(true);
    this.errorBanner.set(null);

    try {
      const response = await fetch(
        `/api/meetings/${encodeURIComponent(this.meetingId)}/reset`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ownerUserId: this.ownerUserId,
            userName: this.meetingState()?.userName || this.nameControl.value,
          }),
        },
      );

      const rawJson: unknown = await response.json();
      const payload = parseApiActionEnvelope(rawJson);
      if (payload.ok && payload.state) {
        this.applyServerState(payload.state);
      } else {
        this.errorBanner.set(
          `Could not reset room (${payload.error || 'ERROR'}).`,
        );
      }
    } catch {
      this.errorBanner.set('Failed to start new topic cycle.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private async dispatchIntent(action: UserIntentAction): Promise<boolean> {
    this.isSubmitting.set(true);
    this.errorBanner.set(null);

    try {
      const response = await fetch(
        `/api/meetings/${encodeURIComponent(this.meetingId)}/action`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestingUserId: this.ownerUserId,
            action,
          }),
        },
      );

      const rawJson: unknown = await response.json();
      const payload = parseApiActionEnvelope(rawJson);

      if (!payload.ok || !payload.state) {
        this.errorBanner.set(
          `Action rejected (${payload.error || 'UNKNOWN_ERROR'}).`,
        );
        return false;
      }

      this.applyServerState(payload.state);
      return true;
    } catch {
      this.errorBanner.set('Connection interrupted while sending intent.');
      return false;
    } finally {
      this.isSubmitting.set(false);
    }
  }

  formatPhaseLabel(phase: MeetingPhase): string {
    switch (phase) {
      case 'PRE_MEETING_CHATTER':
        return 'Pre-Meeting Chatter';
      case 'OPENING':
        return 'Chairperson Opening';
      case 'TOPIC_INTRO':
        return 'Topic Introduction';
      case 'OPEN_SHARING':
        return 'Open Floor Sharing';
      case 'CRISIS_MODE':
        return 'Crisis Support Mode';
      case 'CLOSING':
        return 'Closing Sequence';
      case 'POST_MEETING_FELLOWSHIP':
        return 'Post-Meeting Fellowship';
    }
  }

  formatBeatTime(timestamp: number): string {
    try {
      return new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return '';
    }
  }
}
