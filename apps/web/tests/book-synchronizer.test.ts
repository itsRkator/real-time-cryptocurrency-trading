import { describe, expect, it } from 'vitest';
import {
  createBookSynchronizerState,
  reduceBookSynchronizer,
  type BookDelta,
} from '../src/lib/market/book-synchronizer';

function delta(seq: string, changes: BookDelta['changes'] = []): BookDelta {
  return {
    seq,
    timestampMs: 1,
    changes:
      changes.length > 0
        ? changes
        : [{ side: 'bid', price: '68000.00', quantity: '1.000000' }],
  };
}

describe('order-book synchronizer', () => {
  it('buffers deltas during snapshot and applies contiguous post-snapshot sequences', () => {
    let state = createBookSynchronizerState();
    state = reduceBookSynchronizer(state, { type: 'BEGIN_SYNC' });
    const generation = state.generation;

    state = reduceBookSynchronizer(state, {
      type: 'DELTA',
      delta: delta('99'),
    });
    state = reduceBookSynchronizer(state, {
      type: 'DELTA',
      delta: delta('100'),
    });
    state = reduceBookSynchronizer(state, {
      type: 'DELTA',
      delta: delta('101', [
        { side: 'bid', price: '68001.00', quantity: '2.000000' },
      ]),
    });
    state = reduceBookSynchronizer(state, {
      type: 'DELTA',
      delta: delta('102', [
        { side: 'ask', price: '68002.00', quantity: '3.000000' },
      ]),
    });

    state = reduceBookSynchronizer(state, {
      type: 'SNAPSHOT_STARTED',
      generation,
    });

    state = reduceBookSynchronizer(state, {
      type: 'SNAPSHOT_RECEIVED',
      generation,
      snapshot: {
        symbol: 'BTC-USD-SIM',
        sequence: '100',
        timestampMs: 1,
        bids: [['68000.00', '1.000000']],
        asks: [['68010.00', '1.000000']],
      },
    });

    expect(state.status).toBe('synchronized');
    expect(state.expectedSeq).toBe(103n);
    expect(state.book.bids.get('68001.00')).toBe('2.000000');
    expect(state.book.asks.get('68002.00')).toBe('3.000000');
    expect(state.book.bids.get('68000.00')).toBe('1.000000');
  });

  it('detects gaps and enters resyncing', () => {
    let state = createBookSynchronizerState();
    state = reduceBookSynchronizer(state, { type: 'BEGIN_SYNC' });
    const generation = state.generation;

    state = reduceBookSynchronizer(state, {
      type: 'SNAPSHOT_RECEIVED',
      generation,
      snapshot: {
        symbol: 'BTC-USD-SIM',
        sequence: '100',
        timestampMs: 1,
        bids: [['68000.00', '1.000000']],
        asks: [['68010.00', '1.000000']],
      },
    });

    expect(state.expectedSeq).toBe(101n);

    state = reduceBookSynchronizer(state, {
      type: 'DELTA',
      delta: delta('101'),
    });
    state = reduceBookSynchronizer(state, {
      type: 'DELTA',
      delta: delta('102'),
    });
    expect(state.expectedSeq).toBe(103n);

    state = reduceBookSynchronizer(state, {
      type: 'DELTA',
      delta: delta('104'),
    });

    expect(state.status).toBe('resyncing');
    expect(state.expectedSeq).toBeNull();
  });

  it('ignores duplicate old updates', () => {
    let state = createBookSynchronizerState();
    state = reduceBookSynchronizer(state, { type: 'BEGIN_SYNC' });
    const generation = state.generation;
    state = reduceBookSynchronizer(state, {
      type: 'SNAPSHOT_RECEIVED',
      generation,
      snapshot: {
        symbol: 'BTC-USD-SIM',
        sequence: '50',
        timestampMs: 1,
        bids: [['68000.00', '1.000000']],
        asks: [['68010.00', '1.000000']],
      },
    });

    state = reduceBookSynchronizer(state, {
      type: 'DELTA',
      delta: delta('51', [
        { side: 'bid', price: '68000.00', quantity: '5.000000' },
      ]),
    });
    expect(state.book.bids.get('68000.00')).toBe('5.000000');

    state = reduceBookSynchronizer(state, {
      type: 'DELTA',
      delta: delta('50', [
        { side: 'bid', price: '68000.00', quantity: '9.000000' },
      ]),
    });
    expect(state.book.bids.get('68000.00')).toBe('5.000000');
    expect(state.expectedSeq).toBe(52n);
  });

  it('ignores stale snapshot from older generation', () => {
    let state = createBookSynchronizerState();
    state = reduceBookSynchronizer(state, { type: 'BEGIN_SYNC' });
    const oldGeneration = state.generation;
    state = reduceBookSynchronizer(state, { type: 'BEGIN_SYNC' });
    const newGeneration = state.generation;

    state = reduceBookSynchronizer(state, {
      type: 'SNAPSHOT_RECEIVED',
      generation: oldGeneration,
      snapshot: {
        symbol: 'BTC-USD-SIM',
        sequence: '1',
        timestampMs: 1,
        bids: [['1.00', '1.000000']],
        asks: [['2.00', '1.000000']],
      },
    });
    expect(state.book.sequence).toBeNull();

    state = reduceBookSynchronizer(state, {
      type: 'SNAPSHOT_RECEIVED',
      generation: newGeneration,
      snapshot: {
        symbol: 'BTC-USD-SIM',
        sequence: '10',
        timestampMs: 1,
        bids: [['68000.00', '1.000000']],
        asks: [['68010.00', '1.000000']],
      },
    });
    expect(state.book.sequence).toBe('10');
    expect(state.status).toBe('synchronized');
  });
});
