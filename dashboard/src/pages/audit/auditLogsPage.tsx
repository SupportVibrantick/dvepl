import React from 'react';
import { useERPStore } from '@/store/erpStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/helpers';
import { AuditLog } from '@/types/erp';
import {
  Search,
  RefreshCw,
  ShieldCheck,
  Activity,
  PlusCircle,
  PencilLine,
  Trash2,
  MapPin,
  Monitor,
  RotateCcw,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  XCircle,
  Clock,
  LogIn,
  LogOut,
  UserX,
  FileUp,
  FileDown,
  Send,
  History,
  MessageSquare,
} from 'lucide-react';
import { securityApi } from '@/services/modules';

const getInitials = (name: string) => {
  if (!name) return 'SYS';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return 'SYS';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const NEUTRAL_PILL = 'bg-muted text-muted-foreground border-border';
const NEUTRAL_BANNER = 'bg-muted/40 text-muted-foreground';

const ACTION_STYLES: Record<string, { label: string; pill: string; banner: string; icon: React.ElementType }> = {
  CREATE: {
    label: 'Created',
    pill: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:text-emerald-400',
    banner: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    icon: PlusCircle,
  },
  UPDATE: {
    label: 'Updated',
    pill: 'bg-blue-500/10 text-blue-700 border-blue-500/25 dark:text-blue-400',
    banner: 'bg-primary/10 text-primary',
    icon: PencilLine,
  },
  DELETE: {
    label: 'Purged',
    pill: 'bg-rose-500/10 text-rose-600 border-rose-500/25 dark:text-rose-400',
    banner: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    icon: Trash2,
  },
  RESTORE: {
    label: 'Restored',
    pill: 'bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-400',
    banner: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    icon: RotateCcw,
  },
  LOGIN: {
    label: 'Logged in',
    pill: 'bg-sky-500/10 text-sky-700 border-sky-500/25 dark:text-sky-400',
    banner: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
    icon: LogIn,
  },
  LOGIN_FAILED: {
    label: 'Failed login',
    pill: 'bg-rose-500/10 text-rose-600 border-rose-500/25 dark:text-rose-400',
    banner: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    icon: UserX,
  },
  LOGOUT: {
    label: 'Logged out',
    pill: 'bg-muted text-muted-foreground border-border',
    banner: 'bg-muted/40 text-muted-foreground',
    icon: LogOut,
  },
  UPLOAD: {
    label: 'Uploaded',
    pill: 'bg-violet-500/10 text-violet-700 border-violet-500/25 dark:text-violet-400',
    banner: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
    icon: FileUp,
  },
  BACKUP_EXPORT: {
    label: 'Backup',
    pill: 'bg-cyan-500/10 text-cyan-700 border-cyan-500/25 dark:text-cyan-400',
    banner: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
    icon: FileDown,
  },
  EXPORT: {
    label: 'Exported',
    pill: 'bg-cyan-500/10 text-cyan-700 border-cyan-500/25 dark:text-cyan-400',
    banner: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
    icon: FileDown,
  },
  DISPATCH: {
    label: 'Dispatched',
    pill: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/25 dark:text-indigo-400',
    banner: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
    icon: Send,
  },
  STATUS_CHANGE: {
    label: 'Status',
    pill: 'bg-teal-500/10 text-teal-700 border-teal-500/25 dark:text-teal-400',
    banner: 'bg-teal-500/10 text-teal-700 dark:text-teal-400',
    icon: History,
  },
  FOLLOW_UP: {
    label: 'Follow up',
    pill: 'bg-orange-500/10 text-orange-700 border-orange-500/25 dark:text-orange-400',
    banner: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
    icon: MessageSquare,
  },
};

const humanizeAction = (action: string) =>
  action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

const actionStyle = (action: string) =>
  ACTION_STYLES[action] ?? {
    label: humanizeAction(action),
    pill: NEUTRAL_PILL,
    banner: NEUTRAL_BANNER,
    icon: Activity,
  };

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

const niceDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

const browserFromUA = (ua?: string | null) => {
  if (!ua) return null;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Chrome\/([\d.]+)/.test(ua)) return `Chrome ${ua.match(/Chrome\/([\d.]+)/)?.[1]}`;
  if (/Firefox\/([\d.]+)/.test(ua)) return `Firefox ${ua.match(/Firefox\/([\d.]+)/)?.[1]}`;
  if (/Safari\//.test(ua)) return 'Safari';
  if (/OPR\//.test(ua)) return 'Opera';
  return 'Browser';
};

const ACTION_TABS = [
  { value: 'ALL', label: 'All' },
  { value: 'CREATE', label: 'Created' },
  { value: 'UPDATE', label: 'Updated' },
  { value: 'DELETE', label: 'Purged' },
  { value: 'LOGIN', label: 'Login' },
  { value: 'LOGOUT', label: 'Logout' },
  { value: 'UPLOAD', label: 'Uploads' },
  { value: 'EXPORT', label: 'Exports' },
  { value: 'DISPATCH', label: 'Dispatch' },
];

export function AuditLogsPage() {
  const store = useERPStore();
  const [search, setSearch] = React.useState('');
  const [action, setAction] = React.useState('ALL');
  const [moduleSelect, setModuleSelect] = React.useState('ALL');
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);

  const loadLogs = React.useCallback(async () => {
    setLoading(true);
    try {
      const logs = await securityApi.auditLogs.list();
      useERPStore.setState({ auditLogs: logs || [] });
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    let interval: ReturnType<typeof setInterval>;
    const poll = async () => {
      if (!active) return;
      try {
        const logs = await securityApi.auditLogs.list();
        if (active) {
          useERPStore.setState({ auditLogs: logs || [] });
          setLastUpdated(new Date());
        }
      } catch (err) {
        console.error('Failed to load audit logs:', err);
      }
    };
    poll();
    interval = setInterval(poll, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const filteredLogs = React.useMemo(() => {
    return store.auditLogs.filter((log) => {
      const q = search.toLowerCase();
      const matchesSearch =
        log.recordId.toLowerCase().includes(q) ||
        log.module.toLowerCase().includes(q) ||
        (log.ipAddress && log.ipAddress.includes(q)) ||
        (log.userId && log.userId.toLowerCase().includes(q)) ||
        (log.user?.name ?? '').toLowerCase().includes(q);
      const matchesAction = action === 'ALL' || log.action === action;
      const matchesModule = moduleSelect === 'ALL' || log.module === moduleSelect;
      return matchesSearch && matchesAction && matchesModule;
    });
  }, [store.auditLogs, search, action, moduleSelect]);

  const uniqueModules = React.useMemo(
    () => Array.from(new Set(store.auditLogs.map((log) => log.module))),
    [store.auditLogs],
  );

  const counts = React.useMemo(
    () => ({
      creates: store.auditLogs.filter((l) => l.action === 'CREATE').length,
      updates: store.auditLogs.filter((l) => l.action === 'UPDATE').length,
      deletes: store.auditLogs.filter((l) => l.action === 'DELETE').length,
    }),
    [store.auditLogs],
  );

  const selectedIndex = filteredLogs.findIndex((l) => l.id === selectedId);
  const selectedLog = selectedIndex >= 0 ? filteredLogs[selectedIndex] : null;

  React.useEffect(() => {
    if (filteredLogs.length === 0) setSelectedId(null);
    else if (!filteredLogs.some((l) => l.id === selectedId)) setSelectedId(filteredLogs[0].id);
  }, [filteredLogs, selectedId]);

  const stepSelection = (dir: 1 | -1) => {
    if (filteredLogs.length === 0) return;
    const nextIdx = (selectedIndex + dir + filteredLogs.length) % filteredLogs.length;
    setSelectedId(filteredLogs[nextIdx].id);
  };

  const hasFilters = search !== '' || action !== 'ALL' || moduleSelect !== 'ALL';
  const resetFilters = () => {
    setSearch('');
    setAction('ALL');
    setModuleSelect('ALL');
  };

  const renderDiff = (log: AuditLog) => {
    const oldVal = log.oldValue;
    const newVal = log.newValue;

    if (log.action === 'CREATE') {
      if (!newVal) return null;
      return (
        <div className="space-y-2">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Created Fields</h4>
          <div className="grid grid-cols-1 gap-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] p-3">
            {Object.entries(newVal)
              .filter(([k]) => k !== 'id' && k !== 'createdAt' && k !== 'updatedAt')
              .map(([k, v]) => (
                <div key={k} className="flex items-baseline gap-1.5">
                  <span className="shrink-0 font-mono text-[11px] font-semibold text-muted-foreground">{k}:</span>
                  <span className="min-w-0 truncate font-medium text-foreground">{String(v ?? '—')}</span>
                </div>
              ))}
          </div>
        </div>
      );
    }

    if (log.action === 'UPDATE') {
      if (!oldVal || !newVal) return null;
      const changes: { key: string; from: unknown; to: unknown }[] = [];
      for (const key in newVal) {
        if (key !== 'updatedAt' && JSON.stringify(oldVal[key]) !== JSON.stringify(newVal[key])) {
          changes.push({ key, from: oldVal[key], to: newVal[key] });
        }
      }
      if (changes.length === 0) {
        return <p className="text-[11px] italic text-muted-foreground">Internal metadata modified.</p>;
      }
      return (
        <div className="space-y-2">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Field Modifications</h4>
          <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/80 bg-card/50">
            {changes.map((ch) => (
              <div key={ch.key} className="flex flex-col gap-1 p-2.5 text-[11px] sm:flex-row sm:items-center sm:gap-2">
                <span className="w-32 shrink-0 truncate font-mono font-semibold text-foreground/80">{ch.key}</span>
                <span className="w-fit max-w-full truncate rounded bg-destructive/10 px-2 py-0.5 font-mono text-[10px] text-destructive line-through">
                  {String(ch.from ?? 'null')}
                </span>
                <span className="flex w-fit max-w-full items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-700 dark:text-emerald-400">
                  &rarr; <span className="truncate font-bold">{String(ch.to ?? 'null')}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (log.action === 'DELETE') {
      return (
        <p className="rounded-lg border border-rose-500/15 bg-rose-500/[0.04] p-3 text-[11px] font-medium text-rose-600 dark:text-rose-400">
          Record was completely purged from the system directory.
        </p>
      );
    }

    return null;
  };

  const kpiStats = [
    { label: 'Logged Operations', value: store.auditLogs.length, icon: Activity, tone: 'text-foreground' },
    { label: 'Creates', value: counts.creates, icon: PlusCircle, tone: 'text-emerald-500' },
    { label: 'Updates', value: counts.updates, icon: PencilLine, tone: 'text-primary' },
    { label: 'Purges', value: counts.deletes, icon: Trash2, tone: 'text-rose-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-primary/10 p-1.5 text-primary">
              <ShieldCheck className="size-4" />
            </span>
            <span className="text-xs font-semibold text-muted-foreground/80">Security Audit Trail</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mt-1">Audit Logs</h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            Every create, update and purge across the system — captured with the operator and their device.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="w-fit cursor-pointer" onClick={loadLogs} disabled={loading}>
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
            </span>
            Live
          </span>
          {lastUpdated && (
            <span className="hidden text-[11px] text-muted-foreground md:inline tabular-nums">
              updated {niceDateTime(lastUpdated.toISOString())}
            </span>
          )}
        </div>
      </div>

      {/* Summary strip */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border/70">
          {kpiStats.map((stat) => (
            <div key={stat.label} className="flex items-center gap-3 p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <stat.icon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className={cn('text-xl font-bold tracking-tight tabular-nums', stat.tone)}>{stat.value}</p>
                <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="relative w-full xl:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by ID, module, operator, or IP…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 border-border pl-9 pr-8 text-xs rounded-lg"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-muted/70 p-1">
            {ACTION_TABS.map((tab) => {
              const active = action === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setAction(tab.value)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer',
                    active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <select
            value={moduleSelect}
            onChange={(e) => setModuleSelect(e.target.value)}
            className="h-9 cursor-pointer rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-medium text-foreground outline-none"
            aria-label="Filter by module"
          >
            <option value="ALL">All Directories</option>
            {uniqueModules.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9 cursor-pointer px-3 text-xs text-muted-foreground">
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Master-detail */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
        {/* Table */}
        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-2.5">
            <span className="text-xs font-semibold text-muted-foreground">Entries</span>
            <span className="text-xs font-semibold text-muted-foreground tabular-nums">
              {loading ? 'Loading…' : `${filteredLogs.length} shown`}
            </span>
          </div>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5">Time</th>
                  <th className="px-3 py-2.5">Event</th>
                  <th className="px-3 py-2.5">Module</th>
                  <th className="px-3 py-2.5">Operator</th>
                  <th className="px-4 py-2.5">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <div className="py-14 text-center">
                        <Activity className="mx-auto size-5 text-muted-foreground/40" />
                        <p className="mt-2 text-xs font-semibold text-muted-foreground">
                          {store.auditLogs.length === 0 ? 'No audit entries recorded yet' : 'No entries matched your filters'}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
                {filteredLogs.map((log) => {
                  const style = actionStyle(log.action);
                  const selected = log.id === selectedId;
                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedId(log.id)}
                      className={cn('cursor-pointer transition-colors', selected ? 'bg-primary/[0.07] hover:bg-primary/[0.09]' : 'hover:bg-muted/40')}
                    >
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                          <Clock className="size-3" />
                          {timeAgo(log.createdAt)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          {log.status === 'FAILED' ? (
                            <span title="Failed" className="flex size-4 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-rose-500">
                              <XCircle className="size-3" />
                            </span>
                          ) : null}
                          <span className={cn('rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide leading-none', style.pill)}>
                            {style.label}
                          </span>
                          <span className="max-w-[180px] truncate text-[11px] text-foreground">{log.details || `${style.label} ${log.module}`}</span>
                        </div>
                      </td>
                      <td className="max-w-[130px] truncate px-3 py-2.5 text-xs font-semibold text-foreground">{log.module}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span className="flex items-center gap-1.5">
                          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[8px] font-bold text-primary">
                            {getInitials(log.user?.name || log.userId || 'System')}
                          </span>
                          <span className="max-w-[110px] truncate text-xs text-foreground">{log.user?.name || log.userId || 'System'}</span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{log.ipAddress || '127.0.0.1'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Inspector */}
        <div className="lg:sticky lg:top-4 min-w-0 flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-2.5">
            <span className="text-xs font-semibold text-muted-foreground">Details</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => stepSelection(-1)}
                disabled={filteredLogs.length === 0}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                title="Previous entry"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="min-w-12 text-center text-[10px] font-semibold text-muted-foreground tabular-nums">
                {selectedIndex + 1}/{filteredLogs.length}
              </span>
              <button
                type="button"
                onClick={() => stepSelection(1)}
                disabled={filteredLogs.length === 0}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                title="Next entry"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>

          {selectedLog ? (
            <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
              {(() => {
                const style = actionStyle(selectedLog.action);
                const ActionIcon = style.icon;
                const browser = browserFromUA(selectedLog.userAgent);
                return (
                  <>
                    <div className={cn('flex items-center gap-2 rounded-lg px-3 py-2.5', style.banner)}>
                      <ActionIcon className="size-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold">
                          {selectedLog.details || `${style.label} — ${selectedLog.module}`}
                        </p>
                        <p className="truncate font-mono text-[10px] opacity-80">#{selectedLog.recordId}</p>
                      </div>
                      {selectedLog.status === 'FAILED' ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-500">
                          <XCircle className="size-3" /> Failed
                        </span>
                      ) : null}
                    </div>

                    <div className="space-y-2 text-[11px] text-muted-foreground">
                      <div className="flex items-center justify-between border-b border-border/50 pb-2">
                        <span>When</span>
                        <span className="font-semibold text-foreground">{niceDateTime(selectedLog.createdAt)}</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-border/50 pb-2">
                        <span>Operator</span>
                        <span className="font-semibold text-foreground">{selectedLog.user?.name || selectedLog.userId || 'System'}</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-border/50 pb-2">
                        <span>Module</span>
                        <span className="font-semibold text-foreground">{selectedLog.module}</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-border/50 pb-2">
                        <span>Status</span>
                        <span className={cn('font-semibold', selectedLog.status === 'FAILED' ? 'text-rose-500' : 'text-emerald-600')}>
                          {selectedLog.status === 'FAILED' ? 'Failed' : 'Success'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-b border-border/50 pb-2">
                        <span>IP address</span>
                        <span className="flex items-center gap-1 font-mono font-semibold text-foreground">
                          <MapPin className="size-3" /> {selectedLog.ipAddress || '127.0.0.1'}
                        </span>
                      </div>
                      {browser && (
                        <div className="flex items-center justify-between border-b border-border/50 pb-2">
                          <span>Browser</span>
                          <span className="flex items-center gap-1 font-semibold text-foreground">
                            <Monitor className="size-3" /> {browser}
                          </span>
                        </div>
                      )}
                    </div>

                    {renderDiff(selectedLog)}

                    {selectedLog.userAgent && (
                      <p className="break-all text-[10px] leading-relaxed text-muted-foreground/70">UA: {selectedLog.userAgent}</p>
                    )}

                    <details className="group/raw overflow-hidden rounded-lg border border-border/40 bg-card text-xs">
                      <summary className="flex cursor-pointer select-none items-center justify-between px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground outline-none transition-colors hover:bg-muted/30">
                        Full state dump
                        <ChevronDown className="size-3.5 transition-transform group-open/raw:rotate-180" />
                      </summary>
                      <pre className="max-h-64 overflow-auto border-t border-border/40 bg-muted/20 p-3 font-mono text-[9px] leading-relaxed text-foreground">
                        {JSON.stringify(selectedLog.newValue ?? {}, null, 2)}
                      </pre>
                    </details>
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="py-16 text-center">
              <Activity className="mx-auto size-6 text-muted-foreground/40" />
              <p className="mt-2 text-xs font-semibold text-muted-foreground">No entry selected</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AuditLogsPage;