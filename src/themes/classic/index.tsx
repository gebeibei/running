import './styles/index.css';
import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import Index from './pages/index';
import './components/Header';
import './components/ActivityList';
import './components/Layout';
import './components/RunMap';
import './components/RunMap/RunMarker';
import './components/SVGStat';
import './components/YearStat';
import './components/YearSummaryModal';

const Summary = lazy(() => import('./pages/summary'));

export default function ClassicTheme() {
  return (
    <HelmetProvider>
      <BrowserRouter>
        <Suspense fallback={<div>Loading...</div>}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/summary" element={<Summary />} />
            <Route path="*" element={<Index />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </HelmetProvider>
  );
}
