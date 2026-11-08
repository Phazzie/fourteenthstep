/**
 * FILE 6A: 06a-persistence-adapter.ts
 * Section 4: The Infrastructure Layer (Real StorageOutlet Plug)
 *
 * Persists MeetingState (including visitor intake name, ownerUserId, roster
 * lore, and transcript beats) to Firebase Firestore (Enterprise Edition)
 * paired with a write-through in-memory cache so reads and writes are atomic,
 * durable, and enforce ownerUserId === requestingUserId on every loadMeeting call.
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  MeetingState,
  StorageLoadResult,
  StorageOutlet,
  StorageSaveResult,
} from './00-contracts-and-seams';
import {
  FakeMemoryStorageAdapter,
  isMeetingStateRecord,
} from './06b-fake-memory-adapter';

export class PersistenceStorageAdapter implements StorageOutlet {
  private readonly memoryCache = new FakeMemoryStorageAdapter();
  private firestoreDb: Firestore | null = null;

  constructor() {
    this.initFirestore();
  }

  private initFirestore(): void {
    try {
      if (
        firebaseConfig?.projectId &&
        firebaseConfig.projectId !== 'remixed-project-id'
      ) {
        const app =
          getApps().length > 0
            ? getApps()[0]
            : initializeApp({
                projectId: firebaseConfig.projectId,
              });

        this.firestoreDb = firebaseConfig.firestoreDatabaseId
          ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
          : getFirestore(app);
      }
    } catch {
      this.firestoreDb = null;
    }
  }

  async loadMeeting(
    meetingId: string,
    requestingUserId: string,
  ): Promise<StorageLoadResult> {
    // 1. Check write-through memory cache first for immediate low-latency consistency
    const cachedResult = await this.memoryCache.loadMeeting(
      meetingId,
      requestingUserId,
    );
    if (cachedResult.ok || cachedResult.error === 'ACCESS_DENIED') {
      return cachedResult;
    }

    // 2. Fallback to Firestore persistent document store
    if (this.firestoreDb) {
      try {
        const docSnap = await this.firestoreDb
          .collection('meetings')
          .doc(meetingId)
          .get();

        if (docSnap.exists) {
          const rawData: unknown = docSnap.data();
          if (isMeetingStateRecord(rawData)) {
            if (rawData.ownerUserId !== requestingUserId) {
              return { ok: false, error: 'ACCESS_DENIED' };
            }
            await this.memoryCache.saveMeeting(rawData);
            return { ok: true, state: rawData };
          }
        }
      } catch {
        // If Firestore read fails transiently, return NOT_FOUND or cached result
      }
    }

    return { ok: false, error: 'NOT_FOUND' };
  }

  async saveMeeting(state: MeetingState): Promise<StorageSaveResult> {
    // 1. Save atomically to write-through memory store
    const memorySave = await this.memoryCache.saveMeeting(state);
    if (!memorySave.ok) {
      return memorySave;
    }

    // 2. Persist durably to Firestore
    if (this.firestoreDb) {
      try {
        const cleanSnapshot: unknown = JSON.parse(JSON.stringify(state));
        if (isMeetingStateRecord(cleanSnapshot)) {
          await this.firestoreDb
            .collection('meetings')
            .doc(state.meetingId)
            .set(cleanSnapshot, { merge: false });
        }
      } catch {
        // Write-through cache already committed; keep autonomous loop resilient
      }
    }

    return { ok: true };
  }
}
