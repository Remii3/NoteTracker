import { useEffect, useState } from "react";
import {
  BarChart3,
  BookOpen,
  CircleCheck,
  LayoutGrid,
  Trash2,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router";

import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { AccountMenu, getUserDisplayName, useUser } from "@/features/auth";
import { AppLayout } from "@/layout/app-layout";
import {
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

export function GlobalRoutes() {
  const user = useUser();
  const userId = user.id;
  const navigate = useNavigate();
  const [recentModules, setRecentModules] = useState<RecentModule[]>(() =>
    userId ? readRecentModules(userId) : [],
  );

  useEffect(() => {
    return subscribeToRecentModules(userId, setRecentModules);
  }, [userId]);

  return (
    <AppLayout
      accountMenu={(onOpenAccount) => (
        <AccountMenu
          userName={getUserDisplayName(user)}
          userEmail={user.email}
          onOpenAccount={onOpenAccount}
        />
      )}
      onOpenHome={() => navigate("/")}
      sidebar={<GlobalNavigation recentModules={recentModules} />}
    >
      <Outlet />
    </AppLayout>
  );
}

function GlobalNavigation({
  recentModules,
}: {
  recentModules: RecentModule[];
}) {
  const { isMobile, setOpenMobile } = useSidebar();

  const closeMobileNavigation = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
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
                        onClick={closeMobileNavigation}
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
                          onClick={closeMobileNavigation}
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
  );
}
