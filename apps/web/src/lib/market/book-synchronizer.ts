import type { BookChange, OrderBookSnapshot } from '@crypto/protocol';
import { BOOK_DELTA_BUFFER_MAX } from '@crypto/protocol';

export type BookSyncStatus =
  | 'idle'
  | 'buffering'
  | 'snapshot_loading'
  | 'synchronized'
  | 'resyncing'
  | 'error';

export interface BookDelta {
  seq: string;
  changes: BookChange[];
  timestampMs: number;
}

export interface LocalOrderBook {
  bids: Map<string, string>;
  asks: Map<string, string>;
  sequence: string | null;
}

export interface BookSynchronizerState {
  status: BookSyncStatus;
  generation: number;
  expectedSeq: bigint | null;
  book: LocalOrderBook;
  buffer: BookDelta[];
  lastError: string | null;
}

export type BookSyncAction =
  | { type: 'RESET' }
  | { type: 'BEGIN_SYNC' }
  | { type: 'SNAPSHOT_STARTED'; generation: number }
  | { type: 'SNAPSHOT_RECEIVED'; generation: number; snapshot: OrderBookSnapshot }
  | { type: 'SNAPSHOT_FAILED'; generation: number; error: string }
  | { type: 'DELTA'; delta: BookDelta }
  | { type: 'BUFFER_OVERFLOW' };

function emptyBook(): LocalOrderBook {
  return { bids: new Map(), asks: new Map(), sequence: null };
}

export function createBookSynchronizerState(): BookSynchronizerState {
  return {
    status: 'idle',
    generation: 0,
    expectedSeq: null,
    book: emptyBook(),
    buffer: [],
    lastError: null,
  };
}

function applyChange(book: LocalOrderBook, change: BookChange): void {
  const map = change.side === 'bid' ? book.bids : book.asks;
  if (change.quantity === '0' || Number(change.quantity) === 0) {
    map.delete(change.price);
  } else {
    map.set(change.price, change.quantity);
  }
}

function cloneBook(book: LocalOrderBook): LocalOrderBook {
  return {
    bids: new Map(book.bids),
    asks: new Map(book.asks),
    sequence: book.sequence,
  };
}

function bookFromSnapshot(snapshot: OrderBookSnapshot): LocalOrderBook {
  return {
    bids: new Map(snapshot.bids),
    asks: new Map(snapshot.asks),
    sequence: snapshot.sequence,
  };
}

function applyDeltaInOrder(
  state: BookSynchronizerState,
  delta: BookDelta,
): BookSynchronizerState {
  if (state.expectedSeq === null) {
    return state;
  }
  const seq = BigInt(delta.seq);

  if (seq < state.expectedSeq) {
    // Duplicate/old — ignore safely.
    return state;
  }
  if (seq > state.expectedSeq) {
    // Gap — must resync. Never sort to fake continuity.
    return {
      ...state,
      status: 'resyncing',
      lastError: `Sequence gap: expected ${state.expectedSeq.toString()}, got ${delta.seq}`,
      buffer: [delta],
      expectedSeq: null,
    };
  }

  const book = cloneBook(state.book);
  for (const change of delta.changes) {
    applyChange(book, change);
  }
  book.sequence = delta.seq;

  return {
    ...state,
    book,
    expectedSeq: seq + 1n,
    status: 'synchronized',
    lastError: null,
  };
}

function flushBuffer(state: BookSynchronizerState): BookSynchronizerState {
  let next = state;
  const queued = [...state.buffer];
  next = { ...next, buffer: [] };

  for (const delta of queued) {
    next = applyDeltaInOrder(next, delta);
    if (next.status === 'resyncing') {
      // Remaining deltas stay buffered for the new sync generation.
      const idx = queued.indexOf(delta);
      next = {
        ...next,
        buffer: queued.slice(idx),
      };
      break;
    }
  }
  return next;
}

export function reduceBookSynchronizer(
  state: BookSynchronizerState,
  action: BookSyncAction,
): BookSynchronizerState {
  switch (action.type) {
    case 'RESET':
      return createBookSynchronizerState();

    case 'BEGIN_SYNC': {
      const generation = state.generation + 1;
      return {
        ...state,
        generation,
        status: state.status === 'synchronized' ? 'resyncing' : 'buffering',
        expectedSeq: null,
        buffer: [],
        lastError: null,
      };
    }

    case 'SNAPSHOT_STARTED': {
      if (action.generation !== state.generation) {
        return state;
      }
      return {
        ...state,
        status: state.status === 'resyncing' ? 'resyncing' : 'snapshot_loading',
      };
    }

    case 'SNAPSHOT_RECEIVED': {
      if (action.generation !== state.generation) {
        // Stale snapshot — ignore.
        return state;
      }
      const S = BigInt(action.snapshot.sequence);
      const retained = state.buffer.filter((d) => BigInt(d.seq) > S);
      let next: BookSynchronizerState = {
        ...state,
        book: bookFromSnapshot(action.snapshot),
        expectedSeq: S + 1n,
        buffer: retained,
        status: 'synchronized',
        lastError: null,
      };
      next = flushBuffer(next);
      return next;
    }

    case 'SNAPSHOT_FAILED': {
      if (action.generation !== state.generation) {
        return state;
      }
      return {
        ...state,
        status: 'error',
        lastError: action.error,
      };
    }

    case 'DELTA': {
      if (
        state.status === 'idle' ||
        state.status === 'buffering' ||
        state.status === 'snapshot_loading' ||
        state.status === 'resyncing' ||
        state.expectedSeq === null
      ) {
        const buffer = [...state.buffer, action.delta];
        if (buffer.length > BOOK_DELTA_BUFFER_MAX) {
          return {
            ...state,
            status: 'resyncing',
            buffer: [],
            expectedSeq: null,
            lastError: 'Delta buffer overflow; restarting synchronization',
          };
        }
        return {
          ...state,
          buffer,
          status:
            state.status === 'idle' || state.status === 'error'
              ? 'buffering'
              : state.status,
        };
      }
      return applyDeltaInOrder(state, action.delta);
    }

    case 'BUFFER_OVERFLOW':
      return {
        ...state,
        status: 'resyncing',
        buffer: [],
        expectedSeq: null,
        lastError: 'Delta buffer overflow; restarting synchronization',
      };

    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function topLevels(
  book: LocalOrderBook,
  side: 'bid' | 'ask',
  limit = 10,
): Array<{ price: string; quantity: string }> {
  const map = side === 'bid' ? book.bids : book.asks;
  const entries = [...map.entries()].map(([price, quantity]) => ({
    price,
    quantity,
  }));
  entries.sort((a, b) => {
    const pa = Number(a.price);
    const pb = Number(b.price);
    return side === 'bid' ? pb - pa : pa - pb;
  });
  return entries.slice(0, limit);
}
