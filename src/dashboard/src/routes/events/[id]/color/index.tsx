import { useParams } from 'react-router';
import { ImagePipelineCard } from '../../../../components/events/ImagePipelineCard';

export default function EventColorTab() {
  const { id } = useParams<{ id: string }>();

  if (!id) return null;

  return (
    <div className="mx-auto max-w-4xl py-6">
      <ImagePipelineCard eventId={id} />
    </div>
  );
}
