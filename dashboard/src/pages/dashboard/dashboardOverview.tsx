import React, { useEffect, useMemo, useState } from "react";
import {
  Users,
  Handshake,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowRight,
  BriefcaseBusiness,
  IndianRupee,
  Plus,
  Activity,
  RefreshCw,
  CircleCheck,
  Clock3,
  CircleAlert,
  Building2,
  CalendarDays,
  MoreHorizontal,
  UserRound,
  FileText,
} from "lucide-react";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Cell,
  Pie,
  LineChart,
  Line,
} from "recharts";

import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { useERPStore } from "@/store/erpStore";

import {
  hrmsApi,
  crmApi,
  tenderApi,
} from "@/services/modules";

import { organizationApi } from "@/services/organization";
import { isAdminUser } from "@/utils/pagePermissions";

// ============================================================
// TYPES
// ============================================================

type DashboardTender = {
  id?: string | number;
  title?: string;
  status?: string;
  estimatedCost?: number | string;
  dueDate?: string;
  createdAt?: string;
  deletedAt?: string | null;
};

type DashboardEmployee = {
  id?: string | number;
  firstName?: string;
  lastName?: string;
  employeeCode?: string;
  status?: string;
  dateOfJoining?: string;
  deletedAt?: string | null;
};

type DashboardCustomer = {
  id?: string | number;
  name?: string;
  createdAt?: string;
  deletedAt?: string | null;
};

type DashboardAttendance = {
  id?: string | number;
  date?: string;
  status?: string;
};

type DashboardCostCenter = {
  id?: string | number;
  name?: string;
  budget?: number | string;
};

// ============================================================
// CONSTANTS
// ============================================================

const CHART_COLORS = {
  primary: "#2563eb",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  violet: "#8b5cf6",
  muted: "#94a3b8",
};

const STATUS_STYLES: Record<
  string,
  {
    badge: string;
    dot: string;
  }
> = {
  OPEN: {
    badge:
      "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    dot: "bg-blue-500",
  },

  IN_PROGRESS: {
    badge:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    dot: "bg-amber-500",
  },

  COMPLETED: {
    badge:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    dot: "bg-emerald-500",
  },

  SUBMITTED: {
    badge:
      "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
    dot: "bg-violet-500",
  },

  DRAFT: {
    badge:
      "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
    dot: "bg-slate-400",
  },
};

// ============================================================
// HELPERS
// ============================================================

function formatCurrencyLakhs(value: number) {
  if (!value || value <= 0) {
    return "₹0";
  }

  return `₹${(value / 100000).toFixed(1)}L`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

function formatDate(value?: string) {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "N/A";
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getInitials(
  firstName?: string,
  lastName?: string,
) {
  const first = firstName?.trim()?.[0] ?? "";
  const last = lastName?.trim()?.[0] ?? "";

  return `${first}${last}`.toUpperCase() || "U";
}

// ============================================================
// SMALL UI COMPONENTS
// ============================================================

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h2>

        {description && (
          <p className="mt-1 text-xs text-muted-foreground">
            {description}
          </p>
        )}
      </div>

      {action}
    </div>
  );
}

function KpiCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  trendPositive = true,
  iconClassName = "",
}: {
  title: string;
  value: string | number;
  description: string;
  icon: React.ElementType;
  trend?: string;
  trendPositive?: boolean;
  iconClassName?: string;
}) {
  return (
    <div
      className="
        group
        relative
        overflow-hidden
        rounded-2xl
        border
        border-border/70
        bg-card
        p-5
        transition-all
        duration-200
        hover:-translate-y-0.5
        hover:border-border
        hover:shadow-md
      "
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            {title}
          </p>

          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-2xl font-bold tracking-tight">
              {value}
            </p>

            {trend && (
              <span
                className={`
                  inline-flex
                  items-center
                  gap-0.5
                  rounded-full
                  px-1.5
                  py-0.5
                  text-[10px]
                  font-semibold
                  ${
                    trendPositive
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  }
                `}
              >
                {trendPositive ? (
                  <TrendingUp className="size-3" />
                ) : (
                  <TrendingDown className="size-3" />
                )}

                {trend}
              </span>
            )}
          </div>

          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {description}
          </p>
        </div>

        <div
          className={`
            flex
            size-10
            shrink-0
            items-center
            justify-center
            rounded-xl
            bg-muted/70
            transition-transform
            duration-200
            group-hover:scale-105
            ${iconClassName}
          `}
        >
          <Icon className="size-[18px]" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  message,
}: {
  icon: React.ElementType;
  message: string;
}) {
  return (
    <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 text-center">
      <div className="flex size-10 items-center justify-center rounded-xl bg-muted/60">
        <Icon className="size-5 text-muted-foreground/60" />
      </div>

      <p className="text-xs font-medium text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

// ============================================================
// DASHBOARD
// ============================================================

export function DashboardOverview() {
  const [employees, setEmployees] = useState<
    DashboardEmployee[]
  >([]);

  const [attendances, setAttendances] = useState<
    DashboardAttendance[]
  >([]);

  const [tenders, setTenders] = useState<
    DashboardTender[]
  >([]);

  const [customers, setCustomers] = useState<
    DashboardCustomer[]
  >([]);

  const [costCenters, setCostCenters] = useState<
    DashboardCostCenter[]
  >([]);

  const [isLoading, setIsLoading] = useState(true);

  const [lastUpdated, setLastUpdated] = useState<Date | null>(
    null,
  );

  const currentUserId = useERPStore((s) => s.currentUserId);
  const storeUsers = useERPStore((s) => s.users);
  const readyUser = useMemo(
    () => storeUsers.find((u) => u.id === currentUserId) || null,
    [storeUsers, currentUserId],
  );

  // ============================================================
  // LOAD DASHBOARD DATA
  // ============================================================

  const loadDashboard = async () => {
    setIsLoading(true);

    try {
      const currentUserObj = useERPStore
        .getState()
        .users.find(
          (u) =>
            u.id ===
            useERPStore.getState().currentUserId,
        ) as any;

      const pageAccess =
        currentUserObj?.pageAccess || [];

      const isAdmin = isAdminUser(currentUserObj);

      const hasAccess = (page: string) =>
        isAdmin || pageAccess.includes(page);

      const fetchEmployees = hasAccess("employees")
        ? hrmsApi.employees
            .list()
            .catch(() => [])
        : Promise.resolve([]);

      const fetchAttendance = hasAccess("attendance")
        ? hrmsApi.attendance
            .list()
            .catch(() => [])
        : Promise.resolve([]);

      const fetchCustomers = hasAccess("customers")
        ? crmApi.customers
            .list()
            .catch(() => [])
        : Promise.resolve([]);

      const fetchTenders = hasAccess("tenders")
        ? tenderApi.tenders
            .list()
            .catch(() => [])
        : Promise.resolve([]);

      const fetchCostCenters = hasAccess(
        "cost_centers",
      )
        ? organizationApi.costCenters
            .list()
            .catch(() => [])
        : Promise.resolve([]);

      const [
        employeeData,
        attendanceData,
        customerData,
        tenderData,
        costCenterData,
      ] = await Promise.all([
        fetchEmployees,
        fetchAttendance,
        fetchCustomers,
        fetchTenders,
        fetchCostCenters,
      ]);

      setEmployees(
        (employeeData || []) as DashboardEmployee[],
      );

      setAttendances(
        (attendanceData ||
          []) as DashboardAttendance[],
      );

      setCustomers(
        (customerData ||
          []) as DashboardCustomer[],
      );

      setTenders(
        (tenderData || []) as DashboardTender[],
      );

      setCostCenters(
        (costCenterData ||
          []) as DashboardCostCenter[],
      );

      setLastUpdated(new Date());
    } catch {
      toast.error(
        "Unable to load live dashboard data.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!readyUser) return;
    void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyUser]);

  // ============================================================
  // CLEAN DATA
  // ============================================================

  const rawEmployees = useMemo(
    () =>
      (employees || []).filter(
        (employee) =>
          employee &&
          !employee.deletedAt,
      ),
    [employees],
  );

  const rawTenders = useMemo(
    () =>
      (tenders || []).filter(
        (tender) =>
          tender &&
          !tender.deletedAt,
      ),
    [tenders],
  );

  const rawCustomers = useMemo(
    () =>
      (customers || []).filter(
        (customer) =>
          customer &&
          !customer.deletedAt,
      ),
    [customers],
  );

  // ============================================================
  // KPI DATA
  // ============================================================

  const activeEmployees = useMemo(
    () =>
      rawEmployees.filter(
        (employee) =>
          employee.status === "ACTIVE",
      ).length,
    [rawEmployees],
  );

  const activeTenders = useMemo(
    () =>
      rawTenders.filter(
        (tender) =>
          tender.status === "OPEN" ||
          tender.status === "IN_PROGRESS",
      ).length,
    [rawTenders],
  );

  // ============================================================
  // MONTHLY REVENUE
  // ============================================================

  const {
    currentMonthRevenue,
    momGrowth,
    hasGrowth,
  } = useMemo(() => {
    const now = new Date();

    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let currentSum = 0;
    let previousSum = 0;

    rawTenders.forEach((tender) => {
      const dateString =
        tender.dueDate ||
        tender.createdAt;

      if (!dateString) {
        return;
      }

      const date = new Date(dateString);

      const cost = Number(
        tender.estimatedCost || 0,
      );

      if (
        date.getFullYear() === currentYear &&
        date.getMonth() === currentMonth
      ) {
        currentSum += cost;
      } else if (
        (currentMonth === 0 &&
          date.getFullYear() ===
            currentYear - 1 &&
          date.getMonth() === 11) ||
        (currentMonth > 0 &&
          date.getFullYear() ===
            currentYear &&
          date.getMonth() ===
            currentMonth - 1)
      ) {
        previousSum += cost;
      }
    });

    let growth = "0%";
    let positive = true;

    if (previousSum > 0) {
      const percentage =
        ((currentSum - previousSum) /
          previousSum) *
        100;

      growth = `${
        percentage >= 0 ? "+" : ""
      }${percentage.toFixed(1)}%`;

      positive = percentage >= 0;
    } else if (currentSum > 0) {
      growth = "+100%";
      positive = true;
    }

    return {
      currentMonthRevenue: currentSum,
      momGrowth: growth,
      hasGrowth: positive,
    };
  }, [rawTenders]);

  // ============================================================
  // CUSTOMER GROWTH
  // ============================================================

  const {
    customerGrowthPct,
    hasCustomerGrowth,
  } = useMemo(() => {
    const now = new Date();

    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let currentCount = 0;
    let previousCount = 0;

    rawCustomers.forEach((customer) => {
      if (!customer.createdAt) {
        return;
      }

      const date = new Date(
        customer.createdAt,
      );

      if (
        date.getFullYear() === currentYear &&
        date.getMonth() === currentMonth
      ) {
        currentCount++;
      } else if (
        (currentMonth === 0 &&
          date.getFullYear() ===
            currentYear - 1 &&
          date.getMonth() === 11) ||
        (currentMonth > 0 &&
          date.getFullYear() ===
            currentYear &&
          date.getMonth() ===
            currentMonth - 1)
      ) {
        previousCount++;
      }
    });

    if (previousCount > 0) {
      const percentage =
        ((currentCount - previousCount) /
          previousCount) *
        100;

      return {
        customerGrowthPct: `${
          percentage >= 0 ? "+" : ""
        }${percentage.toFixed(1)}%`,
        hasCustomerGrowth:
          percentage >= 0,
      };
    }

    if (currentCount > 0) {
      return {
        customerGrowthPct: `+${currentCount}`,
        hasCustomerGrowth: true,
      };
    }

    return {
      customerGrowthPct: undefined,
      hasCustomerGrowth: true,
    };
  }, [rawCustomers]);

  // ============================================================
  // CUSTOMER CHART
  // ============================================================

  const customerGrowthData = useMemo(() => {
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const counts = new Map<
      string,
      number
    >();

    rawCustomers.forEach((customer) => {
      if (!customer.createdAt) {
        return;
      }

      const month = new Date(
        customer.createdAt,
      ).toLocaleString("en-US", {
        month: "short",
      });

      counts.set(
        month,
        (counts.get(month) ?? 0) + 1,
      );
    });

    let cumulative = 0;

    return months
      .filter((month) =>
        counts.has(month),
      )
      .map((month) => {
        const newCustomers =
          counts.get(month) ?? 0;

        cumulative += newCustomers;

        return {
          month,
          New: newCustomers,
          Total: cumulative,
        };
      });
  }, [rawCustomers]);

  // ============================================================
  // TENDER DISTRIBUTION
  // ============================================================

  const tenderPieData = useMemo(
    () =>
      [
        {
          name: "Open",
          value: rawTenders.filter(
            (tender) =>
              tender.status === "OPEN",
          ).length,
          color: CHART_COLORS.primary,
        },
        {
          name: "In Progress",
          value: rawTenders.filter(
            (tender) =>
              tender.status ===
              "IN_PROGRESS",
          ).length,
          color: CHART_COLORS.warning,
        },
        {
          name: "Completed",
          value: rawTenders.filter(
            (tender) =>
              tender.status ===
              "COMPLETED",
          ).length,
          color: CHART_COLORS.success,
        },
        {
          name: "Draft",
          value: rawTenders.filter(
            (tender) =>
              tender.status === "DRAFT",
          ).length,
          color: CHART_COLORS.muted,
        },
      ].filter(
        (item) => item.value > 0,
      ),
    [rawTenders],
  );

  // ============================================================
  // ATTENDANCE TREND
  // ============================================================

  const attendanceTrendData =
    useMemo(() => {
      return Array.from(
        { length: 7 },
        (_, index) => {
          const date = new Date();

          date.setDate(
            date.getDate() -
              (6 - index),
          );

          const key = date
            .toISOString()
            .slice(0, 10);

          const dailyRecords =
            (attendances || []).filter(
              (attendance) =>
                attendance &&
                String(
                  attendance.date,
                ).slice(0, 10) === key,
            );

          return {
            name: date.toLocaleDateString(
              "en-US",
              {
                weekday: "short",
              },
            ),

            Present:
              dailyRecords.filter(
                (attendance) =>
                  attendance.status ===
                  "PRESENT",
              ).length,

            Absent:
              dailyRecords.filter(
                (attendance) =>
                  attendance.status ===
                  "ABSENT",
              ).length,
          };
        },
      );
    }, [attendances]);

  // ============================================================
  // COST CENTER DATA
  // ============================================================

  const departmentBudgetData =
    useMemo(
      () =>
        (costCenters || []).map(
          (costCenter) => ({
            name: costCenter?.name
              ? costCenter.name
                  .replace(
                    " Cost Center",
                    "",
                  )
                  .replace(
                    " Overhead",
                    "",
                  )
                  .slice(0, 15)
              : "N/A",

            Budget:
              Number(
                costCenter?.budget || 0,
              ) / 100000,
          }),
        ),
      [costCenters],
    );

  // ============================================================
  // SUMMARY
  // ============================================================

  const acceptedTenders = rawTenders.filter(
    (tender) =>
      tender.status === "COMPLETED" ||
      tender.status === "SUBMITTED",
  ).length;

  const pendingTenders = rawTenders.filter(
    (tender) =>
      tender.status === "OPEN" ||
      tender.status ===
        "IN_PROGRESS",
  ).length;

  // ============================================================
  // QUICK CREATE
  // ============================================================

  const handleQuickCreate = (
    type: string,
  ) => {
    toast.success(
      `Quick Create triggered for: ${type}`,
    );
  };

  // ============================================================
  // DATE
  // ============================================================

  const today = new Date().toLocaleDateString(
    "en-IN",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    },
  );

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="min-h-full space-y-6 pb-8">

      {/* ======================================================
          HEADER
          ====================================================== */}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">

        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Workspace</span>

            <span className="text-border">
              /
            </span>

            <span>Dashboard</span>
          </div>

          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            Good to see you.
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            Here's what's happening across
            your ERP today.
          </p>
        </div>

        <div className="flex items-center gap-2">

          <div className="hidden items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2 text-xs text-muted-foreground sm:flex">
            <CalendarDays className="size-3.5" />

            <span>{today}</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void loadDashboard()
            }
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw
              className={`size-3.5 ${
                isLoading
                  ? "animate-spin"
                  : ""
              }`}
            />

            Refresh
          </Button>
        </div>
      </div>

      {/* ======================================================
          KPI STRIP
          ====================================================== */}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">

        <KpiCard
          title="Total staff"
          value={formatNumber(
            rawEmployees.length,
          )}
          description={`${formatNumber(
            activeEmployees,
          )} currently active`}
          icon={Users}
          trend={`+${activeEmployees}`}
          iconClassName="text-blue-600 dark:text-blue-400"
        />

        <KpiCard
          title="Active tenders"
          value={formatNumber(
            activeTenders,
          )}
          description={`${formatNumber(
            rawTenders.length,
          )} total bidding records`}
          icon={BriefcaseBusiness}
          trend={`${pendingTenders} pipeline`}
          iconClassName="text-amber-600 dark:text-amber-400"
        />

        <KpiCard
          title="Customers"
          value={formatNumber(
            rawCustomers.length,
          )}
          description="Corporate accounts in CRM"
          icon={Handshake}
          trend={customerGrowthPct}
          trendPositive={hasCustomerGrowth}
          iconClassName="text-violet-600 dark:text-violet-400"
        />

        <KpiCard
          title="Monthly value"
          value={formatCurrencyLakhs(
            currentMonthRevenue,
          )}
          description="Estimated tender value this month"
          icon={IndianRupee}
          trend={
            currentMonthRevenue > 0
              ? momGrowth
              : undefined
          }
          trendPositive={hasGrowth}
          iconClassName="text-emerald-600 dark:text-emerald-400"
        />
      </div>

      {/* ======================================================
          MAIN ANALYTICS
          ====================================================== */}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">

        {/* Customer Growth */}
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm xl:col-span-2">

          <SectionHeader
            title="Customer growth"
            description="Customer acquisition and cumulative growth"
            action={
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className="size-2 rounded-full bg-emerald-500" />
                Total
                <span className="ml-2 size-2 rounded-full bg-blue-500" />
                New
              </div>
            }
          />

          <div className="h-[280px]">

            {customerGrowthData.length ===
            0 ? (
              <EmptyState
                icon={Handshake}
                message={
                  isLoading
                    ? "Loading customer data..."
                    : "No customer data available yet."
                }
              />
            ) : (
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <AreaChart
                  data={
                    customerGrowthData
                  }
                  margin={{
                    top: 10,
                    right: 5,
                    left: -25,
                    bottom: 0,
                  }}
                >
                  <defs>
                    <linearGradient
                      id="dashboardCustomerTotal"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor={
                          CHART_COLORS.success
                        }
                        stopOpacity={0.18}
                      />

                      <stop
                        offset="95%"
                        stopColor={
                          CHART_COLORS.success
                        }
                        stopOpacity={0}
                      />
                    </linearGradient>

                    <linearGradient
                      id="dashboardCustomerNew"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor={
                          CHART_COLORS.primary
                        }
                        stopOpacity={0.12}
                      />

                      <stop
                        offset="95%"
                        stopColor={
                          CHART_COLORS.primary
                        }
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    strokeDasharray="3 5"
                    vertical={false}
                    stroke="hsl(var(--border))"
                    opacity={0.65}
                  />

                  <XAxis
                    dataKey="month"
                    tick={{
                      fontSize: 10,
                    }}
                    axisLine={false}
                    tickLine={false}
                    stroke="hsl(var(--muted-foreground))"
                  />

                  <YAxis
                    tick={{
                      fontSize: 10,
                    }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    stroke="hsl(var(--muted-foreground))"
                  />

                  <Tooltip
                    cursor={{
                      stroke:
                        "hsl(var(--border))",
                    }}
                    contentStyle={{
                      fontSize: 11,
                      backgroundColor:
                        "hsl(var(--popover))",
                      borderColor:
                        "hsl(var(--border))",
                      borderRadius: 10,
                      boxShadow:
                        "0 8px 30px rgba(0,0,0,.08)",
                    }}
                    formatter={(
                      value,
                      name,
                    ) => [
                      value ?? 0,
                      name === "Total"
                        ? "Cumulative"
                        : "New customers",
                    ]}
                  />

                  <Area
                    type="monotone"
                    dataKey="Total"
                    stroke={
                      CHART_COLORS.success
                    }
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#dashboardCustomerTotal)"
                  />

                  <Area
                    type="monotone"
                    dataKey="New"
                    stroke={
                      CHART_COLORS.primary
                    }
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#dashboardCustomerNew)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Tender Pipeline */}
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">

          <SectionHeader
            title="Tender pipeline"
            description="Current distribution by status"
          />

          <div className="relative h-[215px]">

            {tenderPieData.length ===
            0 ? (
              <EmptyState
                icon={BriefcaseBusiness}
                message="No tender data available"
              />
            ) : (
              <>
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <PieChart>
                    <Pie
                      data={
                        tenderPieData
                      }
                      cx="50%"
                      cy="50%"
                      innerRadius={62}
                      outerRadius={83}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {tenderPieData.map(
                        (
                          entry,
                          index,
                        ) => (
                          <Cell
                            key={`tender-cell-${index}`}
                            fill={
                              entry.color
                            }
                          />
                        ),
                      )}
                    </Pie>

                    <Tooltip
                      contentStyle={{
                        fontSize: 11,
                        backgroundColor:
                          "hsl(var(--popover))",
                        borderColor:
                          "hsl(var(--border))",
                        borderRadius: 10,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-2xl font-bold tracking-tight">
                      {rawTenders.length}
                    </p>

                    <p className="text-[10px] text-muted-foreground">
                      Total tenders
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border/60 pt-4">
            {tenderPieData.map(
              (entry) => (
                <div
                  key={entry.name}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          entry.color,
                      }}
                    />

                    <span className="truncate text-muted-foreground">
                      {entry.name}
                    </span>
                  </div>

                  <span className="font-semibold">
                    {entry.value}
                  </span>
                </div>
              ),
            )}
          </div>
        </div>
      </div>

      {/* ======================================================
          OPERATIONAL OVERVIEW
          ====================================================== */}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Attendance */}
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">

          <SectionHeader
            title="Attendance overview"
            description="Present and absent records over the last 7 days"
            action={
              <div className="flex items-center gap-3 text-[10px] font-medium text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  Present
                </span>

                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-rose-500" />
                  Absent
                </span>
              </div>
            }
          />

          <div className="h-[220px]">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <LineChart
                data={
                  attendanceTrendData
                }
                margin={{
                  top: 10,
                  right: 5,
                  left: -25,
                  bottom: 0,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 5"
                  vertical={false}
                  stroke="hsl(var(--border))"
                  opacity={0.65}
                />

                <XAxis
                  dataKey="name"
                  tick={{
                    fontSize: 10,
                  }}
                  axisLine={false}
                  tickLine={false}
                  stroke="hsl(var(--muted-foreground))"
                />

                <YAxis
                  tick={{
                    fontSize: 10,
                  }}
                  axisLine={false}
                  tickLine={false}
                  stroke="hsl(var(--muted-foreground))"
                />

                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    backgroundColor:
                      "hsl(var(--popover))",
                    borderColor:
                      "hsl(var(--border))",
                    borderRadius: 10,
                  }}
                />

                <Line
                  type="monotone"
                  dataKey="Present"
                  stroke={
                    CHART_COLORS.success
                  }
                  strokeWidth={2.5}
                  dot={{
                    r: 3,
                  }}
                  activeDot={{
                    r: 5,
                  }}
                />

                <Line
                  type="monotone"
                  dataKey="Absent"
                  stroke={
                    CHART_COLORS.danger
                  }
                  strokeWidth={2}
                  dot={{
                    r: 3,
                  }}
                  activeDot={{
                    r: 5,
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cost Centers */}
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">

          <SectionHeader
            title="Cost center budgets"
            description="Budget allocation across organizational cost centers"
          />

          <div className="h-[220px]">
            {departmentBudgetData.length ===
            0 ? (
              <EmptyState
                icon={Building2}
                message="No cost center data available"
              />
            ) : (
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <BarChart
                  data={
                    departmentBudgetData
                  }
                  margin={{
                    top: 10,
                    right: 5,
                    left: -15,
                    bottom: 0,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="3 5"
                    vertical={false}
                    stroke="hsl(var(--border))"
                    opacity={0.65}
                  />

                  <XAxis
                    dataKey="name"
                    tick={{
                      fontSize: 9,
                    }}
                    axisLine={false}
                    tickLine={false}
                    stroke="hsl(var(--muted-foreground))"
                  />

                  <YAxis
                    tick={{
                      fontSize: 10,
                    }}
                    axisLine={false}
                    tickLine={false}
                    stroke="hsl(var(--muted-foreground))"
                  />

                  <Tooltip
                    contentStyle={{
                      fontSize: 11,
                      backgroundColor:
                        "hsl(var(--popover))",
                      borderColor:
                        "hsl(var(--border))",
                      borderRadius: 10,
                    }}
                    formatter={(value) => [
                      `₹${Number(
                        value ?? 0,
                      ).toFixed(1)}L`,
                      "Budget",
                    ]}
                  />

                  <Bar
                    dataKey="Budget"
                    fill={
                      CHART_COLORS.primary
                    }
                    radius={[
                      5,
                      5,
                      0,
                      0,
                    ]}
                    maxBarSize={42}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ======================================================
          LOWER DASHBOARD
          ====================================================== */}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">

        

        {/* Recent Tenders */}
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">

          <SectionHeader
            title="Recent tenders"
            description="Latest records in your bidding pipeline"
            action={
              <Button
                variant="ghost"
                size="icon"
                className="size-7 rounded-lg"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            }
          />

          <div className="space-y-1">

            {rawTenders.length === 0 ? (
              <EmptyState
                icon={FileText}
                message="No tenders available"
              />
            ) : (
              rawTenders
                .slice(0, 5)
                .map((tender) => {
                  const status =
                    tender.status ||
                    "UNKNOWN";

                  const statusStyle =
                    STATUS_STYLES[
                      status
                    ] ||
                    {
                      badge:
                        "bg-muted text-muted-foreground border-border",
                      dot: "bg-muted-foreground",
                    };

                  return (
                    <div
                      key={String(
                        tender.id ??
                          Math.random(),
                      )}
                      className="
                        group
                        flex
                        items-center
                        gap-3
                        rounded-xl
                        px-2
                        py-3
                        transition-colors
                        hover:bg-muted/50
                      "
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground">
                        <FileText className="size-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-foreground">
                          {tender.title ||
                            "Untitled tender"}
                        </p>

                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {formatCurrencyLakhs(
                            Number(
                              tender.estimatedCost ||
                                0,
                            ),
                          )}

                          {tender.dueDate && (
                            <>
                              <span className="mx-1">
                                ·
                              </span>

                              Due{" "}
                              {formatDate(
                                tender.dueDate,
                              )}
                            </>
                          )}
                        </p>
                      </div>

                      <span
                        className={`
                          inline-flex
                          shrink-0
                          items-center
                          gap-1.5
                          rounded-full
                          border
                          px-2
                          py-1
                          text-[9px]
                          font-semibold
                          uppercase
                          tracking-wide
                          ${statusStyle.badge}
                        `}
                      >
                        <span
                          className={`size-1.5 rounded-full ${statusStyle.dot}`}
                        />

                        {status.replace(
                          "_",
                          " ",
                        )}
                      </span>
                    </div>
                  );
                })
            )}
          </div>
        </div>

        {/* Recently Joined Staff */}
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">

          <SectionHeader
            title="Recently joined"
            description="Latest additions to your team"
            action={
              <Activity className="size-4 text-muted-foreground" />
            }
          />

          <div className="space-y-1">

            {rawEmployees.length === 0 ? (
              <EmptyState
                icon={UserRound}
                message="No employees available"
              />
            ) : (
              [...rawEmployees]
                .sort((a, b) => {
                  const aDate =
                    a.dateOfJoining
                      ? new Date(
                          a.dateOfJoining,
                        ).getTime()
                      : 0;

                  const bDate =
                    b.dateOfJoining
                      ? new Date(
                          b.dateOfJoining,
                        ).getTime()
                      : 0;

                  return bDate - aDate;
                })
                .slice(0, 5)
                .map((employee) => (
                  <div
                    key={String(
                      employee.id ??
                        Math.random(),
                    )}
                    className="
                      flex
                      items-center
                      gap-3
                      rounded-xl
                      px-2
                      py-3
                      transition-colors
                      hover:bg-muted/50
                    "
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                      {getInitials(
                        employee.firstName,
                        employee.lastName,
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">
                        {employee.firstName ||
                          ""}{" "}
                        {employee.lastName ||
                          ""}
                      </p>

                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {employee.employeeCode ||
                          "No employee code"}

                        <span className="mx-1">
                          ·
                        </span>

                        Joined{" "}
                        {formatDate(
                          employee.dateOfJoining,
                        )}
                      </p>
                    </div>

                    <span
                      className={`
                        shrink-0
                        rounded-full
                        border
                        px-2
                        py-1
                        text-[9px]
                        font-semibold
                        uppercase
                        ${
                          employee.status ===
                          "ACTIVE"
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "border-border bg-muted text-muted-foreground"
                        }
                      `}
                    >
                      {employee.status ||
                        "N/A"}
                    </span>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>

      {/* ======================================================
          SYSTEM STATUS / FOOTER
          ====================================================== */}

      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">

        <div className="flex items-center gap-2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-50" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>

          <span className="text-xs font-medium text-muted-foreground">
            ERP services operational
          </span>
        </div>

        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">

          <span className="flex items-center gap-1.5">
            <CircleCheck className="size-3.5 text-emerald-500" />
            API connected
          </span>

          <span className="flex items-center gap-1.5">
            <Clock3 className="size-3.5" />

            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString(
                  "en-IN",
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                )}`
              : "Not updated"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default DashboardOverview;
