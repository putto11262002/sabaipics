import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

interface SimplePhotoLightboxProps {
  photos: Array<{ previewUrl: string; id: string }>;
  index: number;
  open: boolean;
  onClose: () => void;
}

export function SimplePhotoLightbox({
  photos,
  index,
  open,
  onClose,
}: SimplePhotoLightboxProps) {
  const slides = photos.map(photo => ({
    src: photo.previewUrl,
  }));

  return (
    <Lightbox
      open={open}
      close={onClose}
      slides={slides}
      index={index}
    />
  );
}
