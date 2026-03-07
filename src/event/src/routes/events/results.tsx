import { useParams, useLocation, useNavigate, Navigate } from 'react-router';
import type { SearchResult } from '../../lib/api';
import { ResultsStep } from '../../components/ResultsStep';
import { EmptyStep } from '../../components/EmptyStep';

export function ResultsPage() {
  const { eventId, searchId } = useParams<{ eventId: string; searchId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const searchResult = location.state as SearchResult | null;

  // If accessed directly (no state), redirect to search home
  if (!searchResult || !eventId || !searchId) {
    return <Navigate to={`/${eventId}/search`} replace />;
  }

  const handleBack = () => navigate(`/${eventId}/search`);

  if (searchResult.photos.length === 0) {
    return <EmptyStep onRetry={handleBack} />;
  }

  return (
    <ResultsStep
      eventId={eventId}
      searchId={searchId}
      photos={searchResult.photos}
      onSearchAgain={handleBack}
    />
  );
}
