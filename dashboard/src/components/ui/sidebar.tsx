// src/components/ui/sidebar.tsx

import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

import logo from '@/assets/logos/dvepl-logo.png';
import mobile_logo from '@/assets/logos/dvepl.png';

import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Workflow,
} from 'lucide-react';

import { useERPStore } from '@/store/erpStore';
import { isAdminUser } from '@/utils/pagePermissions';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useUiConfig } from '@/contexts/ui/uiConfigContext';

interface SidebarProps {
  isCollapsed: boolean;
  onCollapseChange: (collapsed: boolean) => void;
  isMobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

export default function Sidebar({
  isCollapsed,
  onCollapseChange,
  isMobileOpen,
  onMobileOpenChange,
}: SidebarProps) {
  const store = useERPStore();
  const { config } = useUiConfig();

  // ---------------------------------------------------------
  // Workflow Tracker fallback item
  // ---------------------------------------------------------
  const workflowTrackerItem = {
    name: 'Workflow Tracker',
    path: '/workflow',
    icon: Workflow,
    section: 'Workflow',
  };

  // ---------------------------------------------------------
  // Sidebar items
  // ---------------------------------------------------------
  const sidebarItems = React.useMemo(() => {
    const exists = config.sidebarItems.some(
      (item) => item.path === '/workflow',
    );

    if (exists) {
      return config.sidebarItems;
    }

    return [
      ...config.sidebarItems,
      workflowTrackerItem,
    ];
  }, [config.sidebarItems]);

  const location = useLocation();

  const t = (key: string) => {
    return key;
  };

  const isItemActive = React.useCallback(
    (itemPath?: string) => {
      if (!itemPath) return false;

      const currentPath = location.pathname;

      // Exact match (ignoring trailing slashes)
      const normCurrent = currentPath.replace(/\/+$/, '') || '/';
      const normItem = itemPath.replace(/\/+$/, '') || '/';

      if (normCurrent === normItem) return true;

      // Dashboard special handling
      if (normItem === '/' || normItem === '/dashboard') {
        return normCurrent === '/' || normCurrent === '/dashboard';
      }

      // Related aliases & subpaths for Order / Tender Orders
      if (normItem === '/tender/orders') {
        return (
          normCurrent.startsWith('/tender/orders') ||
          normCurrent.startsWith('/orders')
        );
      }

      // Accounts / costing sheet
      if (normItem === '/accounts') {
        return (
          normCurrent.startsWith('/accounts') ||
          normCurrent.startsWith('/accounts-preview')
        );
      }

      // Engineering Drawings / Export orders
      if (normItem === '/export-orders') {
        return (
          normCurrent.startsWith('/export-orders') ||
          normCurrent.startsWith('/drawings-preview')
        );
      }

      // Purchase orders & requests
      if (normItem === '/purchase/orders') {
        return (
          normCurrent.startsWith('/purchase/orders') ||
          normCurrent.startsWith('/purchase/requests')
        );
      }

      // Logistics delivery & dispatches
      if (normItem === '/logistics/delivery') {
        return (
          normCurrent.startsWith('/logistics/delivery') ||
          normCurrent.startsWith('/logistics/dispatches')
        );
      }

      // Inventory stocks, warehouses, transfers
      if (normItem === '/inventory/stocks') {
        return normCurrent.startsWith('/inventory');
      }

      // Settings and its sub-pages (e.g. notifications)
      if (normItem === '/settings') {
        if (
          normCurrent.startsWith('/settings/custom-fields') ||
          normCurrent.startsWith('/settings/recycle-bin')
        ) {
          return false;
        }
        return normCurrent.startsWith('/settings');
      }

      // Standard hierarchical sub-path (e.g. /hrms/employees/123 -> /hrms/employees)
      if (normCurrent.startsWith(normItem + '/')) {
        return true;
      }

      return false;
    },
    [location.pathname],
  );

  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >(() => {
    try {
      const saved = localStorage.getItem('dvepl_sidebar_expanded_sections');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  });

  const toggleSection = (secName: string) => {
    setExpandedSections((prev) => {
      const current = prev[secName] !== undefined ? prev[secName] : true;
      const next = {
        ...prev,
        [secName]: !current,
      };
      try {
        localStorage.setItem(
          'dvepl_sidebar_expanded_sections',
          JSON.stringify(next),
        );
      } catch (e) {}
      return next;
    });
  };

  const currentUser = store.users.find(
    (u) => u.id === store.currentUserId,
  ) as any;

  // ---------------------------------------------------------
  // Filter sidebar items based on pageAccess
  // ---------------------------------------------------------
  const visibleSidebarItems = React.useMemo(() => {
    if (!currentUser || !currentUser.pageAccess) {
      return sidebarItems;
    }

    // Always grant full access to Admins/Super Admins
    const isAdmin = isAdminUser(currentUser);

    if (isAdmin) {
      return sidebarItems;
    }

    const mapping: Record<string, string> = {
      dashboard: 'dashboard',
      companies: 'companies',
      branches: 'branches',
      departments: 'departments',
      teams: 'teams',
      designations: 'designations',
      cost_centers: 'cost_centers',
      employees: 'employees',
      attendance: 'attendance',
      leaves: 'leaves',
      holidays: 'holidays',
      payroll: 'payroll',
      documents: 'documents',
      tasks: 'tasks',

      customers: 'customers',
      communication_history: 'communication',
      orders: 'orders',

      // Workflow Tracker
      workflow_tracker: 'workflow_tracker',

      delivery: 'delivery',
      vendors: 'vendors',
      inventory: 'inventory',
      finance: 'finance',
      tender_requests: 'tender_requests',
      tenders: 'tenders',
      technical_clarifications: 'technical_clarifications',
      government_departments: 'government_departments',
      sections: 'sections',
      divisions: 'divisions',
      sub_divisions: 'sub_divisions',
      reference_codes: 'reference_codes',
      users: 'users',
      roles: 'roles',
      approval_requests: 'approval_requests',
      reports: 'reports',
      audit_logs: 'audit_logs',
      custom_fields: 'custom_fields',
      recycle_bin: 'recycle_bin',
      settings: 'settings',
      profile: 'profile',
      export_orders: 'export_orders',
      engineering_drawing: 'export_orders',
    };

    return sidebarItems.filter((item) => {
      const normalizedKey = item.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_');

      const key = mapping[normalizedKey] || normalizedKey;

      return currentUser.pageAccess.includes(key);
    });
  }, [currentUser, sidebarItems]);

  // Auto-expand the section containing the active item
  React.useEffect(() => {
    const activeItem = visibleSidebarItems.find((item) =>
      isItemActive(item.path),
    );
    if (activeItem?.section) {
      setExpandedSections((prev) => {
        if (prev[activeItem.section!] === true) return prev;
        const next = {
          ...prev,
          [activeItem.section!]: true,
        };
        try {
          localStorage.setItem(
            'dvepl_sidebar_expanded_sections',
            JSON.stringify(next),
          );
        } catch (e) {}
        return next;
      });
    }
  }, [location.pathname, visibleSidebarItems, isItemActive]);

  // ---------------------------------------------------------
  // Sections
  // ---------------------------------------------------------
  const sections = React.useMemo(() => {
    return Array.from(
      new Set(
        visibleSidebarItems
          .filter((i) => i.section)
          .map((i) => i.section),
      ),
    ) as string[];
  }, [visibleSidebarItems]);

  return (
    <>
      {/* =====================================================
          Desktop Sidebar
      ====================================================== */}
      <motion.aside
        className={`hidden md:flex flex-col h-full bg-card/85 dark:bg-card/45 backdrop-blur-md border-r border-border/50 shrink-0 transition-all duration-300 ease-in-out relative ${
          isCollapsed ? 'w-16' : 'w-80'
        }`}
        layout
        transition={{
          type: 'spring',
          stiffness: 250,
          damping: 30,
        }}
      >
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-4 border-border/50 shrink-0">
          {!isCollapsed && (
            <Link
              to="/"
              className="flex items-center gap-2 font-bold text-md tracking-tight hover:opacity-90"
            >
              <img
                src={logo}
                alt="DVEPL Logo"
                className=""
              />
            </Link>
          )}

          {isCollapsed && (
            <img
              src={mobile_logo}
              alt="DVEPL Logo"
              className="h-7 w-7 rounded-lg mx-auto"
            />
          )}

          <Button
            variant="ghost"
            size="sm"
            className="absolute -right-3 top-[18px] h-6 w-6 rounded-full border border-border bg-background p-0 shadow-sm hover:bg-muted z-50 animate-in fade-in zoom-in duration-200"
            onClick={() => onCollapseChange(!isCollapsed)}
          >
            {isCollapsed ? (
              <ChevronRight className="h-3 w-3" />
            ) : (
              <ChevronLeft className="h-3 w-3" />
            )}
          </Button>
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] py-4 px-3 space-y-6">
          {/* Non-section items */}
          <div className="space-y-1">
            {visibleSidebarItems
              .filter((i) => !i.section)
              .map((item) => {
                const active = isItemActive(item.path);

                return (
                  <Link
                    key={item.name}
                    to={item.path}
                    className={`flex items-center rounded-lg text-xs font-medium transition-all duration-200 relative group ${
                      isCollapsed
                        ? 'justify-center p-2'
                        : 'gap-3 px-3 py-2'
                    } ${
                      active
                        ? 'bg-primary text-primary-foreground font-semibold shadow-sm shadow-primary/25'
                        : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground hover:translate-x-0.5'
                    }`}
                    title={item.name}
                  >
                    <item.icon className="h-4.5 w-4.5 shrink-0" />

                    {!isCollapsed && (
                      <span>{t(item.name)}</span>
                    )}
                  </Link>
                );
              })}
          </div>

          {/* Sections */}
          {sections.map((secName) => {
            const isSectionExpanded =
              expandedSections[secName] !== undefined
                ? expandedSections[secName]
                : true;

            const hasActiveChild = visibleSidebarItems.some(
              (i) => i.section === secName && isItemActive(i.path),
            );

            return (
              <div
                key={secName}
                className="space-y-1.5"
              >
                {!isCollapsed && (
                  <button
                    onClick={() => toggleSection(secName)}
                    className={`w-full flex items-center justify-between text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-colors group cursor-pointer ${
                      hasActiveChild
                        ? 'text-primary font-extrabold'
                        : 'text-foreground/70 hover:text-foreground hover:bg-muted/30'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span>{t(secName)}</span>
                      {hasActiveChild && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary inline-block" />
                      )}
                    </span>

                    <ChevronDown
                      className={`h-3 w-3 transition-transform duration-200 ${
                        !isSectionExpanded
                          ? '-rotate-90'
                          : ''
                      }`}
                    />
                  </button>
                )}

                {isCollapsed && (
                  <div className="h-px bg-border/50 my-2 mx-2" />
                )}

                <AnimatePresence initial={false}>
                  {(!isCollapsed && isSectionExpanded) ||
                  isCollapsed ? (
                    <motion.div
                      initial={
                        isCollapsed
                          ? undefined
                          : { height: 0, opacity: 0 }
                      }
                      animate={
                        isCollapsed
                          ? undefined
                          : { height: 'auto', opacity: 1 }
                      }
                      exit={
                        isCollapsed
                          ? undefined
                          : { height: 0, opacity: 0 }
                      }
                      transition={{
                        duration: 0.2,
                        ease: 'easeInOut',
                      }}
                      className="space-y-1 overflow-hidden"
                    >
                      {visibleSidebarItems
                        .filter(
                          (i) => i.section === secName,
                        )
                        .map((item) => {
                          const active = isItemActive(item.path);

                          return (
                            <Link
                              key={item.name}
                              to={item.path || '#'}
                              className={`flex items-center rounded-lg text-xs font-medium transition-all duration-200 relative group ${
                                isCollapsed
                                  ? 'justify-center p-2'
                                  : 'gap-3 px-3 py-2'
                              } ${
                                active
                                  ? 'bg-primary text-primary-foreground font-semibold shadow-sm shadow-primary/25'
                                  : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground hover:translate-x-0.5'
                              }`}
                              title={item.name}
                            >
                              <item.icon className="h-4.5 w-4.5 shrink-0" />

                              {!isCollapsed && (
                                <span>
                                  {t(item.name)}
                                </span>
                              )}
                            </Link>
                          );
                        })}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Desktop User Profile */}
        <div className="border-t border-border/50 p-4 bg-muted/5 shrink-0">
          <div
            className={`flex items-center ${
              isCollapsed
                ? 'justify-center'
                : 'gap-3'
            }`}
          >
            <Avatar className="h-8 w-8 shrink-0 hover:ring-2 hover:ring-primary/40 transition-all duration-200 cursor-pointer">
              <AvatarFallback className="text-xs bg-primary/10 text-primary font-bold">
                {currentUser?.name
                  ?.slice(0, 2)
                  .toUpperCase() || 'GD'}
              </AvatarFallback>
            </Avatar>

            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground truncate">
                  {currentUser?.name}
                </p>

                <p className="text-[10px] text-muted-foreground font-medium truncate">
                  {currentUser?.role || 'Team Member'}
                </p>
              </div>
            )}
          </div>
        </div>
      </motion.aside>

      {/* =====================================================
          Mobile Sidebar
      ====================================================== */}
      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() =>
                onMobileOpenChange(false)
              }
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden"
            />

            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{
                type: 'spring',
                damping: 25,
                stiffness: 350,
                mass: 0.6,
              }}
              className="fixed top-0 bottom-0 left-0 w-80 bg-card/95 backdrop-blur-md border-r border-border/50 z-50 p-4 flex flex-col justify-between md:hidden shadow-2xl"
            >
              <div className="space-y-6 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <div className="flex items-center justify-between border-b border-border/50 pb-4">
                  <span className="font-bold text-md tracking-tight">
                    DVEPL ERP
                  </span>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      onMobileOpenChange(false)
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <nav className="space-y-6">
                  {/* Non-section items */}
                  <div className="space-y-1">
                    {visibleSidebarItems
                      .filter((i) => !i.section)
                      .map((item) => {
                        const active = isItemActive(item.path);
                        return (
                          <Link
                            key={item.name}
                            to={item.path || '#'}
                            onClick={() =>
                              onMobileOpenChange(false)
                            }
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                              active
                                ? 'bg-primary text-primary-foreground font-semibold shadow-sm shadow-primary/25'
                                : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground hover:translate-x-0.5'
                            }`}
                          >
                            <item.icon className="h-4.5 w-4.5" />

                            <span>{t(item.name)}</span>
                          </Link>
                        );
                      })}
                  </div>

                  {/* Sections */}
                  {sections.map((secName) => {
                    const isSectionExpanded =
                      expandedSections[secName] !== undefined
                        ? expandedSections[secName]
                        : true;

                    const hasActiveChild = visibleSidebarItems.some(
                      (i) => i.section === secName && isItemActive(i.path),
                    );

                    return (
                      <div
                        key={secName}
                        className="space-y-1.5"
                      >
                        <button
                          onClick={() =>
                            toggleSection(secName)
                          }
                          className={`w-full flex items-center justify-between text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-colors group cursor-pointer ${
                            hasActiveChild
                              ? 'text-primary font-extrabold'
                              : 'text-foreground/70 hover:text-foreground hover:bg-muted/30'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span>{t(secName)}</span>
                            {hasActiveChild && (
                              <span className="h-1.5 w-1.5 rounded-full bg-primary inline-block" />
                            )}
                          </span>

                          <ChevronDown
                            className={`h-3 w-3 transition-transform duration-200 ${
                              !isSectionExpanded
                                ? '-rotate-90'
                                : ''
                            }`}
                          />
                        </button>

                        <AnimatePresence initial={false}>
                          {isSectionExpanded && (
                            <motion.div
                              initial={{
                                height: 0,
                                opacity: 0,
                              }}
                              animate={{
                                height: 'auto',
                                opacity: 1,
                              }}
                              exit={{
                                height: 0,
                                opacity: 0,
                              }}
                              transition={{
                                duration: 0.2,
                                ease: 'easeInOut',
                              }}
                              className="space-y-1 overflow-hidden"
                            >
                              {visibleSidebarItems
                                .filter(
                                  (i) =>
                                    i.section === secName,
                                )
                                .map((item) => {
                                  const active = isItemActive(item.path);
                                  return (
                                    <Link
                                      key={item.name}
                                      to={item.path || '#'}
                                      onClick={() =>
                                        onMobileOpenChange(
                                          false,
                                        )
                                      }
                                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                                        active
                                          ? 'bg-primary text-primary-foreground font-semibold shadow-sm shadow-primary/25'
                                          : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground hover:translate-x-0.5'
                                      }`}
                                    >
                                      <item.icon className="h-4.5 w-4.5" />

                                      <span>
                                        {t(item.name)}
                                      </span>
                                    </Link>
                                  );
                                })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </nav>
              </div>

              {/* Mobile User Profile */}
              <div className="border-t border-border/50 pt-4 mt-4 flex items-center gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary font-bold">
                    {currentUser?.name
                      ?.slice(0, 2)
                      .toUpperCase() || 'GD'}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-foreground truncate">
                    {currentUser?.name}
                  </p>

                  <p className="text-[10px] text-muted-foreground font-medium truncate">
                    {currentUser?.role || 'Team Member'}
                  </p>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}