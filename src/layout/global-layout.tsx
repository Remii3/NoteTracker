import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  BookOpen,
  CircleCheck,
  LayoutGrid,
  Trash2,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { toast } from "@/components/ui/toast";

import { AppFrame, MobileAppSidebarHeader } from "@/layout/app-header";
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
  useUser,
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
  const { signOut } = useAuth();
  const user = useUser();
  const userId = user.id;
  const navigate = useNavigate();
  const [accountOpen, setAccountOpen] = useState(false);
  const [recentModules, setRecentModules] = useState<RecentModule[]>(() =>
    userId ? readRecentModules(userId) : [],
  );

  useEffect(() => {
    return subscribeToRecentModules(userId, setRecentModules);
  }, [userId]);

  const handleSignOut = useCallback(() => {
    void signOut()
      .then(() => {
        if (userId) clearUserMemoryCache(userId);
        navigate("/");
      })
      .catch(() => {
        toast.add({
          data: { type: "error" },
          description: "Nie udało się wylogować. Spróbuj ponownie.",
        });
      });
  }, [navigate, signOut, userId]);

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
        <nav aria-label="Główna nawigacja">
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
                          className="border border-transparent aria-[current=page]:border-sidebar-border aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground"
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
        </nav>
        {recentModules.length > 0 && (
          <nav aria-label="Ostatnie moduły" className="border-t">
            <SidebarGroup>
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
                        <span className="ml-auto grid size-4 shrink-0 place-items-center">
                          {module.progress === 100 ? (
                            <CircleCheck
                              className="size-4 text-primary"
                              aria-hidden="true"
                            />
                          ) : (
                            <svg
                              viewBox="0 0 20 20"
                              className="size-4 -rotate-90"
                              aria-hidden="true"
                            >
                              <circle
                                cx="10"
                                cy="10"
                                r="8"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                className="text-sidebar-foreground/20"
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
                                className="text-primary transition-[stroke-dashoffset] motion-reduce:transition-none dark:text-chart-2"
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
          </nav>
        )}
      </SidebarContent>
      <SidebarFooter className="min-h-16 shrink-0 justify-center border-t p-2">
        {accountMenu}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
