import { lazy, Suspense, type ComponentProps } from "react";

import { MoveChapterDialog } from "@/features/modules/move-chapter-dialog";

const AddContentDialog = lazy(() =>
  import("./add-content-dialog").then((module) => ({
    default: module.AddContentDialog,
  })),
);
const RenameItemDialog = lazy(() =>
  import("./item-dialogs").then((module) => ({
    default: module.RenameItemDialog,
  })),
);
const DeleteItemDialog = lazy(() =>
  import("./item-dialogs").then((module) => ({
    default: module.DeleteItemDialog,
  })),
);
const UnsavedChangesDialog = lazy(() =>
  import("./item-dialogs").then((module) => ({
    default: module.UnsavedChangesDialog,
  })),
);
const BulkDeleteDialog = lazy(() =>
  import("./bulk-delete-dialog").then((module) => ({
    default: module.BulkDeleteDialog,
  })),
);

export type WorkspaceDialogsProps = {
  add: ComponentProps<typeof AddContentDialog> | null;
  rename: ComponentProps<typeof RenameItemDialog> | null;
  deleteItem: ComponentProps<typeof DeleteItemDialog> | null;
  bulkDelete: ComponentProps<typeof BulkDeleteDialog> | null;
  navigation: ComponentProps<typeof UnsavedChangesDialog> | null;
  preview: ComponentProps<typeof UnsavedChangesDialog> | null;
  moveChapter: ComponentProps<typeof MoveChapterDialog> | null;
};

export function WorkspaceDialogs({
  add,
  rename,
  deleteItem,
  bulkDelete,
  navigation,
  preview,
  moveChapter,
}: WorkspaceDialogsProps) {
  return (
    <Suspense fallback={null}>
      {add && <AddContentDialog {...add} />}
      {rename && (
        <RenameItemDialog
          key={`${rename.item.kind}-${rename.item.id}`}
          {...rename}
        />
      )}
      {deleteItem && (
        <DeleteItemDialog
          key={`${deleteItem.item.kind}-${deleteItem.item.id}`}
          {...deleteItem}
        />
      )}
      {bulkDelete && <BulkDeleteDialog {...bulkDelete} />}
      {navigation && <UnsavedChangesDialog {...navigation} />}
      {preview && <UnsavedChangesDialog {...preview} />}
      {moveChapter && <MoveChapterDialog {...moveChapter} />}
    </Suspense>
  );
}
