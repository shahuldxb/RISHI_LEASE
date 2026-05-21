import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  AlertTriangle, LayoutDashboard, LogOut, PanelLeft, FileText,
  BarChart3, Settings, Bell,
  FileCheck, TrendingUp, ChevronDown, ChevronRight,
  Sparkles, Calculator, Calendar, Cog
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { trpc } from "@/lib/trpc";
import { ScreenErrorBoundary } from "@/components/ScreenErrorBoundary";

type NavItem = {
  icon: React.ElementType;
  label: string;
  path?: string;
  children?: { label: string; path: string }[];
};

const menuItems: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  {
    icon: FileText, label: "Lease Management",
    children: [
      { label: "Lease Register",    path: "/leases" },
      { label: "New Lease",         path: "/leases/new" },
      { label: "Lessor Master",      path: "/lessor-master" },
      { label: "Lessee Master",      path: "/lessee-master" },
      { label: "Staff Master",       path: "/staff-master" },
      { label: "Sub-Asset Registry",  path: "/sub-asset-registry" },
      { label: "Sub-Asset Txn Log",   path: "/sub-asset-registry/transactions" },
      { label: "Transaction Centre", path: "/leases/transaction-centre" },
    ],
  },
  {
    icon: FileCheck, label: "Contracts",
    children: [
      { label: "Contract Register",    path: "/contracts" },
      { label: "Metadata Templates",    path: "/contracts/metadata-templates" },
      { label: "Master Contracts",      path: "/contracts/msc" },
      { label: "Documents",             path: "/contracts/documents" },
      { label: "Milestones",            path: "/contracts/milestones" },
      { label: "Modifications",         path: "/contracts/modifications" },
      { label: "History",               path: "/contracts/history" },
    ],
  },




  {
    icon: BarChart3, label: "MIS & Analytics",
    children: [
      { label: "Portfolio Health",  path: "/mis/portfolio" },
      { label: "Cash Flow Forecast",path: "/mis/cashflow" },
      { label: "Cost Performance",  path: "/mis/cost" },
      { label: "AI Query Panel",    path: "/mis/ai-query" },
      { label: "Custom Reports",    path: "/mis/reports" },
    ],
  },


  {
    icon: Calculator, label: "Accounting Engine",
    children: [
      { label: "IBR Library",         path: "/accounting/ibr" },
      { label: "Lease Classification", path: "/accounting/classification" },
      { label: "Remeasurement",       path: "/accounting/remeasurement" },
      { label: "CPI Escalation",      path: "/accounting/cpi" },
      { label: "IFRS 16 Disclosure",  path: "/accounting/disclosure" },
      { label: "Disclosure Notes",     path: "/accounting/disclosure-notes" },
      { label: "IAS 17 vs IFRS 16",    path: "/accounting/ias17-comparison" },
      { label: "Period-End Close",     path: "/accounting/period-close" },
      { label: "Journal Voucher Register", path: "/accounting/journal-voucher" },
      { label: "Accounting Settings",    path: "/accounting/settings" },
      { label: "Roll-Forward Report",  path: "/accounting/roll-forward" },
      { label: "IFRS 16 Reports Centre", path: "/reports/ifrs16" },
      { label: "Disclosure Pack",       path: "/accounting/disclosure-pack" },
      { label: "Multi-Standard (IFRS/ASC/IPSAS)", path: "/accounting/multi-standard" },
    ],
  },

  {
    icon: TrendingUp, label: "Finance & Planning",
    children: [
      { label: "Maturity Ladder",    path: "/accounting/maturity-ladder" },
    ],
  },



  {
    icon: Bell, label: "Alerts & Reports",
    children: [
      { label: "Alert Rules",        path: "/admin/alerts-reports" },
      { label: "Scheduled Reports",  path: "/admin/scheduled-reports" },
      { label: "Alert Centre",       path: "/alerts" },
    ],
  },



  {
    icon: TrendingUp, label: "Budgeting & ESG",
    children: [
      { label: "ESG Data Entry",          path: "/esg/data-entry" },
      { label: "ESG Report",              path: "/esg/report" },
    ],
  },
  {
    icon: Cog, label: "Configuration Centre",
    children: [
      { label: "Chart of Accounts",     path: "/config/coa" },
      { label: "GL Mapping Rules",       path: "/config/gl-mappings" },
      { label: "Business Rules Engine",  path: "/config/business-rules" },
    ],
  },
  {
    icon: Sparkles, label: "AI & Intelligence",
    children: [
      { label: "AI Lease Analytics",   path: "/ai-analytics" },
    ],
  },

  {
    icon: Settings, label: "System Settings",
    children: [
      { label: "Notification Settings",path: "/admin/notifications" },
      { label: "SSO Configuration",    path: "/admin/sso" },
      { label: "API & Webhooks",       path: "/admin/api-webhooks" },
      { label: "E-Signature",          path: "/admin/esignature" },
      { label: "Audit Log",            path: "/compliance/audit" },
      { label: "Error Log",            path: "/compliance/errors" },
      { label: "Administration",       path: "/admin" },
      { label: "DB Performance",       path: "/system/performance" },
    ],
  },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              Sign in to continue
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              The local app user is not available. Restart the dev server and try again.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = "/";
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Back to landing
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const { data: aiHealth } = trpc.system.aiHealth.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  // ── Renewal Due Badge ────────────────────────────────────────────────────
  const { data: renewalDueData } = trpc.lease.getRenewalDueCount.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000, // refresh every 5 minutes
    staleTime: 2 * 60 * 1000,
  });
  const renewalDueCount = renewalDueData?.count ?? 0;

  const checkAndNotify = trpc.lease.checkAndNotifyRenewalDue.useMutation();
  const hasCheckedRef = useRef(false);
  useEffect(() => {
    if (!hasCheckedRef.current && user) {
      hasCheckedRef.current = true;
      checkAndNotify.mutate();
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold tracking-tight truncate">
                    Navigation
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 overflow-y-auto scrollbar-thin">
            <SidebarMenu className="px-2 py-1">
              {menuItems.map(item => {
                if (item.children) {
                  const isGroupActive = item.children.some(c => location.startsWith(c.path));
                  return (
                    <Collapsible key={item.label} defaultOpen={isGroupActive}>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            isActive={isGroupActive}
                            tooltip={item.label}
                            className="h-10 transition-all font-normal w-full justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <item.icon className={`h-4 w-4 ${isGroupActive ? "text-primary" : ""}`} />
                              <span>{item.label}</span>
                            </div>
                            <ChevronDown className="h-3 w-3 text-muted-foreground group-data-[state=open]:rotate-180 transition-transform" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="ml-6 mt-0.5 mb-1 border-l border-sidebar-border pl-2 flex flex-col gap-0.5">
                            {item.children.map(child => (
                              <button
                                key={child.label}
                                onClick={() => setLocation(child.path)}
                                className={`text-left text-sm px-2 py-1.5 rounded-md transition-colors w-full flex items-center justify-between ${
                                  location === child.path
                                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                                }`}
                              >
                                <span>{child.label}</span>
                                {child.path === "/leases/renewal-engine" && renewalDueCount > 0 && (
                                  <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-none">
                                    {renewalDueCount > 99 ? "99+" : renewalDueCount}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path ?? item.label}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => item.path && setLocation(item.path)}
                      tooltip={item.label}
                      className="h-10 transition-all font-normal"
                    >
                      <item.icon className={`h-4 w-4 ${isActive ? "text-primary" : ""}`} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <div className="mb-2 group-data-[collapsible=icon]:hidden">
              <Badge
                variant="outline"
                className={`w-full justify-center text-[10px] ${
                  aiHealth?.ok
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                    : "border-red-500/40 bg-red-500/10 text-red-400"
                }`}
                title={
                  aiHealth?.ok
                    ? `AI provider: ${aiHealth.provider}`
                    : `AI missing: ${aiHealth?.missing?.join(", ") || "configuration"}`
                }
              >
                {aiHealth?.ok ? "Azure OpenAI ready" : "Azure OpenAI not ready"}
              </Badge>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <ScreenErrorBoundary username={(user as any)?.name ?? (user as any)?.email}>
            {children}
          </ScreenErrorBoundary>
        </main>
      </SidebarInset>
    </>
  );
}
