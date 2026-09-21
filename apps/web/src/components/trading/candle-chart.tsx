'use client';

import type { Candle } from '@crypto/protocol';
import {
  ColorType,
  CrosshairMode,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type Time,
} from 'lightweight-charts';
import { useEffect, useRef } from 'react';
import { useTradingStore } from '../../stores/trading-store';

function toCandleData(candle: Candle): CandlestickData {
  return {
    time: Math.floor(candle.openTimeMs / 1000) as Time,
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
  };
}

function toVolumeData(candle: Candle): HistogramData {
  const up = Number(candle.close) >= Number(candle.open);
  return {
    time: Math.floor(candle.openTimeMs / 1000) as Time,
    value: Number(candle.volume),
    color: up ? 'rgba(34, 197, 94, 0.45)' : 'rgba(239, 68, 68, 0.45)',
  };
}

interface CandleChartProps {
  candles: Candle[];
  stale: boolean;
}

export function CandleChart({ candles, stale }: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const setInspectedCandle = useTradingStore((s) => s.setInspectedCandle);
  const lastAppliedKey = useRef<string>('');
  const candlesRef = useRef(candles);

  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#0b1220' },
        textColor: '#9db0c9',
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.08)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.08)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(148, 163, 184, 0.2)' },
      timeScale: {
        borderColor: 'rgba(148, 163, 184, 0.2)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setInspectedCandle(null);
        return;
      }
      const candle = candlesRef.current.find(
        (c) => Math.floor(c.openTimeMs / 1000) === Number(param.time),
      );
      if (!candle) {
        setInspectedCandle(null);
        return;
      }
      setInspectedCandle({
        openTimeMs: candle.openTimeMs,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      });
    });

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [setInspectedCandle]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!candleSeries || !volumeSeries) {
      return;
    }

    const key = `${candles.length}:${candles[0]?.openTimeMs ?? 0}:${candles[candles.length - 1]?.close ?? ''}:${candles[candles.length - 1]?.volume ?? ''}`;
    if (key === lastAppliedKey.current && candles.length > 0) {
      const last = candles[candles.length - 1];
      if (last) {
        candleSeries.update(toCandleData(last));
        volumeSeries.update(toVolumeData(last));
      }
      return;
    }

    lastAppliedKey.current = key;
    candleSeries.setData(candles.map(toCandleData));
    volumeSeries.setData(candles.map(toVolumeData));
    chartRef.current?.timeScale().scrollToRealTime();
  }, [candles]);

  return (
    <div className="relative h-full min-h-[320px] w-full overflow-hidden rounded-xl border border-slate-800 bg-[#0b1220]">
      <div ref={containerRef} className="h-full w-full" />
      {stale ? (
        <div className="pointer-events-none absolute left-3 top-3 rounded bg-amber-500/20 px-2 py-1 text-xs font-medium text-amber-200">
          STALE
        </div>
      ) : null}
    </div>
  );
}
