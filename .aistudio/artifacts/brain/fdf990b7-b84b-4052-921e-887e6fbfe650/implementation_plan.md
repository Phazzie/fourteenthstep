# The 14th Step — Autonomous Recovery Meeting Simulator

An autonomous, server-authoritative recovery meeting simulator built on a strict Hexagonal (Ports & Adapters) architecture. The application eliminates manual frontend step triggers and state loss on refresh by driving the entire meeting loop from a pure domain state machine and server-side heartbeat.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and UX choices incorporate your confirmed preferences from our initial clarification:

- **Confirmed Decision 1 — Voice Adapter Strategy**: `08-app-wiring` will activate the **Real Gemini AI Adapter (`05a-llm-voice-adapter`)** using `@google/genai` (`gemini-3.8-flash`) with an automatic, seamless fallback to the **Deterministic Fake Voice Adapter (`05b-fake-voice-adapter`)** if `GEMINI_API_KEY` is unconfigured or a transient API error occurs, ensuring the autonomous loop never stalls.
- **Confirmed Decision 2 — Relational Database Persistence**: `06a-persistence-adapter` will use **Cloud SQL (PostgreSQL)** with **Drizzle ORM** (the platform's managed serverless PostgreSQL equivalent to Supabase/Neon) alongside an automatic in-memory fallback (`06b-fake-memory-adapter`) so tests and local runs work immediately. Upon plan approval, we will run the Cloud SQL provisioning flow.
- **Confirmed Decision 3 — Streamlined Name-Only Intake**: Before entering the room, users are greeted by a clean, minimal **First-Name Intake Gate** (just entering their name—no complex multi-step forms) which binds to their private `ownerUserId` session and launches or resumes their autonomous meeting room.

---

## 1. Overview & Core Concept

- **What It Does**: Simulates a living, autonomous recovery fellowship meeting ("The 14th Step") that progresses naturally through seven distinct phases (`PRE_MEETING_CHATTER` → `OPENING` → `TOPIC_INTRO` → `OPEN_SHARING` → `CRISIS_MODE` → `CLOSING` → `POST_MEETING_FELLOWSHIP`). AI characters with rich personal lore, recurring jokes, and distinct voices share autonomously on a server-driven clock while the human participant can passively listen, raise their hand to claim the floor next, or share directly.
- **Target Audience / Persona**: Individuals seeking a grounded, stigma-free, late-night fellowship environment or developers verifying deterministic hexagonal state machines.
- **Key Value**:
  - **100% Server-Authoritative Heartbeat**: Refreshing the browser mid-sentence never loses transcript history or resets the phase.
  - **Strict Layer Isolation (The Blind Chef Law)**: Pure domain chefs (`01-meeting-rules-chef`, `02-speaker-selector-chef`) have zero external dependencies, making every phase transition, speaker selection, and crisis keyword intervention 100% deterministic and testable offline in milliseconds.
  - **Atomic Persistence Before Broadcast**: Every spoken beat and phase shift is committed to `StorageOutlet` before `BroadcastOutlet` notifies connected clients and before `ClockOutlet` arms the next tick.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Minimal Name Intake**: User arrives at the sanctuary door, enters only their first name (or alias), and steps into their private meeting room.
  2. **Autonomous Room Observation**: The room is already alive in `PRE_MEETING_CHATTER`. A circle of chairs displays the chairperson, sponsor, regular members, and the user's seat, highlighting whoever currently holds the floor while the live transcript scrolls cleanly.
  3. **Raising Hand & Sharing**: Clicking **Raise Hand** sets `userHandRaised = true` on the server without cutting off the current speaker. Once the current speaker finishes, the server yields the floor (`WAIT_FOR_USER_INPUT`) and enables the user's share input box.
  4. **Crisis Support Intervention**: If the user submits a share containing any configured crisis trigger keyword, `01-meeting-rules-chef` immediately transitions the room into `CRISIS_MODE`, where the Sponsor/Chairperson responds supportively and pauses the normal loop until the user chooses **Resume Meeting**.

- **Visual Identity & Theme ("Luxury Street Utility" Dark Mode)**:
  - **Aesthetic Direction**: Atmospheric late-night basement fellowship meets high-craft architectural minimalism—matte obsidian surfaces, brushed steel hairline borders, and warm tungsten amber focal accents.
  - **Color Palette & Mood (60-30-10 Discipline)**:
    - *60% Dominant Neutral Canvas*: Deep Obsidian (`#0A0B0E`) and Charcoal Slate (`#111318`).
    - *30% Structural Surfaces*: Elevated Graphite (`#171A21`) with subtle `1px solid rgba(255, 255, 255, 0.08)` hairline dividers and muted stone typography (`#94A3B8`).
    - *10% Semantic Focal Accents*: Warm Tungsten Amber (`#F59E0B`) for active speaker/hand-raised states, Calm Sage (`#10B981`) for nominal live stream telemetry, and High-Visibility Crimson (`#EF4444`) paired with explicit text labels for `CRISIS_MODE`.
  - **Typography & Hierarchy**:
    - *Display / Headers*: `Outfit` or `Plus Jakarta Sans` (SemiBold, tight tracking, balanced headline wrapping).
    - *Body / Transcript Prose*: `DM Sans` (15px–16px, generous 1.65 line-height for effortless reading of personal shares).
    - *Metadata & Timestamps*: `JetBrains Mono` with `tabular-nums` for phase beat counters, timestamps, and deterministic seed inspection.
  - **Layout & Spatial Architecture**:
    - **Top Bar Contract**: Single-row header with 3 clean zones separated by `gap-8`—Brand Wordmark (`THE 14TH STEP`), unboxed phase & topic metadata with `·` separators, and primary action (`Raise Hand` / `Leave Room`).
    - **Two-Zone Desktop Viewport (1440px baseline)**: Left/Top Interactive Circle of Chairs ($45\%$ width) showing each character's archetype, role, and speaking state; Right/Bottom Live Transcript & Floor Controls ($55\%$ width).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Strict Hexagonal Ports & Adapters (The Two-Plug Law)**
  - *Chosen Approach*: Every external capability (`StorageOutlet`, `AIOutlet`, `BroadcastOutlet`, `ClockOutlet`) has both a Real Infrastructure Adapter (`05a`, `06a`, `07a`) and a Fake Deterministic Adapter (`05b`, `06b`, `07b`).
  - *Why*: Enables Phase 2 automated verification tests to run a complete meeting from `PRE_MEETING_CHATTER` through `CLOSING`, test `RAISE_HAND` interruptions, and verify `CRISIS_MODE` in milliseconds with zero API keys or network calls.
- **Decision 2: Server-Sent Events (SSE) + REST Intent Endpoints**
  - *Chosen Approach*: `07a-server-timer-adapter` broadcasts live `MeetingState` snapshots over `/api/meetings/:id/stream` (SSE), while `04-meeting-room-screen` dispatches `UserIntentAction` payloads via `POST /api/meetings/:id/action`.
  - *Why*: Native HTTP/SSE compatibility across Angular SSR, Express 5, and Cloud Run proxies with automatic reconnection and full state reconciliation on `JOIN_OR_REFRESH`.
- **Decision 3: Privacy & Ownership Enforcement (`ownerUserId`)**
  - *Chosen Approach*: Every `loadMeeting` call in `06a-persistence-adapter` and `06b-fake-memory-adapter` strictly verifies `state.ownerUserId === requestingUserId`, returning `'ACCESS_DENIED'` on mismatch.
  - *Why*: Guarantees private intake names and personal shares never leak across sessions.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Dependency Boundary Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SECTION 0: SEAMS & SHARED DICTIONARY                     │
│                          00-contracts-and-seams                             │
│  (MeetingState, CharacterProfile, TranscriptBeat, MeetingConfig, Outlets)   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
        ┌──────────────────────────────┴──────────────────────────────┐
        ▼                                                             ▼
┌──────────────────────────────────────┐     ┌────────────────────────────────┐
│      SECTION 1: DOMAIN CHEFS         │     │  SECTION 4: INFRASTRUCTURE     │
│        (Zero External Deps)          │     │      (The Two-Plug Law)        │
│                                      │     │                                │
│  ┌────────────────────────────────┐  │     │  AIOutlet:                     │
│  │     01-meeting-rules-chef      │  │     │   ├─ 05a-llm-voice-adapter     │
│  │ (Crisis Detection & Phase Math)│  │     │   └─ 05b-fake-voice-adapter    │
│  └────────────────────────────────┘  │     │                                │
│  ┌────────────────────────────────┐  │     │  StorageOutlet:                │
│  │    02-speaker-selector-chef    │  │     │   ├─ 06a-persistence-adapter   │
│  │ (Deterministic Floor Selection)│  │     │   └─ 06b-fake-memory-adapter   │
│  └────────────────────────────────┘  │     │                                │
└──────────────────┬───────────────────┘     │  ClockOutlet & BroadcastOutlet:│
                   │                         │   ├─ 07a-server-timer-adapter  │
                   ▼                         │   └─ 07b-fake-manual-clock     │
┌──────────────────────────────────────┐     └────────────────┬───────────────┘
│    SECTION 2: APPLICATION MANAGER    │                      │
│         03-autonomous-runner         │◄─────────────────────┘
│  (Atomic Save → Broadcast → Re-arm)  │      Wired in 08-app-wiring
└──────────────────┬───────────────────┘
                   │
                   ▼  SSE Stream (/api/meetings/:id/stream) & Intent POST
┌─────────────────────────────────────────────────────────────────────────────┐
│                  SECTION 3: PASSIVE PRESENTATION LAYER                      │
│                          04-meeting-room-screen                             │
│   (Name-Only Intake Gate, Circle of Chairs, Live Transcript, Hand Controls) │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4-Phase Sequential Execution Plan

1. **Phase 1: The Seams & Pure Domain Chefs**
   - Deliver the Plain-English Dependency Audit Table.
   - Implement `00-contracts-and-seams`, `01-meeting-rules-chef`, and `02-speaker-selector-chef` with zero external imports and zero hardcoded literals.
2. **Phase 2: The Application Manager & Fake Adapters + Automated Verification**
   - Implement `03-autonomous-runner`, `05b-fake-voice-adapter`, `06b-fake-memory-adapter`, and `07b-fake-manual-clock-adapter`.
   - Execute an automated verification test suite proving full autonomous progression (`PRE_MEETING_CHATTER` → `POST_MEETING_FELLOWSHIP`), `"RAISE_HAND"` floor yielding, `"SUBMIT_SHARE"`, `"ACCESS_DENIED"` isolation, and `"CRISIS_MODE"` intervention using only Fake Adapters.
3. **Phase 3: Real Infrastructure Adapters & Composition Root Wiring**
   - Provision PostgreSQL persistence (`06a-persistence-adapter` with Drizzle ORM + automatic fallback), Gemini AI character generation (`05a-llm-voice-adapter` preserving character voice examples, personal lore, and recurring jokes), per-room server timer & SSE broadcaster (`07a-server-timer-adapter`), and `08-app-wiring`.
4. **Phase 4: Passive Presentation UI**
   - Build `04-meeting-room-screen` featuring the name-only intake gate, luxury street utility dark-mode interface, circle of chairs, crisis support banner, and live SSE transcript stream with zero client-side phase timers.
