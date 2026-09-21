import { AppErrorBoundary } from '../components/trading/error-boundary';
import { TradingScreen } from '../components/trading/trading-screen';

export default function HomePage() {
  return (
    <AppErrorBoundary>
      <TradingScreen />
    </AppErrorBoundary>
  );
}
