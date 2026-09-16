import { GalleryPage as Gallery } from "../components/gallery-page";
import { useModuleContext } from "../components/module-context";

export function GalleryPage() {
  const { moduleId, sortMode, imagesService, openChapter, moduleName } =
    useModuleContext();

  return (
    <Gallery
      key={`${moduleId}:${sortMode}`}
      moduleId={moduleId}
      moduleName={moduleName}
      sortMode={sortMode}
      service={imagesService}
      onOpenTopic={openChapter}
    />
  );
}
