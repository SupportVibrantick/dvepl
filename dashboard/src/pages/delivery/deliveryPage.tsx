import React, { useState, useEffect, useMemo } from 'react';
import {
  Truck,
  ClipboardList,
  Cog,
  PackageCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  Calendar,
  Layers,
  Upload,
  ChevronLeft,
  ChevronRight,
  Edit,
  Eye,
  X,
  Save,
  Filter,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useERPStore } from '@/store/erpStore';
import { apiClient } from '@/services/axios';
import { canPerformPageAction } from '@/utils/pagePermissions';
import { DeliveryOrder, DeliveryStatus } from '@/types/erp';

export type { DeliveryOrder };

// Clean API service interface structure for easy backend integration later
export const deliveryApiService = {
  list: async (params?: { search?: string; status?: string; month?: string; user?: string }): Promise<DeliveryOrder[]> => {
    // TODO: Connect real API endpoint later (e.g., return (await apiClient.get('/logistics/deliveries', { params })).data;)
    return [];
  },
  getById: async (id: string): Promise<DeliveryOrder | null> => {
    // TODO: Connect real API endpoint later (e.g., return (await apiClient.get(`/logistics/deliveries/${id}`)).data;)
    return null;
  },
  update: async (id: string, payload: Partial<DeliveryOrder>): Promise<DeliveryOrder> => {
    // TODO: Connect real API endpoint later (e.g., return (await apiClient.put(`/logistics/deliveries/${id}`, payload)).data;)
    return { id, ...payload } as DeliveryOrder;
  },
};

export function DeliveryPage() {
  const store = useERPStore();
  const currentUser = store.users?.find((u: any) => u.id === store.currentUserId) as any;
  const canEdit = canPerformPageAction(currentUser?.actionPermissions, "delivery", "edit");
  const setDeliveryOrdersInStore = useERPStore((s) => s.setDeliveryOrders);
  const updateDeliveryOrderInStore = useERPStore((s) => s.updateDeliveryOrder);
  const [activeView, setActiveView] = useState<'table' | 'calendar' | 'timeline'>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(() => {
    if (typeof window === "undefined") return 10;
    try {
      const saved = window.localStorage.getItem("dvepl-page-size:delivery");
      return saved ? parseInt(saved, 10) : 10;
    } catch {
      return 10;
    }
  });
  const [customPageSize, setCustomPageSize] = useState<string>(String(rowsPerPage));

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("dvepl-page-size:delivery", String(rowsPerPage));
      } catch {
        // fail silently
      }
    }
  }, [rowsPerPage]);

  const getVisiblePages = (currPage: number, totalPgs: number) => {
    const delta = 1;
    const range: number[] = [];
    const rangeWithDots: (number | string)[] = [];
    let l: number | null = null;

    for (let i = 1; i <= totalPgs; i++) {
      if (i === 1 || i === totalPgs || (i >= currPage - delta && i <= currPage + delta)) {
        range.push(i);
      }
    }

    for (const i of range) {
      if (l !== null) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l > 2) {
          rangeWithDots.push("...");
        }
      }
      rangeWithDots.push(i);
      l = i;
    }

    return rangeWithDots;
  };

  // Calendar state
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date(2026, 5, 1)); // Default June 2026

  // Modals
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);

  // Form State
  const [editStatus, setEditStatus] = useState<DeliveryStatus>(DeliveryStatus.PLANNED);
  const [editDispatchDate, setEditDispatchDate] = useState('');
  const [editTargetMonth, setEditTargetMonth] = useState('');
  const [editActualDate, setEditActualDate] = useState('');
  const [editRemarks, setEditRemarks] = useState('');

  // Fetch real Sales Orders from Backend API
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const fetchOrders = async () => {
    setLoadingOrders(true);
    try {
      const res = await apiClient.get('/order/read');
      const list = Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : [];
      setSalesOrders(list);
    } catch (err: any) {
      console.error('Failed to load orders for delivery page', err);
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Map backend sales orders to Delivery Orders format and store in Zustand store
  const deliveryOrders: DeliveryOrder[] = useMemo(() => {
    if (salesOrders && salesOrders.length > 0) {
      return salesOrders.map((so: any, index: number): DeliveryOrder => {
        // Target Delivery Date set from Order page (deliveryMonthTarget / deliveryTarget)
        const rawTargetDate = so.deliveryMonthTarget || so.deliveryTarget || '';
        const rawConfirmDate = so.orderConfirmDate ? (typeof so.orderConfirmDate === 'string' && so.orderConfirmDate.includes('T') ? so.orderConfirmDate.split('T')[0] : so.orderConfirmDate) : '';
        const rawPoDate = so.poDate ? (typeof so.poDate === 'string' && so.poDate.includes('T') ? so.poDate.split('T')[0] : so.poDate) : '';

        // Delivery Target Priority: Order Target Delivery Date > PO Date > Confirm Date
        const deliveryTarget = rawTargetDate || rawPoDate || rawConfirmDate || '';

        const itemsText = Array.isArray(so.items) && so.items.length > 0
          ? so.items.map((i: any) => `${i.description || i.itemCode || 'Item'} (x${i.quantity || 1})`).join(', ')
          : so.partyName ? `Order for ${so.partyName}` : 'Industrial Equipment & Panel Assemblies';

        let mappedStatus: DeliveryStatus = DeliveryStatus.PLANNED;
        const s = (so.status || '').toLowerCase();
        if (s === 'completed' || s === 'delivered') {
          mappedStatus = DeliveryStatus.DELIVERED;
        } else if (s === 'dispatched' || s === 'shipped') {
          mappedStatus = DeliveryStatus.DISPATCHED;
        } else if (s === 'in-progress' || s === 'in_progress' || s === 'processing') {
          mappedStatus = DeliveryStatus.IN_PROGRESS;
        }

        return {
          id: so.id,
          companyCode: so.dveplCode || so.companyCode || `DVEPL/26-27/${100 + index}`,
          customerName: so.partyName || so.customerName || so.company?.name || 'Standard Client',
          itemName: itemsText,
          assignedTo: [
            ...(so.orderTakenBy?.name ? [so.orderTakenBy.name] : []),
            ...(Array.isArray(so.takenByUsers)
              ? so.takenByUsers
                  .map((tu: any) => tu?.user?.name)
                  .filter(Boolean)
              : []),
          ].join(', ') || so.assignedTo || 'Unassigned',
          deliveryTarget: deliveryTarget,
          dispatchDate: rawPoDate || '',
          actualDeliveryDate: rawConfirmDate || '',
          deliveryStatus: mappedStatus,
          orderStatus: so.status || 'Pending',
          remarks: so.remarks || '',
          targetMonth: so.deliveryMonthTarget || 'August 2026',
          history: so.history || [
            {
              date: new Date().toISOString().split('T')[0],
              status: mappedStatus.toUpperCase(),
              remarks: 'Order scheduled in delivery pipeline.',
              updatedBy: 'System',
            },
          ],
        };
      });
    }

    return store.deliveryOrders || [];
  }, [salesOrders]);

  useEffect(() => {
    if (salesOrders && salesOrders.length > 0) {
      setDeliveryOrdersInStore(deliveryOrders);
    }
  }, [salesOrders]);

  // Unique Months and Users for filters
  const uniqueMonths = useMemo(() => {
    const set = new Set<string>();
    deliveryOrders.forEach((o) => {
      if (o.targetMonth) set.add(o.targetMonth);
    });
    return Array.from(set);
  }, [deliveryOrders]);

  const uniqueUsers = useMemo(() => {
    const set = new Set<string>();
    deliveryOrders.forEach((o) => {
      if (o.assignedTo) set.add(o.assignedTo);
    });
    return Array.from(set);
  }, [deliveryOrders]);

  // Helper for Days Left calculation with robust multi-format date parsing
  const calculateDaysLeft = (targetDateStr: string, status: string, actualDeliveryDateStr?: string, dispatchDateStr?: string) => {
    if (status === 'delivered') return { text: 'Delivered', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' };
    
    // Prioritize specific exact dates (Actual Delivery Date or Dispatch Date or Target Date)
    // Avoid evaluating month-only strings (e.g. "july 2026") when an exact YYYY-MM-DD date is available
    const isExactDate = (str?: string) => str && (str.includes('-') || str.includes('/')) && /\d{4}/.test(str) && !/^[a-zA-Z]+\s+\d{4}$/.test(str.trim());

    let dateToEvaluate = '';
    if (isExactDate(actualDeliveryDateStr)) {
      dateToEvaluate = actualDeliveryDateStr!;
    } else if (isExactDate(dispatchDateStr)) {
      dateToEvaluate = dispatchDateStr!;
    } else if (isExactDate(targetDateStr)) {
      dateToEvaluate = targetDateStr!;
    } else {
      dateToEvaluate = targetDateStr || dispatchDateStr || actualDeliveryDateStr || '';
    }

    if (!dateToEvaluate) return { text: 'No Date Set', color: 'text-slate-500 bg-slate-100 border-slate-200' };

    const parseFlexibleDate = (input: string): Date | null => {
      if (!input) return null;
      const str = input.trim();

      // Format: YYYY-MM-DD or YYYY/MM/DD (e.g. 2026-07-29)
      const yyyymmddMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
      if (yyyymmddMatch) {
        const year = parseInt(yyyymmddMatch[1], 10);
        const month = parseInt(yyyymmddMatch[2], 10) - 1;
        const day = parseInt(yyyymmddMatch[3], 10);
        return new Date(year, month, day);
      }

      // Format: DD-MM-YYYY or DD/MM/YYYY (e.g. 29-07-2026 or 29/07/2026)
      const ddmmyyyyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
      if (ddmmyyyyMatch) {
        const day = parseInt(ddmmyyyyMatch[1], 10);
        const month = parseInt(ddmmyyyyMatch[2], 10) - 1;
        const year = parseInt(ddmmyyyyMatch[3], 10);
        return new Date(year, month, day);
      }

      // Try native parse (ISO strings)
      const nativeDate = new Date(str);
      if (!isNaN(nativeDate.getTime())) {
        return nativeDate;
      }

      // Format: Month Year (e.g. "August 2026" or "july 2026") -> Defaults to 1st of Month
      const monthYearParts = str.split(/\s+/);
      if (monthYearParts.length === 2) {
        const parsedMonthYear = new Date(`1 ${monthYearParts[0]} ${monthYearParts[1]}`);
        if (!isNaN(parsedMonthYear.getTime())) {
          return parsedMonthYear;
        }
      }

      return null;
    };

    const target = parseFlexibleDate(dateToEvaluate);

    if (!target || isNaN(target.getTime())) {
      return { text: 'Target Pending', color: 'text-slate-500 bg-slate-100 border-slate-200' };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);

    const diffTime = target.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { text: `${Math.abs(diffDays)}d Overdue`, color: 'text-rose-600 bg-rose-50 border-rose-200 font-bold' };
    }
    if (diffDays === 0) {
      return { text: 'Due Today', color: 'text-amber-600 bg-amber-50 border-amber-200 font-bold' };
    }
    return { text: `${diffDays} days left`, color: 'text-slate-600 bg-slate-100 border-slate-200' };
  };

  // Filtered dataset
  const filteredOrders = useMemo(() => {
    return deliveryOrders.filter((order) => {
      // Search
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        !query ||
        order.companyCode.toLowerCase().includes(query) ||
        order.customerName.toLowerCase().includes(query) ||
        order.itemName.toLowerCase().includes(query) ||
        order.assignedTo.toLowerCase().includes(query);

      // Status
      const matchesStatus = statusFilter === 'all' || order.deliveryStatus === statusFilter;

      // Month
      const matchesMonth = monthFilter === 'all' || order.targetMonth === monthFilter;

      // User
      const matchesUser = userFilter === 'all' || order.assignedTo === userFilter;

      // Overdue
      const daysLeftInfo = calculateDaysLeft(order.deliveryTarget, order.deliveryStatus);
      const isOverdue = daysLeftInfo.text.includes('Overdue');

      if (showOverdueOnly) {
        return matchesSearch && matchesStatus && matchesMonth && matchesUser && isOverdue;
      }

      return matchesSearch && matchesStatus && matchesMonth && matchesUser;
    });
  }, [deliveryOrders, searchQuery, statusFilter, monthFilter, userFilter, showOverdueOnly]);

  // Paginated dataset
  const totalPages = Math.ceil(filteredOrders.length / rowsPerPage) || 1;
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredOrders.slice(start, start + rowsPerPage);
  }, [filteredOrders, currentPage, rowsPerPage]);

  // Metrics Counters
  const metrics = useMemo(() => {
    const total = deliveryOrders.length;
    const planned = deliveryOrders.filter((o) => o.deliveryStatus === 'planned').length;
    const inProgress = deliveryOrders.filter((o) => o.deliveryStatus === 'in-progress').length;
    const dispatched = deliveryOrders.filter((o) => o.deliveryStatus === 'dispatched').length;
    const delivered = deliveryOrders.filter((o) => o.deliveryStatus === 'delivered').length;
    const overdue = deliveryOrders.filter((o) => {
      const d = calculateDaysLeft(o.deliveryTarget, o.deliveryStatus);
      return d.text.includes('Overdue');
    }).length;

    return { total, planned, inProgress, dispatched, delivered, overdue };
  }, [deliveryOrders]);

  // Handlers for Modals
  const handleOpenUpdateModal = (order: DeliveryOrder) => {
    setSelectedOrder(order);
    setEditStatus(order.deliveryStatus);
    setEditDispatchDate(order.dispatchDate || '');
    setEditTargetMonth(order.targetMonth || '');
    setEditActualDate(order.actualDeliveryDate || '');
    setEditRemarks(order.remarks || '');
    setUpdateModalOpen(true);
  };

  const handleOpenDetailModal = (order: DeliveryOrder) => {
    setSelectedOrder(order);
    setDetailModalOpen(true);
  };

  const handleSaveDelivery = async () => {
    if (!selectedOrder) return;
    try {
      const backendStatusMap: Record<string, string> = {
        'planned': 'PENDING',
        'in-progress': 'IN_PROGRESS',
        'dispatched': 'DISPATCHED',
        'delivered': 'COMPLETED'
      };

      await apiClient.patch(`/order/update/${selectedOrder.id}`, {
        status: backendStatusMap[editStatus] || 'PENDING',
        deliveryMonthTarget: editTargetMonth || undefined,
        poDate: editDispatchDate || undefined,
        orderConfirmDate: editActualDate || undefined,
        remarks: editRemarks || undefined
      });

      updateDeliveryOrderInStore(selectedOrder.id, {
        deliveryStatus: editStatus,
        targetMonth: editTargetMonth || selectedOrder.targetMonth,
        dispatchDate: editDispatchDate || selectedOrder.dispatchDate,
        actualDeliveryDate: editActualDate || selectedOrder.actualDeliveryDate,
        remarks: editRemarks || selectedOrder.remarks,
      });

      toast.success(`Delivery for ${selectedOrder.companyCode} updated successfully`);
      setUpdateModalOpen(false);
      fetchOrders();
    } catch (err: any) {
      toast.error('Failed to update delivery status');
    }
  };

  const renderStatusBadge = (status: DeliveryOrder['deliveryStatus']) => {
    switch (status) {
      case 'planned':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">Planned</span>;
      case 'in-progress':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">In Progress</span>;
      case 'dispatched':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">Dispatched</span>;
      case 'delivered':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Delivered</span>;
      default:
        return null;
    }
  };

  return (
    <div className="p-6 space-y-6 bg-background min-h-screen text-foreground">
      {/* Top Banner KPI Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-card p-4 rounded-xl border border-border shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">Total Orders</span>
          <div className="flex items-center justify-between">
            <span className="text-xl font-bold text-foreground">{metrics.total}</span>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        <div className="bg-card p-4 rounded-xl border border-border shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">Planned</span>
          <div className="flex items-center justify-between">
            <span className="text-xl font-bold text-amber-500">{metrics.planned}</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
        </div>

        <div className="bg-card p-4 rounded-xl border border-border shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">In Progress</span>
          <div className="flex items-center justify-between">
            <span className="text-xl font-bold text-blue-500">{metrics.inProgress}</span>
            <Cog className="h-4 w-4 text-blue-500" />
          </div>
        </div>

        <div className="bg-card p-4 rounded-xl border border-border shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">Dispatched</span>
          <div className="flex items-center justify-between">
            <span className="text-xl font-bold text-purple-500">{metrics.dispatched}</span>
            <Truck className="h-4 w-4 text-purple-500" />
          </div>
        </div>

        <div className="bg-card p-4 rounded-xl border border-border shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">Delivered</span>
          <div className="flex items-center justify-between">
            <span className="text-xl font-bold text-emerald-500">{metrics.delivered}</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
        </div>

        <div className="bg-card p-4 rounded-xl border border-border shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">Overdue</span>
          <div className="flex items-center justify-between">
            <span className="text-xl font-bold text-rose-500">{metrics.overdue}</span>
            <AlertTriangle className="h-4 w-4 text-rose-500" />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-card rounded-2xl border border-border shadow-xs p-5 space-y-4 text-card-foreground">
        {/* Toolbar Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border/60">
          {/* View Switcher Tabs */}
          <div className="inline-flex p-1 bg-muted rounded-xl border border-border/40">
            <button
              onClick={() => setActiveView('table')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all ${
                activeView === 'table' ? 'bg-card text-foreground shadow-xs border border-border/80' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              TABLE
            </button>
            <button
              onClick={() => setActiveView('calendar')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all ${
                activeView === 'calendar' ? 'bg-card text-foreground shadow-xs border border-border/80' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              CALENDAR
            </button>
            <button
              onClick={() => setActiveView('timeline')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all ${
                activeView === 'timeline' ? 'bg-card text-foreground shadow-xs border border-border/80' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              TIMELINE
            </button>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search delivery orders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs border-border rounded-xl bg-background"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">DELIVERY STATUS:</span>
              <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val || 'all')}>
                <SelectTrigger className="w-36 h-9 text-xs rounded-xl border-border bg-background">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="dispatched">Dispatched</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">MONTH:</span>
              <Select value={monthFilter} onValueChange={(val) => setMonthFilter(val || 'all')}>
                <SelectTrigger className="w-32 h-9 text-xs rounded-xl border-border bg-background">
                  <SelectValue placeholder="All Months" />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  <SelectItem value="all">All Months</SelectItem>
                  {uniqueMonths.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">USER:</span>
              <Select value={userFilter} onValueChange={(val) => setUserFilter(val || 'all')}>
                <SelectTrigger className="w-32 h-9 text-xs rounded-xl border-border bg-background">
                  <SelectValue placeholder="All Users" />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  <SelectItem value="all">All Users</SelectItem>
                  {uniqueUsers.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2 pl-3 border-l border-border">
              <Checkbox
                id="overdue-chk"
                checked={showOverdueOnly}
                onCheckedChange={(c) => setShowOverdueOnly(!!c)}
                className="rounded-md border-border data-[state=checked]:bg-emerald-600"
              />
              <label htmlFor="overdue-chk" className="text-xs text-muted-foreground font-semibold cursor-pointer select-none">
                Overdue Only
              </label>
            </div>
          </div>
        </div>

        {/* View Content */}
        {activeView === 'table' && (
          <div className="space-y-4">
            {/* Pagination Controls */}
            {!loadingOrders && filteredOrders.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Page Numbers Navigation Pill */}
                  <div className="flex items-center gap-1 bg-muted/60 border border-border/70 p-1 h-11 rounded-xl shadow-xs">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card border border-transparent hover:border-border/30 hover:shadow-3xs transition-all duration-150 disabled:opacity-30 disabled:pointer-events-none"
                      onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4.5 w-4.5" />
                    </Button>

                    <div className="flex items-center gap-1">
                      {getVisiblePages(currentPage, totalPages).map((page, index) => {
                        if (page === "...") {
                          return (
                            <span
                              key={`dots-${index}`}
                              className="text-xs text-muted-foreground font-semibold px-1.5 select-none"
                            >
                              ...
                            </span>
                          );
                        }
                        const isCurrent = page === currentPage;
                        return (
                          <Button
                            key={`page-${page}`}
                            variant={isCurrent ? "default" : "ghost"}
                            size="sm"
                            className={`h-9 w-9 p-0 rounded-lg text-xs font-semibold transition-all duration-150 ${
                              isCurrent
                                ? "bg-primary text-white hover:bg-primary/95 shadow-sm"
                                : "text-muted-foreground hover:text-foreground hover:bg-card border border-transparent hover:border-border/30 hover:shadow-3xs"
                            }`}
                            onClick={() => setCurrentPage(page as number)}
                          >
                            {page}
                          </Button>
                        );
                      })}
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card border border-transparent hover:border-border/30 hover:shadow-3xs transition-all duration-150 disabled:opacity-30 disabled:pointer-events-none"
                      onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4.5 w-4.5" />
                    </Button>
                  </div>

                  {/* Custom Entries Selector Pill */}
                  <div className="flex items-center gap-2 bg-muted/60 border border-border/70 px-3 h-11 rounded-xl shadow-xs text-xs text-muted-foreground font-medium">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="w-12 h-7 text-center bg-card border border-border/70 text-foreground rounded-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 font-bold text-xs"
                      value={customPageSize}
                      onChange={(e) => {
                        const valStr = e.target.value.replace(/[^0-9]/g, "");
                        setCustomPageSize(valStr);
                        if (valStr) {
                          const valNum = parseInt(valStr, 10);
                          if (valNum > 0) {
                            setRowsPerPage(valNum);
                          }
                        }
                      }}
                      onBlur={() => {
                        if (!customPageSize || parseInt(customPageSize, 10) <= 0) {
                          setRowsPerPage(10);
                          setCustomPageSize("10");
                        }
                      }}
                    />
                    <span>entries per page</span>
                    <div className="w-px h-4 bg-border/80 mx-1.5" />
                    <button
                      type="button"
                      className="text-primary hover:text-primary/80 font-bold uppercase text-[10px] tracking-wider transition-colors"
                      onClick={() => {
                        setRowsPerPage(filteredOrders.length || Number.MAX_SAFE_INTEGER);
                        setCustomPageSize(String(filteredOrders.length || Number.MAX_SAFE_INTEGER));
                      }}
                    >
                      Show All
                    </button>
                  </div>
                </div>

                <span className="text-xs text-muted-foreground font-medium">
                  Showing {filteredOrders.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1} to{' '}
                  {Math.min(currentPage * rowsPerPage, filteredOrders.length)} of {filteredOrders.length} records
                </span>
              </div>
            )}
            <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
            <table className="w-full text-left text-xs text-foreground/80">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-xs text-foreground font-bold border-b border-border uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3.5 px-3 w-12 text-center bg-muted/95 backdrop-blur-xs">#</th>
                  <th className="py-3.5 px-3 bg-muted/95 backdrop-blur-xs">DVEPL CODE</th>
                  <th className="py-3.5 px-3 bg-muted/95 backdrop-blur-xs">PARTY NAME</th>
                  <th className="py-3.5 px-3 bg-muted/95 backdrop-blur-xs">ITEMS</th>
                  <th className="py-3.5 px-3 bg-muted/95 backdrop-blur-xs">ASSIGNED TO</th>
                  <th className="py-3.5 px-3 bg-muted/95 backdrop-blur-xs">DELIVERY TARGET</th>
                  <th className="py-3.5 px-3 bg-muted/95 backdrop-blur-xs">DISPATCH DATE</th>
                  <th className="py-3.5 px-3 bg-muted/95 backdrop-blur-xs">DELIVERY DATE</th>
                  <th className="py-3.5 px-3 bg-muted/95 backdrop-blur-xs">DELIVERY STATUS</th>
                  <th className="py-3.5 px-3 bg-muted/95 backdrop-blur-xs">ORDER STATUS</th>
                  <th className="py-3.5 px-3 bg-muted/95 backdrop-blur-xs">DAYS LEFT</th>
                  <th className="py-3.5 px-3 text-right bg-muted/95 backdrop-blur-xs">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedOrders.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-10 text-center text-muted-foreground">
                      No delivery orders found.
                    </td>
                  </tr>
                ) : (
                  paginatedOrders.map((order, idx) => {
                    const daysLeft = calculateDaysLeft(order.deliveryTarget, order.deliveryStatus, order.actualDeliveryDate, order.dispatchDate);
                    return (
                      <tr key={order.id} className="hover:bg-muted/45 transition-all duration-150">
                        <td className="py-3.5 px-3 text-center text-muted-foreground font-mono text-[11px]">{(currentPage - 1) * rowsPerPage + idx + 1}</td>
                        <td className="py-3.5 px-3 font-bold text-foreground">{order.companyCode}</td>
                        <td className="py-3.5 px-3 font-semibold text-foreground/90">{order.customerName}</td>
                        <td className="py-3.5 px-3 text-muted-foreground max-w-xs truncate" title={order.itemName}>
                          {order.itemName}
                        </td>
                        <td className="py-3.5 px-3 text-muted-foreground font-medium">{order.assignedTo}</td>
                        <td className="py-3.5 px-3 text-foreground/90 font-semibold">{order.deliveryTarget}</td>
                        <td className="py-3.5 px-3 text-muted-foreground font-mono text-[11px]">{order.dispatchDate || '—'}</td>
                        <td className="py-3.5 px-3 text-foreground/90 font-mono font-semibold text-[11px]">{order.actualDeliveryDate || '—'}</td>
                        <td className="py-3.5 px-3">{renderStatusBadge(order.deliveryStatus)}</td>
                        <td className="py-3.5 px-3">
                          <span className="inline-block px-2.5 py-0.5 rounded-md bg-muted border border-border text-foreground/80 font-semibold text-[11px]">
                            {order.orderStatus}
                          </span>
                        </td>
                        <td className="py-3.5 px-3">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${daysLeft.color}`}>
                            {daysLeft.text}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
                              onClick={() => handleOpenDetailModal(order)}
                              title="View Details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-emerald-600 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-lg"
                                onClick={() => handleOpenUpdateModal(order)}
                                title="Update Delivery"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          </div>
        )}

        {/* Calendar View */}
        {activeView === 'calendar' && (
          <div className="space-y-4 py-2">
            {/* Navigation & Status Legend */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-4 rounded-2xl border border-border shadow-2xs">
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-xl border-border bg-muted/30 hover:bg-muted/50 shadow-2xs"
                  onClick={() => setCurrentCalendarDate(new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() - 1, 1))}
                >
                  <ChevronLeft className="h-4.5 w-4.5 text-foreground" />
                </Button>
                <div>
                  <h3 className="text-base font-extrabold text-foreground tracking-tight">
                    {currentCalendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                  </h3>
                  <p className="text-[11px] font-medium text-muted-foreground">Click any order badge for quick details</p>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-xl border-border bg-muted/30 hover:bg-muted/50 shadow-2xs"
                  onClick={() => setCurrentCalendarDate(new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 1))}
                >
                  <ChevronRight className="h-4.5 w-4.5 text-foreground" />
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 text-xs font-bold">
                <span className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50/80 px-3 py-1 rounded-xl border border-emerald-200/80">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Delivered
                </span>
                <span className="inline-flex items-center gap-1.5 text-purple-700 bg-purple-50/80 px-3 py-1 rounded-xl border border-purple-200/80">
                  <span className="w-2 h-2 rounded-full bg-purple-500" /> Dispatched
                </span>
                <span className="inline-flex items-center gap-1.5 text-blue-700 bg-blue-50/80 px-3 py-1 rounded-xl border border-blue-200/80">
                  <span className="w-2 h-2 rounded-full bg-blue-500" /> In Progress
                </span>
                <span className="inline-flex items-center gap-1.5 text-amber-700 bg-amber-50/80 px-3 py-1 rounded-xl border border-amber-200/80">
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> Planned
                </span>
              </div>
            </div>

            {/* Premium Full Month Grid Container */}
            <div className="border border-border rounded-2xl overflow-hidden bg-card shadow-xs">
              {/* Day Name Headers */}
              <div className="grid grid-cols-7 bg-muted/50 border-b border-border text-center text-xs font-extrabold text-foreground uppercase tracking-wider py-3">
                <div className="text-rose-500">Sun</div>
                <div>Mon</div>
                <div>Tue</div>
                <div>Wed</div>
                <div>Thu</div>
                <div>Fri</div>
                <div className="text-indigo-500">Sat</div>
              </div>

              {/* Day Cells Grid */}
              <div className="grid grid-cols-7 gap-px bg-border/60">
                {(() => {
                  const year = currentCalendarDate.getFullYear();
                  const month = currentCalendarDate.getMonth();
                  const firstDayIndex = new Date(year, month, 1).getDay();
                  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
                  const prevMonthDays = new Date(year, month, 0).getDate();

                  const cells = [];

                  // Previous Month Empty Days
                  for (let i = firstDayIndex - 1; i >= 0; i--) {
                    cells.push(
                      <div key={`prev-${i}`} className="min-h-[125px] bg-muted/20 p-2.5 opacity-40 select-none">
                        <span className="text-xs font-bold text-muted-foreground font-mono">{prevMonthDays - i}</span>
                      </div>
                    );
                  }

                  // Current Month Days
                  for (let dayNum = 1; dayNum <= totalDaysInMonth; dayNum++) {
                    const monthFormatted = String(month + 1).padStart(2, '0');
                    const dayFormatted = String(dayNum).padStart(2, '0');
                    const dayStr = `${year}-${monthFormatted}-${dayFormatted}`;
                    const matched = filteredOrders.filter((o) => o.deliveryTarget === dayStr);

                    const isToday =
                      new Date().getDate() === dayNum &&
                      new Date().getMonth() === month &&
                      new Date().getFullYear() === year;

                    cells.push(
                      <div
                        key={`day-${dayNum}`}
                        className={`min-h-[125px] bg-card p-2.5 flex flex-col gap-2 transition-all hover:bg-muted/30 ${
                          isToday ? 'ring-2 ring-emerald-500/40 bg-emerald-500/10' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-xs font-mono font-extrabold h-6 w-6 rounded-full flex items-center justify-center ${
                              isToday ? 'bg-emerald-600 text-white shadow-2xs' : 'text-foreground'
                            }`}
                          >
                            {dayNum}
                          </span>
                          {matched.length > 0 && (
                            <span className="text-[10px] font-extrabold bg-primary text-primary-foreground px-2 py-0.5 rounded-full shadow-2xs">
                              {matched.length} {matched.length === 1 ? 'order' : 'orders'}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1.5 overflow-y-auto max-h-24 pr-0.5">
                          {matched.map((m) => {
                            const badgeStyle =
                              m.deliveryStatus === 'delivered'
                                ? 'bg-emerald-500 text-white shadow-xs hover:bg-emerald-600'
                                : m.deliveryStatus === 'dispatched'
                                ? 'bg-purple-600 text-white shadow-xs hover:bg-purple-700'
                                : m.deliveryStatus === 'in-progress'
                                ? 'bg-blue-600 text-white shadow-xs hover:bg-blue-700'
                                : 'bg-amber-500 text-white shadow-xs hover:bg-amber-600';

                            return (
                              <div
                                key={m.id}
                                onClick={() => handleOpenDetailModal(m)}
                                className={`text-[11px] p-2 rounded-xl font-bold cursor-pointer transition-all hover:scale-[1.02] active:scale-95 ${badgeStyle}`}
                                title={`${m.companyCode} - ${m.customerName}`}
                              >
                                <div className="truncate font-mono tracking-tight">{m.companyCode}</div>
                                <div className="text-[10px] font-medium text-white/90 truncate mt-0.5">{m.customerName}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  // Next Month Padding Days
                  const totalCells = cells.length;
                  const remaining = 35 - totalCells > 0 ? 35 - totalCells : 42 - totalCells;
                  for (let i = 1; i <= remaining; i++) {
                    cells.push(
                      <div key={`next-${i}`} className="min-h-[125px] bg-muted/20 p-2.5 opacity-40 select-none">
                        <span className="text-xs font-bold text-muted-foreground font-mono">{i}</span>
                      </div>
                    );
                  }

                  return cells;
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Timeline View */}
        {activeView === 'timeline' && (
          <div className="space-y-4 py-4">
            <div className="relative border-l-2 border-border ml-4 space-y-6">
              {filteredOrders.map((order) => (
                <div key={order.id} className="relative pl-6">
                  <div className="absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-background bg-emerald-500 shadow-xs" />
                  <div className="bg-card border border-border p-4 rounded-xl space-y-3 shadow-2xs hover:bg-muted/20 hover:shadow-xs transition-all">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-foreground text-xs">{order.companyCode}</span>
                      <div className="flex items-center gap-2">
                        {renderStatusBadge(order.deliveryStatus)}
                        <div className="flex items-center gap-1 border-l border-border pl-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
                            onClick={() => handleOpenDetailModal(order)}
                            title="View Details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-emerald-600 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-lg"
                              onClick={() => handleOpenUpdateModal(order)}
                              title="Update Delivery"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs font-semibold text-foreground/95">{order.customerName}</p>
                    <p className="text-xs text-muted-foreground">{order.itemName}</p>
                    <div className="flex items-center gap-4 text-[11px] text-muted-foreground pt-1 border-t border-border/80">
                      <span>Target: <strong className="text-foreground/90">{order.deliveryTarget}</strong></span>
                      <span>Assigned: <strong className="text-foreground/90">{order.assignedTo}</strong></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Update Delivery Modal */}
      <Dialog open={updateModalOpen} onOpenChange={setUpdateModalOpen}>
        <DialogContent className="sm:max-w-4xl max-w-[92vw] w-full p-0 overflow-hidden rounded-3xl bg-card border border-border shadow-2xl text-card-foreground">
          {/* Header */}
          <div className="px-7 py-5 bg-card border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-2xl border border-emerald-500/20 shadow-2xs">
                <Edit className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-extrabold text-foreground tracking-tight">Update Delivery Details</DialogTitle>
                <p className="text-xs font-medium text-muted-foreground mt-0.5">Manage dispatch milestones, tracking remarks, and delivery schedules</p>
              </div>
            </div>
          </div>

          {selectedOrder && (
            <div className="p-7 text-xs bg-background max-h-[82vh] overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Side: Order Specification Summary Card (4 cols) */}
                <div className="lg:col-span-4 space-y-4">
                  <div className="bg-card border border-border p-5 rounded-2xl shadow-2xs space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-border">
                      <span className="font-mono font-extrabold text-foreground text-sm">{selectedOrder.companyCode}</span>
                      {renderStatusBadge(selectedOrder.deliveryStatus)}
                    </div>

                    <div className="space-y-3">
                      <div>
                        <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block">Customer / Party</span>
                        <p className="font-bold text-foreground text-xs mt-0.5">{selectedOrder.customerName}</p>
                      </div>

                      <div>
                        <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block">Equipment / Items</span>
                        <p className="font-semibold text-muted-foreground text-xs mt-0.5 leading-relaxed">{selectedOrder.itemName}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                        <div>
                          <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block">Assigned Engineer</span>
                          <p className="font-semibold text-foreground/95 text-xs mt-0.5">{selectedOrder.assignedTo}</p>
                        </div>
                        <div>
                          <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block">Target Month</span>
                          <p className="font-bold text-foreground text-xs mt-0.5">{selectedOrder.targetMonth || '—'}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl space-y-1 text-emerald-800 dark:text-emerald-200">
                    <span className="font-extrabold text-xs flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300">
                      <Truck className="h-4 w-4 text-emerald-500" /> Operational Notice
                    </span>
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400 leading-relaxed">
                      Updating delivery status automatically logs an entry in the order audit history.
                    </p>
                  </div>
                </div>

                {/* Right Side: Form Inputs (8 cols) */}
                <div className="lg:col-span-8 bg-card border border-border p-6 rounded-2xl shadow-2xs space-y-5">
                  <h4 className="font-extrabold text-foreground text-xs uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-border">
                    <Clock className="h-4 w-4 text-emerald-500" /> Status & Schedule Update
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs font-bold text-foreground">Delivery Status *</Label>
                      <Select value={editStatus} onValueChange={(val) => { if (val) setEditStatus(val as any); }}>
                        <SelectTrigger className="h-10 text-xs rounded-xl border-border focus:ring-2 focus:ring-emerald-500/20 bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="z-[100]">
                          <SelectItem value="planned">Planned</SelectItem>
                          <SelectItem value="in-progress">In Progress</SelectItem>
                          <SelectItem value="dispatched">Dispatched</SelectItem>
                          <SelectItem value="delivered">Delivered</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-foreground">Dispatch Date</Label>
                      <Input
                        type="date"
                        value={editDispatchDate}
                        onChange={(e) => setEditDispatchDate(e.target.value)}
                        className="h-10 text-xs rounded-xl border-border bg-background"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-foreground">Delivery Target Month</Label>
                      <Input
                        type="text"
                        placeholder="e.g. June 2026"
                        value={editTargetMonth}
                        onChange={(e) => setEditTargetMonth(e.target.value)}
                        className="h-10 text-xs rounded-xl border-border bg-background"
                      />
                    </div>

                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs font-bold text-foreground">Actual Delivery Date</Label>
                      <Input
                        type="date"
                        value={editActualDate}
                        onChange={(e) => setEditActualDate(e.target.value)}
                        className="h-10 text-xs rounded-xl border-border bg-background"
                      />
                    </div>

                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs font-bold text-foreground">Delivery Remarks & Transporter Notes</Label>
                      <Textarea
                        rows={3}
                        placeholder="Enter LR tracking number, transporter details, or dispatch remarks..."
                        value={editRemarks}
                        onChange={(e) => setEditRemarks(e.target.value)}
                        className="text-xs rounded-xl border-border focus:ring-2 focus:ring-emerald-500/20 bg-background"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="px-7 py-4 bg-muted border-t border-border flex items-center justify-end gap-3">
            <Button variant="outline" size="sm" onClick={() => setUpdateModalOpen(false)} className="h-10 px-5 text-xs font-semibold rounded-xl border-border">
              Cancel
            </Button>
            <Button size="sm" className="h-10 px-6 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs" onClick={handleSaveDelivery}>
              <Save className="h-4 w-4 mr-2" /> Save Delivery Update
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Modal (Overview) */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="sm:max-w-4xl max-w-[92vw] w-full p-0 overflow-hidden rounded-3xl bg-card border border-border shadow-2xl text-card-foreground">
          {/* Header */}
          <div className="px-7 py-5 bg-card border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="p-2.5 bg-cyan-500/10 text-cyan-500 rounded-2xl border border-cyan-500/20 shadow-2xs">
                <Eye className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-extrabold text-foreground tracking-tight">Delivery Overview</DialogTitle>
                <p className="text-xs font-medium text-muted-foreground mt-0.5">Order specifications, target timeline and status log</p>
              </div>
            </div>
          </div>

          {selectedOrder && (
            <div className="p-7 text-xs bg-background max-h-[82vh] overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column: Order Specification Summary Card */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="bg-card border border-border p-5 rounded-2xl shadow-2xs space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-border">
                      <span className="font-mono font-extrabold text-foreground text-sm">{selectedOrder.companyCode}</span>
                      {renderStatusBadge(selectedOrder.deliveryStatus)}
                    </div>

                    <div className="space-y-3">
                      <div>
                        <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block">Customer / Party</span>
                        <p className="font-bold text-foreground text-xs mt-0.5">{selectedOrder.customerName}</p>
                      </div>

                      <div>
                        <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block">Equipment / Items</span>
                        <p className="font-semibold text-muted-foreground text-xs mt-0.5 leading-relaxed">{selectedOrder.itemName}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                        <div>
                          <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block">Assigned Engineer</span>
                          <p className="font-semibold text-foreground/95 text-xs mt-0.5">{selectedOrder.assignedTo}</p>
                        </div>
                        <div>
                          <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block">Order Status</span>
                          <p className="font-bold text-foreground text-xs mt-0.5">{selectedOrder.orderStatus}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Detailed Grid & Status Log */}
                <div className="lg:col-span-7 space-y-5">
                  <div className="bg-card border border-border p-6 rounded-2xl shadow-2xs space-y-4">
                    <h4 className="font-extrabold text-foreground text-xs uppercase tracking-wider flex items-center gap-2 pb-2 border-b border-border">
                      <Clock className="h-4 w-4 text-cyan-600" /> Key Delivery Milestones
                    </h4>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-muted/40 p-3 rounded-xl border border-border">
                        <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block">Target Delivery</span>
                        <p className="font-bold text-foreground text-xs mt-1">{selectedOrder.deliveryTarget}</p>
                      </div>
                      <div className="bg-muted/40 p-3 rounded-xl border border-border">
                        <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block">Dispatch Date</span>
                        <p className="font-bold text-foreground/90 text-xs mt-1">{selectedOrder.dispatchDate || '—'}</p>
                      </div>
                      <div className="bg-muted/40 p-3 rounded-xl border border-border">
                        <span className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider block">Actual Delivery</span>
                        <p className="font-bold text-foreground/90 text-xs mt-1">{selectedOrder.actualDeliveryDate || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Status Audit Log */}
                  <div className="bg-card border border-border p-6 rounded-2xl shadow-2xs space-y-3">
                    <h4 className="font-extrabold text-foreground text-xs uppercase tracking-wider">Status History Log</h4>
                    <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                      {selectedOrder.history && selectedOrder.history.length > 0 ? (
                        selectedOrder.history.map((h, i) => (
                          <div key={i} className="p-3 rounded-xl border border-border bg-muted/30 space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold text-foreground/90">{h.status}</span>
                              <span className="text-muted-foreground font-mono text-[10px]">{h.date}</span>
                            </div>
                            <p className="text-muted-foreground text-[11px]">{h.remarks || 'No remarks provided.'}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground text-center py-4">No history records logged.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="px-7 py-4 bg-muted border-t border-border flex items-center justify-end gap-3">
            <Button variant="outline" size="sm" onClick={() => setDetailModalOpen(false)} className="h-10 px-5 text-xs font-semibold rounded-xl border-border">
              Close
            </Button>
            <Button
              size="sm"
              className="h-10 px-6 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs"
              onClick={() => {
                setDetailModalOpen(false);
                if (selectedOrder) handleOpenUpdateModal(selectedOrder);
              }}
            >
              <Edit className="h-4 w-4 mr-2" /> Update Delivery
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default DeliveryPage;
