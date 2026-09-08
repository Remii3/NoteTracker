import { GalleryPage as Gallery } from "../components/gallery-page";
import { useModuleContext } from "../components/module-context";

export function GalleryPage() {
  const { moduleId, sortMode, imagesService, openChapter } = useModuleContext();

  return (
    <Gallery
      key={`${moduleId}:${sortMode}`}
      moduleId={moduleId}
      sortMode={sortMode}
      service={imagesService}
      onOpenTopic={openChapter}
    />
  );
}
