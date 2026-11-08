import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express, { Request, Response } from 'express';
import { join } from 'node:path';
import { UserIntentAction } from './engine/00-contracts-and-seams';
import {
  createInitialMeetingState,
  createWiredApplication,
  DEFAULT_MEETING_TOPICS,
} from './engine/08-app-wiring';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
app.use(express.json());

const angularApp = new AngularNodeAppEngine();

// Initialize the single server-authoritative Hexagonal Application Container
const wiredContainer = createWiredApplication();

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
): string {
  const val = record[key];
  return typeof val === 'string' ? val.trim() : '';
}

function parseClientUserIntentAction(
  rawAction: unknown,
): UserIntentAction | null {
  if (typeof rawAction !== 'object' || rawAction === null) {
    return null;
  }
  const obj = rawAction as Record<string, unknown>;
  const type = obj['type'];

  switch (type) {
    case 'JOIN_OR_REFRESH':
      return { type: 'JOIN_OR_REFRESH' };
    case 'START_MEETING':
      return { type: 'START_MEETING' };
    case 'RAISE_HAND':
      return { type: 'RAISE_HAND' };
    case 'LOWER_HAND':
      return { type: 'LOWER_HAND' };
    case 'RESUME_FROM_CRISIS':
      return { type: 'RESUME_FROM_CRISIS' };
    case 'SUBMIT_SHARE': {
      const dialogueText =
        typeof obj['dialogueText'] === 'string'
          ? obj['dialogueText'].trim()
          : '';
      const timestamp =
        typeof obj['timestamp'] === 'number' && Number.isFinite(obj['timestamp'])
          ? obj['timestamp']
          : Date.now();
      if (!dialogueText) {
        return null;
      }
      return {
        type: 'SUBMIT_SHARE',
        dialogueText,
        timestamp,
      };
    }
    // Adversary Guard: Clients are strictly FORBIDDEN from spoofing server 'TICK' heartbeats via HTTP POST
    case 'TICK':
    default:
      return null;
  }
}

/**
 * POST /api/meetings/intake
 * Minimal Name-Only Intake Gate: Creates or resumes a private meeting room
 * bound strictly to ownerUserId and arms the autonomous server heartbeat.
 */
app.post('/api/meetings/intake', async (req: Request, res: Response) => {
  try {
    const body: Record<string, unknown> =
      typeof req.body === 'object' && req.body !== null ? req.body : {};

    const ownerUserId = readOptionalString(body, 'ownerUserId');
    const userName = readOptionalString(body, 'userName') || 'Newcomer';
    const rawMeetingId = readOptionalString(body, 'meetingId');
    const topic = readOptionalString(body, 'topic') || undefined;
    const meetingId = rawMeetingId || `room-${ownerUserId.slice(0, 12)}`;

    if (!ownerUserId) {
      res.status(400).json({ ok: false, error: 'MISSING_OWNER_USER_ID' });
      return;
    }

    // Check if meeting already exists for this owner
    const existing = await wiredContainer.storage.loadMeeting(
      meetingId,
      ownerUserId,
    );

    if (existing.ok) {
      const joinResult = await wiredContainer.runner.handleAction(
        meetingId,
        ownerUserId,
        { type: 'JOIN_OR_REFRESH' },
      );
      res.json(joinResult);
      return;
    }

    if (existing.error === 'ACCESS_DENIED') {
      res.status(403).json(existing);
      return;
    }

    // Create fresh MeetingState and save atomically before arming the heartbeat
    const initialState = createInitialMeetingState({
      meetingId,
      ownerUserId,
      userName,
      topic,
    });

    const saveResult = await wiredContainer.storage.saveMeeting(initialState);
    if (!saveResult.ok) {
      res.status(500).json(saveResult);
      return;
    }

    await wiredContainer.broadcast.publishRoomUpdate(meetingId, initialState);

    const startResult = await wiredContainer.runner.handleAction(
      meetingId,
      ownerUserId,
      { type: 'START_MEETING' },
    );

    res.json(startResult);
  } catch {
    res.status(500).json({ ok: false, error: 'STORAGE_FAILURE' });
  }
});

/**
 * POST /api/meetings/:meetingId/reset
 * Allows the room owner to start a fresh meeting cycle with a new or rotated topic.
 */
app.post(
  '/api/meetings/:meetingId/reset',
  async (req: Request, res: Response) => {
    try {
      const meetingId = String(req.params['meetingId'] ?? '').trim();
      const body: Record<string, unknown> =
        typeof req.body === 'object' && req.body !== null ? req.body : {};
      const ownerUserId = readOptionalString(body, 'ownerUserId');
      const requestedUserName = readOptionalString(body, 'userName');
      const requestedTopic = readOptionalString(body, 'topic');

      if (!meetingId || !ownerUserId) {
        res.status(400).json({ ok: false, error: 'INVALID_PARAMETERS' });
        return;
      }

      const existing = await wiredContainer.storage.loadMeeting(
        meetingId,
        ownerUserId,
      );
      if (!existing.ok && existing.error === 'ACCESS_DENIED') {
        res.status(403).json(existing);
        return;
      }

      wiredContainer.clock.cancelScheduledTick(meetingId);

      const currentUserName =
        requestedUserName ||
        (existing.ok ? existing.state.userName : undefined) ||
        'Visitor';

      const nextTopic =
        requestedTopic ||
        DEFAULT_MEETING_TOPICS[
          Math.floor(Date.now() / 1000) % DEFAULT_MEETING_TOPICS.length
        ];

      const freshState = createInitialMeetingState({
        meetingId,
        ownerUserId,
        userName: currentUserName,
        topic: nextTopic,
      });

      const saveResult = await wiredContainer.storage.saveMeeting(freshState);
      if (!saveResult.ok) {
        res.status(500).json(saveResult);
        return;
      }

      await wiredContainer.broadcast.publishRoomUpdate(meetingId, freshState);
      const startResult = await wiredContainer.runner.handleAction(
        meetingId,
        ownerUserId,
        { type: 'START_MEETING' },
      );

      res.json(startResult);
    } catch {
      res.status(500).json({ ok: false, error: 'STORAGE_FAILURE' });
    }
  },
);

/**
 * POST /api/meetings/:meetingId/action
 * Dispatches validated UserIntentAction ("JOIN_OR_REFRESH", "RAISE_HAND", "LOWER_HAND",
 * "SUBMIT_SHARE", "RESUME_FROM_CRISIS") to 03-autonomous-runner.
 * Blocks external 'TICK' spoofing.
 */
app.post(
  '/api/meetings/:meetingId/action',
  async (req: Request, res: Response) => {
    try {
      const meetingId = String(req.params['meetingId'] ?? '').trim();
      const body: Record<string, unknown> =
        typeof req.body === 'object' && req.body !== null ? req.body : {};

      const requestingUserId = readOptionalString(body, 'requestingUserId');
      const action = parseClientUserIntentAction(body['action']);

      if (!meetingId || !requestingUserId || !action) {
        res.status(400).json({ ok: false, error: 'INVALID_INTENT_PAYLOAD' });
        return;
      }

      const result = await wiredContainer.runner.handleAction(
        meetingId,
        requestingUserId,
        action,
      );

      if (!result.ok) {
        const status =
          result.error === 'ACCESS_DENIED'
            ? 403
            : result.error === 'NOT_FOUND'
              ? 404
              : 500;
        res.status(status).json(result);
        return;
      }

      res.json(result);
    } catch {
      res.status(500).json({ ok: false, error: 'STORAGE_FAILURE' });
    }
  },
);

/**
 * GET /api/meetings/:meetingId/stream
 * Server-Sent Events (SSE) live stream from BroadcastOutlet.
 * Verifies ownerUserId before streaming room updates.
 */
app.get(
  '/api/meetings/:meetingId/stream',
  async (req: Request, res: Response) => {
    const meetingId = String(req.params['meetingId'] ?? '').trim();
    const requestingUserId = String(req.query['userId'] ?? '').trim();

    if (!meetingId || !requestingUserId) {
      res.status(400).json({ ok: false, error: 'MISSING_PARAMETERS' });
      return;
    }

    const initialCheck = await wiredContainer.runner.handleAction(
      meetingId,
      requestingUserId,
      { type: 'JOIN_OR_REFRESH' },
    );

    if (!initialCheck.ok) {
      const status =
        initialCheck.error === 'ACCESS_DENIED'
          ? 403
          : initialCheck.error === 'NOT_FOUND'
            ? 404
            : 500;
      res.status(status).json(initialCheck);
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Immediately push the authoritative snapshot upon connection
    res.write(`data: ${JSON.stringify(initialCheck.state)}\n\n`);

    const unsubscribe = wiredContainer.realServerAdapter?.subscribeToRoom(
      meetingId,
      (updatedState) => {
        res.write(`data: ${JSON.stringify(updatedState)}\n\n`);
      },
    );

    // Keep-alive comment every 15s so proxies never drop the SSE stream
    const keepAliveInterval = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAliveInterval);
      if (unsubscribe) {
        unsubscribe();
      }
    });
  },
);

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
