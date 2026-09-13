import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  BookOpen,
  CircleCheck,
  LayoutGrid,
  Trash2,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { toast } from "sonner";

import { AppFrame, MobileAppSidebarHeader } from "@/components/app-header";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  AccountDialog,
  AccountMenu,
  getUserDisplayName,
  useAuth,
} from "@/features/auth";
import {
  clearUserMemoryCache,
  readRecentModules,
  subscribeToRecentModules,
  type RecentModule,
} from "@/lib/memory-cache";

const navigation = [
  { to: "/", label: "Moduły", icon: LayoutGrid, end: true },
  {
    to: "/statistics",
    label: "Statystyki",
    icon: BarChart3,
    end: false,
  },
  { to: "/trash", label: "Kosz", icon: Trash2, end: false },
] as const;

export function GlobalLayout() {
  const { signOut, user } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();
  const [accountOpen, setAccountOpen] = useState(false);
  const [recentModules, setRecentModules] = useState<RecentModule[]>(() =>
    userId ? readRecentModules(userId) : [],
  );
  useEffect(() => {
    if (!userId) return;
    return subscribeToRecentModules(userId, setRecentModules);
  }, [userId]);
  const handleSignOut = useCallback(() => {
    void signOut()
      .then(() => {
        if (userId) clearUserMemoryCache(userId);
        navigate("/");
      })
      .catch(() => {
        toast.error("Nie udało się wylogować. Spróbuj ponownie.");
      });
  }, [navigate, signOut, userId]);

  if (!user) return null;

  const accountMenu = (
    <AccountMenu
      userName={getUserDisplayName(user)}
      userEmail={user.email}
      onOpenAccount={() => setAccountOpen(true)}
      onSignOut={handleSignOut}
    />
  );

  return (
    <>
      <AppFrame
        content={<Outlet />}
        sidebar={
          <GlobalSidebar
            accountMenu={accountMenu}
            recentModules={recentModules}
            onOpenHome={() => navigate("/")}
          />
        }
        onOpenHome={() => navigate("/")}
      />
      {accountOpen && <AccountDialog onClose={() => setAccountOpen(false)} />}
    </>
  );
}

function GlobalSidebar({
  accountMenu,
  onOpenHome,
  recentModules,
}: {
  accountMenu: React.ReactNode;
  onOpenHome: () => void;
  recentModules: RecentModule[];
}) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <Sidebar className="top-14 h-[calc(100svh-3.5rem)] [&_a]:cursor-default [&_button]:cursor-default">
      <MobileAppSidebarHeader
        onOpenHome={() => {
          onOpenHome();
          if (isMobile) setOpenMobile(false);
        }}
      />
      <SidebarContent className="gap-0">
        <SidebarGroup>
          <SidebarGroupLabel>Nawigacja</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map(({ to, label, icon: Icon, end }) => (
                <SidebarMenuItem key={to}>
                  <SidebarMenuButton
                    render={
                      <NavLink
                        to={to}
                        end={end}
                        className="relative before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:content-[''] aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-sidebar-accent-foreground aria-[current=page]:before:bg-primary"
                        onClick={() => isMobile && setOpenMobile(false)}
                      />
                    }
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {recentModules.length > 0 && (
          <SidebarGroup className="border-t">
            <SidebarGroupLabel>Ostatnie moduły</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {recentModules.map((module) => (
                  <SidebarMenuItem key={module.id}>
                    <SidebarMenuButton
                      className="h-10"
                      tooltip={{
                        children: `${module.name} — ukończono ${module.progress}%`,
                        hidden: false,
                      }}
                      render={
                        <NavLink
                          to={`/${module.slug}`}
                          state={{ moduleId: module.id }}
                          onClick={() => isMobile && setOpenMobile(false)}
                        />
                      }
                    >
                      <BookOpen />
                      <span className="min-w-0 flex-1 truncate">
                        {module.name}
                      </span>
                      <span className="ml-auto grid size-6 shrink-0 place-items-center">
                        {module.progress === 100 ? (
                          <CircleCheck
                            className="size-5 text-primary"
                            aria-hidden="true"
                          />
                        ) : (
                          <svg
                            viewBox="0 0 20 20"
                            className="size-5 -rotate-90"
                            aria-hidden="true"
                          >
                            <circle
                              cx="10"
                              cy="10"
                              r="8"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className="text-sidebar-border"
                            />
                            <circle
                              cx="10"
                              cy="10"
                              r="8"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              pathLength="100"
                              strokeDasharray="100"
                              strokeDashoffset={100 - module.progress}
                              className="text-primary transition-[stroke-dashoffset]"
                            />
                          </svg>
                        )}
                        <span className="sr-only">
                          Ukończono {module.progress}%
                        </span>
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="min-h-16 shrink-0 justify-center border-t p-2">
        {accountMenu}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
