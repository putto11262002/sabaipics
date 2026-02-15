import { useParams } from 'react-router';
import { ColorGradeCard } from '../../../../components/events/ColorGradeCard';

export default function EventColorTab() {
  const { id } = useParams<{ id: string }>();

  if (!id) return null;

  return (
    <div className="mx-auto max-w-4xl py-6">
      <ColorGradeCard eventId={id} />
    </div>
  );
}
