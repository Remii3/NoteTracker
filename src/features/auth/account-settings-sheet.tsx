import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AccountSettings } from "./account-page";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AccountSettingsSheet({ open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <SheetHeader className="sr-only">
          <SheetTitle>Panel ustawień</SheetTitle>
          <SheetDescription>Ustawienia konta i preferencji.</SheetDescription>
        </SheetHeader>
        <AccountSettings />
      </SheetContent>
    </Sheet>
  );
}
