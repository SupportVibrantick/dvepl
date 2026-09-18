import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { 
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  DollarSign, 
  CheckCircle2, 
  AlertTriangle, 
  Plus, 
  Trash2, 
  Edit3,
  Calendar, 
  CreditCard,
  X,
  Download,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "react-hot-toast";
import { financePaymentApi } from "@/services/modules";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ConfirmDialog } from "@/components/shared/confirmDialog";
import { useERPStore } from "@/store/erpStore";
import { canPerformPageAction } from "@/utils/pagePermissions";

interface PaymentEntry {
  id: string;
  amount: number;
  mode: string;
  ref: string;
  date: string;
  note: string;
}

interface OrderInfo {
  id: string;
  dveplCode: string;
  customerName: string;
  vendorName: string;
  orderDate: string;
  totalAmount: number;
  received: number;
  balance: number;
  status: "pending" | "in-progress" | "completed" | "on-hold";
  paymentCount: number;
}

export default function PaymentHistoryPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const store = useERPStore();
  const currentUser = store.users?.find((u: any) => u.id === store.currentUserId) as any;
  const canCreate = canPerformPageAction(currentUser?.actionPermissions, "finance", "create");
  const canEdit = canPerformPageAction(currentUser?.actionPermissions, "finance", "edit");
  const canDelete = canPerformPageAction(currentUser?.actionPermissions, "finance", "delete");

  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Add Form State
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState("NEFT");
  const [payRef, setPayRef] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payNote, setPayNote] = useState("");

  // Edit Form Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<PaymentEntry | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editMode, setEditMode] = useState("");
  const [editRef, setEditRef] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");

  // Pagination
  const [pageSize, setPageSize] = useState<number>(() => {
    if (typeof window === "undefined") return 10;
    try {
      const saved = window.localStorage.getItem("dvepl-page-size:paymenthistory");
      return saved ? parseInt(saved, 10) : 10;
    } catch {
      return 10;
    }
  });
  const [customPageSize, setCustomPageSize] = useState<string>(String(pageSize));
  const [historyPage, setHistoryPage] = useState(1);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("dvepl-page-size:paymenthistory", String(pageSize));
      } catch {
        // fail silently
      }
    }
  }, [pageSize]);

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

  const formatCurrency = (val: number) =>
    val.toLocaleString("en-IN", { maximumFractionDigits: 0, style: "currency", currency: "INR" });

  // --- PDF Download ---
  const downloadPDF = () => {
    if (!orderInfo) return;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const now = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

    // Header bar
    doc.setFillColor(30, 64, 175); // primary blue
    doc.rect(0, 0, pageWidth, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("DVEPL — Payment Receipt Ledger", 14, 14);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${now}`, pageWidth - 14, 14, { align: "right" });

    // Order Info block
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`Order: ${orderInfo.dveplCode}`, 14, 32);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Client: ${orderInfo.customerName}`, 14, 39);
    doc.text(`Vendor: ${orderInfo.vendorName}`, 14, 45);
    doc.text(`Order Date: ${orderInfo.orderDate}`, 14, 51);
    doc.text(`Status: ${orderInfo.status.replace("-", " ").toUpperCase()}`, 14, 57);

    // Summary box (right side)
    const totalAmount = orderInfo.totalAmount;
    const received = orderInfo.received;
    const balance = orderInfo.balance;
    const pct = totalAmount > 0 ? ((received / totalAmount) * 100).toFixed(1) : "0.0";

    doc.setFillColor(245, 247, 250);
    doc.roundedRect(pageWidth - 80, 28, 66, 34, 3, 3, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text("Total Amount", pageWidth - 76, 35);
    doc.text("Received", pageWidth - 76, 43);
    doc.text("Balance", pageWidth - 76, 51);
    doc.text("Collected", pageWidth - 76, 59);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
    doc.text(`Rs. ${totalAmount.toLocaleString("en-IN")}`, pageWidth - 16, 35, { align: "right" });
    doc.setTextColor(16, 120, 60);
    doc.text(`Rs. ${received.toLocaleString("en-IN")}`, pageWidth - 16, 43, { align: "right" });
    doc.setTextColor(balance === 0 ? 16 : 185, balance === 0 ? 120 : 28, balance === 0 ? 60 : 28);
    doc.text(balance === 0 ? "FULLY PAID" : `Rs. ${balance.toLocaleString("en-IN")}`, pageWidth - 16, 51, { align: "right" });
    doc.setTextColor(30, 64, 175);
    doc.text(`${pct}%`, pageWidth - 16, 59, { align: "right" });

    // Divider
    doc.setDrawColor(220, 220, 230);
    doc.line(14, 66, pageWidth - 14, 66);

    // Table
    autoTable(doc, {
      startY: 70,
      head: [["#", "Date", "Mode", "Reference No", "Note / Remarks", "Amount (Rs.)"]],
      body: payments.map((p, i) => [
        i + 1,
        p.date,
        p.mode,
        p.ref,
        p.note || "—",
        Number(p.amount).toLocaleString("en-IN")
      ]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 249, 252] },
      columnStyles: { 5: { halign: "right", fontStyle: "bold" } },
      foot: [["", "", "", "", "Total Received", `Rs. ${received.toLocaleString("en-IN")}`]],
      footStyles: { fillColor: [16, 120, 60], textColor: 255, fontStyle: "bold" },
    });

    // Footer
    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text("This is a computer-generated document. DVEPL — Confidential.", pageWidth / 2, finalY, { align: "center" });

    doc.save(`Payment_Ledger_${orderInfo.dveplCode}_${orderInfo.customerName.replace(/\s+/g, "_")}.pdf`);
    toast.success("Payment ledger downloaded as PDF.");
  };

  // Load order header info and payment history
  const loadData = async () => {
    if (!orderId) return;
    setIsLoading(true);
    try {
      // 1. Get order summary (from the /orders endpoint)
      const ordersRes = await financePaymentApi.getOrders({ limit: 500 });
      if (!ordersRes?.success) {
        toast.error("Failed to load order details.");
        navigate("/finance");
        return;
      }
      const matched = (ordersRes.data as OrderInfo[]).find((o) => o.id === orderId);
      if (!matched) {
        toast.error("Order not found.");
        navigate("/finance");
        return;
      }
      setOrderInfo(matched);

      // 2. Get payment history for this order
      const paymentsRes = await financePaymentApi.getPayments(orderId);
      if (paymentsRes?.success) {
        setPayments(paymentsRes.data || []);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Error loading payment data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [orderId]);

  // Add installment via API
  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderInfo) return;

    const amountNum = Number(payAmount);
    if (!payAmount || isNaN(amountNum) || amountNum <= 0) {
      toast.error("Please enter a valid payment amount.");
      return;
    }

    if (amountNum > orderInfo.balance) {
      toast.error(`Amount cannot exceed outstanding balance of ${formatCurrency(orderInfo.balance)}`);
      return;
    }

    setIsSaving(true);
    try {
      const res = await financePaymentApi.createPayment({
        salesOrderId: orderInfo.id,
        amount: amountNum,
        paymentMethod: payMode,
        referenceNo: payRef || undefined,
        paymentDate: payDate || undefined,
        remarks: payNote || undefined,
      });

      if (res?.success) {
        toast.success("Installment payment recorded.");
        setPayAmount("");
        setPayRef("");
        setPayNote("");
        setPayDate("");
        setHistoryPage(1);
        await loadData(); // refresh totals & list
      } else {
        toast.error(res?.message || "Failed to record payment.");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Error recording payment.");
    } finally {
      setIsSaving(false);
    }
  };

  // Trigger Edit modal
  const openEditModal = (entry: PaymentEntry) => {
    setEditingPayment(entry);
    setEditAmount(String(entry.amount));
    setEditMode(entry.mode);
    setEditRef(entry.ref === "N/A" ? "" : entry.ref);
    setEditDate(entry.date);
    setEditNote(entry.note);
    setIsEditModalOpen(true);
  };

  const handleUpdatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayment) return;

    const editAmountNum = Number(editAmount);
    if (!editAmount || isNaN(editAmountNum) || editAmountNum <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }

    setIsSaving(true);
    try {
      const res = await financePaymentApi.updatePayment(editingPayment.id, {
        amount: editAmountNum,
        paymentMethod: editMode,
        referenceNo: editRef || undefined,
        paymentDate: editDate || undefined,
        remarks: editNote || undefined,
      });

      if (res?.success) {
        toast.success("Payment entry details updated successfully.");
        setIsEditModalOpen(false);
        setEditingPayment(null);
        await loadData();
      } else {
        toast.error(res?.message || "Failed to update payment.");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Error updating payment.");
    } finally {
      setIsSaving(false);
    }
  };

  // Revert/Delete Payment via API
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false);
  const [paymentToRevert, setPaymentToRevert] = useState<string | null>(null);

  const handleDeletePayment = (entryId: string) => {
    setPaymentToRevert(entryId);
    setRevertConfirmOpen(true);
  };

  const confirmRevertPayment = async () => {
    if (!paymentToRevert) return;
    setIsSaving(true);
    try {
      const res = await financePaymentApi.deletePayment(paymentToRevert);
      if (res?.success) {
        toast.success("Payment receipt reverted successfully.");
        await loadData();
      } else {
        toast.error(res?.message || "Failed to revert payment.");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Error reverting payment.");
    } finally {
      setIsSaving(false);
      setPaymentToRevert(null);
    }
  };

  // Paginated history
  const totalHistoryPages = Math.max(1, Math.ceil(payments.length / pageSize));
  const paginatedPayments = useMemo(() => {
    const start = (historyPage - 1) * pageSize;
    return payments.slice(start, start + pageSize);
  }, [payments, historyPage, pageSize]);

  if (isLoading || !orderInfo) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <RefreshCw className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const percentCollected = orderInfo.totalAmount > 0 ? (orderInfo.received / orderInfo.totalAmount) * 100 : 0;
  const isFullyPaid = orderInfo.balance === 0;

  return (
    <>
    <div className="flex-1 flex flex-col p-6 space-y-6 bg-background overflow-y-auto">
      {/* Back Header */}
      <div className="flex items-center gap-4 border-b pb-4">
        <Button 
          variant="outline" 
          size="icon" 
          onClick={() => navigate("/finance")}
          className="h-9 w-9 rounded-lg hover:bg-muted"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Payment History Ledger
          </h1>
          <p className="text-xs text-muted-foreground">
            View transaction installments, record payments, and edit receipt ledgers.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} className="h-9 text-xs gap-1.5">
          <RefreshCw className="size-3.5" /> Refresh
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={downloadPDF}
          disabled={payments.length === 0}
          className="h-9 text-xs gap-1.5 border-emerald-500/50 text-emerald-600 hover:bg-emerald-500 hover:text-white"
        >
          <Download className="size-3.5" /> Download PDF
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Card: Order Stats Card */}
        <div className="lg:col-span-1 space-y-5">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <div className="border-b pb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Sales Order Contract</span>
              <h3 className="text-sm font-bold text-foreground mt-0.5">{orderInfo.dveplCode}</h3>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Client Name:</span>
                <span className="font-semibold text-foreground text-right">{orderInfo.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Assigned Vendor:</span>
                <span className="font-semibold text-foreground">{orderInfo.vendorName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contract Date:</span>
                <span className="font-medium">{orderInfo.orderDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order Status:</span>
                <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                  orderInfo.status === "completed"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : orderInfo.status === "in-progress"
                    ? "bg-primary/10 text-primary"
                    : "bg-amber-500/10 text-amber-600"
                }`}>
                  {orderInfo.status}
                </span>
              </div>
            </div>

            <div className="pt-4 border-t space-y-3">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[9px] font-bold uppercase text-muted-foreground">Total Revenue</p>
                  <p className="font-mono font-bold text-foreground text-sm">{formatCurrency(orderInfo.totalAmount)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-bold uppercase text-emerald-600">Total Collected</p>
                  <p className="font-mono font-bold text-emerald-600 text-sm">{formatCurrency(orderInfo.received)}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] text-muted-foreground font-medium">
                  <span>Billing Collection Ratio</span>
                  <span>{percentCollected.toFixed(0)}%</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden border">
                  <div 
                    className={`h-full rounded-full transition-all ${isFullyPaid ? "bg-emerald-500" : "bg-primary"}`}
                    style={{ width: `${percentCollected}%` }}
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Outstanding Balance:</span>
                <span className={`font-mono font-bold ${isFullyPaid ? "text-emerald-500" : "text-rose-500"} text-sm`}>
                  {isFullyPaid ? "Fully Paid" : formatCurrency(orderInfo.balance)}
                </span>
              </div>
            </div>
          </div>

          {/* Add Installment Form Card */}
          {orderInfo.balance > 0 && canCreate ? (
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Plus className="size-4 text-primary" /> Record Installment Receipt
              </h4>
              <form onSubmit={handleAddPayment} className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground">Amount (₹) *</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 50000"
                    min="1"
                    max={orderInfo.balance}
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="h-9 text-xs"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground">Payment Mode</Label>
                  <select
                    value={payMode}
                    onChange={(e) => setPayMode(e.target.value)}
                    className="w-full h-9 px-2.5 border rounded-lg text-xs bg-background text-foreground outline-none"
                  >
                    <option value="CASH">Cash</option>
                    <option value="NEFT">NEFT</option>
                    <option value="RTGS">RTGS</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="UPI">UPI</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground">Reference / UTR / Check No</Label>
                  <Input
                    type="text"
                    placeholder="Ref or UTR Transaction ID"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground">Receipt Settlement Date</Label>
                  <Input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground">Voucher Note</Label>
                  <Input
                    type="text"
                    placeholder="Optional details..."
                    value={payNote}
                    onChange={(e) => setPayNote(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="w-full h-9 text-xs font-semibold gap-1.5 mt-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isSaving ? <RefreshCw className="size-3.5 animate-spin" /> : <Plus className="size-4" />}
                  {isSaving ? "Saving..." : "Save Receipt"}
                </Button>
              </form>
            </div>
          ) : (
            <div className="rounded-xl border bg-emerald-500/10 border-emerald-500/25 p-5 text-center text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              🎉 This Sales Order is fully settled. No outstanding invoices pending collection.
            </div>
          )}
        </div>

        {/* Right Columns: Payments History Log list */}
        <div className="lg:col-span-2 space-y-4">
          {/* Pagination Controls */}
          {payments.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Page Numbers Navigation Pill */}
                <div className="flex items-center gap-1 bg-muted/60 border border-border/70 p-1 h-11 rounded-xl shadow-xs">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card border border-transparent hover:border-border/30 hover:shadow-3xs transition-all duration-150 disabled:opacity-30 disabled:pointer-events-none"
                    onClick={() => setHistoryPage((prev) => Math.max(prev - 1, 1))}
                    disabled={historyPage === 1}
                  >
                    <ChevronLeft className="h-4.5 w-4.5" />
                  </Button>

                  <div className="flex items-center gap-1">
                    {getVisiblePages(historyPage, totalHistoryPages).map((page, index) => {
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
                      const isCurrent = page === historyPage;
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
                          onClick={() => setHistoryPage(page as number)}
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
                    onClick={() => setHistoryPage((prev) => Math.min(prev + 1, totalHistoryPages))}
                    disabled={historyPage === totalHistoryPages}
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
                          setPageSize(valNum);
                        }
                      }
                    }}
                    onBlur={() => {
                      if (!customPageSize || parseInt(customPageSize, 10) <= 0) {
                        setPageSize(10);
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
                      setPageSize(payments.length || Number.MAX_SAFE_INTEGER);
                      setCustomPageSize(String(payments.length || Number.MAX_SAFE_INTEGER));
                    }}
                  >
                    Show All
                  </button>
                </div>
              </div>

              <span className="text-xs text-muted-foreground font-medium">
                Showing {(historyPage - 1) * pageSize + 1} to{" "}
                {Math.min(historyPage * pageSize, payments.length)} of {payments.length} entries
              </span>
            </div>
          )}

          <div className="rounded-xl border bg-card p-5 space-y-4 min-h-[450px] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-foreground">Voucher Installment Entries</h3>
              <span className="text-[10px] font-bold uppercase bg-muted px-2 py-0.5 rounded text-muted-foreground">
                {payments.length} Record{payments.length !== 1 ? "s" : ""}
              </span>
            </div>

            {payments.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-dashed rounded-xl">
                <CreditCard className="size-8 text-muted-foreground/60 mb-2" />
                <h4 className="text-xs font-bold text-foreground">No Payment Vouchers Found</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">Use the installment form on the left to capture payment deposits.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border rounded-lg bg-card">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-card border-b text-muted-foreground font-semibold shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)]">
                    <tr>
                      <th className="py-2.5 px-3.5 text-center bg-muted/90 backdrop-blur-xs">#</th>
                      <th className="py-2.5 px-3.5 bg-muted/90 backdrop-blur-xs">Settlement Date</th>
                      <th className="py-2.5 px-3.5 bg-muted/90 backdrop-blur-xs">Payment Mode</th>
                      <th className="py-2.5 px-3.5 bg-muted/90 backdrop-blur-xs">Reference No</th>
                      <th className="py-2.5 px-3.5 bg-muted/90 backdrop-blur-xs">Note/Remarks</th>
                      <th className="py-2.5 px-3.5 text-right bg-muted/90 backdrop-blur-xs">Amount Billed</th>
                      <th className="py-2.5 px-3.5 text-center bg-muted/90 backdrop-blur-xs">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {paginatedPayments.map((pay, i) => {
                      const globalIdx = (historyPage - 1) * pageSize + i + 1;
                      return (
                      <tr key={pay.id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-3.5 text-center text-muted-foreground font-medium">{globalIdx}</td>
                        <td className="py-3 px-3.5 font-medium">{pay.date}</td>
                        <td className="py-3 px-3.5">
                          <span className="inline-block bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold uppercase text-[9px]">
                            {pay.mode}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 font-mono text-muted-foreground">{pay.ref}</td>
                        <td className="py-3 px-3.5 italic text-muted-foreground max-w-[150px] truncate" title={pay.note}>
                          {pay.note || "—"}
                        </td>
                        <td className="py-3 px-3.5 text-right font-bold font-mono text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(pay.amount)}
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <div className="flex justify-center items-center gap-1">
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={isSaving}
                                onClick={() => openEditModal(pay)}
                                className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/5"
                              >
                                <Edit3 className="size-3.5" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={isSaving}
                                onClick={() => handleDeletePayment(pay.id)}
                                className="h-7 w-7 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/5"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Edit Payment Modal Popup */}
      {isEditModalOpen && editingPayment && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border w-full max-w-md rounded-xl shadow-lg flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b px-5 py-4 bg-muted/20">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                ✏️ Edit Payment Receipt
              </h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsEditModalOpen(false)}
                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </Button>
            </div>

            <form onSubmit={handleUpdatePayment}>
              <div className="p-5 space-y-3 text-xs">
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground">Amount (₹) *</Label>
                  <Input
                    type="number"
                    min="1"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="h-9 text-xs"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground">Payment Mode</Label>
                  <select
                    value={editMode}
                    onChange={(e) => setEditMode(e.target.value)}
                    className="w-full h-9 px-2.5 border rounded-lg text-xs bg-background text-foreground outline-none"
                  >
                    <option value="CASH">Cash</option>
                    <option value="NEFT">NEFT</option>
                    <option value="RTGS">RTGS</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="UPI">UPI</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground">Reference / UTR / Check No</Label>
                  <Input
                    type="text"
                    value={editRef}
                    onChange={(e) => setEditRef(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground">Payment Date</Label>
                  <Input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground">Voucher Note</Label>
                  <Input
                    type="text"
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t px-5 py-3.5 bg-muted/20">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsEditModalOpen(false)} className="h-9 text-xs">
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving} size="sm" className="h-9 text-xs bg-primary hover:bg-primary-dark text-white">
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>

      <ConfirmDialog
        open={revertConfirmOpen}
        onOpenChange={setRevertConfirmOpen}
        title="Revert Payment Receipt"
        description="This payment record will be reverted and removed from the payment history. The order balance will be recalculated."
        confirmText="Revert Payment"
        variant="warning"
        onConfirm={confirmRevertPayment}
      />
    </>
  );
}
