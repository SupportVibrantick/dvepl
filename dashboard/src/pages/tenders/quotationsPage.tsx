import React, { useEffect, useState, useMemo } from 'react';
import { GenericTable, sortableHeader } from '@/components/tables/genericTable';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { crmApi, tenderApi, hrmsApi, quotationApi } from '@/services/modules';
import { useAuth } from '@/contexts/authContext';
import { toast } from 'react-hot-toast';
import { 
  Plus, 
  Trash2, 
  FileText, 
  Send, 
  Check, 
  X, 
  RefreshCw, 
  MessageSquare, 
  History, 
  UserCheck, 
  Calculator, 
  ArrowLeft,
  Loader2
} from 'lucide-react';
import { ColumnDef } from '@tanstack/react-table';
import { ConfirmDialog } from '@/components/shared/confirmDialog';
import { useERPStore } from '@/store/erpStore';
import { canPerformPageAction } from '@/utils/pagePermissions';

interface QuotationItemInput {
  slNo: number;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  hsn: string;
  gstRate: number;
  remarks: string;
}

export function QuotationsPage() {
  const { user } = useAuth();
  const store = useERPStore();
  const currentUser = store.users?.find((u: any) => u.id === store.currentUserId) as any;
  const canCreate = canPerformPageAction(currentUser?.actionPermissions, "quotations", "create");
  const canEdit = canPerformPageAction(currentUser?.actionPermissions, "quotations", "edit");
  const canDelete = canPerformPageAction(currentUser?.actionPermissions, "quotations", "delete");
  const [quotations, setQuotations] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [tenders, setTenders] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Drawer / Dialog states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isResponseDialogOpen, setIsResponseDialogOpen] = useState(false);
  const [isRevisionDialogOpen, setIsRevisionDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [quotationToDelete, setQuotationToDelete] = useState<any | null>(null);

  // Selected records
  const [editingQuotation, setEditingQuotation] = useState<any | null>(null);
  const [selectedQuotation, setSelectedQuotation] = useState<any | null>(null);

  // Dialog inputs
  const [customerResponse, setCustomerResponse] = useState('ACCEPTED');
  const [customerRemarks, setCustomerRemarks] = useState('');
  const [revisionNotes, setRevisionNotes] = useState('');
  const [revisionWarranty, setRevisionWarranty] = useState('12');

  // Form values state
  const [formValues, setFormValues] = useState({
    customerId: '',
    tenderId: '',
    materialCost: 0,
    labourCost: 0,
    transportCost: 0,
    taxes: 0,
    discount: 0,
    margin: 0,
    validityDays: 30,
    paymentTerms: '',
    deliveryDays: 15,
    warrantyMonths: 12,
    specialTerms: '',
    notes: '',
    approvalRequired: true,
  });

  const selectedCustomerLabel = useMemo(() => {
    const custId = formValues.customerId;
    if (!custId) return undefined;
    const customer = customers.find(c => c.id === custId);
    return customer ? customer.name : undefined;
  }, [formValues.customerId, customers]);

  const selectedTenderProjectLabel = useMemo(() => {
    const tId = formValues.tenderId;
    if (!tId) return undefined;
    if (tId === "none") return "None";
    const tender = tenders.find(t => t.id === tId);
    return tender ? tender.title : undefined;
  }, [formValues.tenderId, tenders]);

  const [formItems, setFormItems] = useState<QuotationItemInput[]>([]);

  // Approval form state
  const [approvalRemarks, setApprovalRemarks] = useState('');
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [quoList, custList, tenderList, empList] = await Promise.all([
        quotationApi.quotations.list(),
        crmApi.customers.list(),
        Promise.resolve([]),
        hrmsApi.employees.list()
      ]);
      setQuotations(quoList);
      setCustomers(custList);
      setTenders(tenderList);
      setEmployees(empList);
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to load details.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const loadSingleQuotation = async (id: string) => {
    try {
      const detail = await quotationApi.quotations.read(id);
      setSelectedQuotation(detail);
    } catch (err) {
      console.error(err);
    }
  };

  // Cost calculator
  const calculatedTotal = Number(formValues.materialCost) + 
                          Number(formValues.labourCost) + 
                          Number(formValues.transportCost) + 
                          Number(formValues.taxes) + 
                          Number(formValues.margin) - 
                          Number(formValues.discount);

  const handleAddRow = () => {
    setFormItems([
      ...formItems,
      {
        slNo: formItems.length + 1,
        description: '',
        unit: 'NOS',
        quantity: 1,
        unitPrice: 0,
        hsn: '',
        gstRate: 18,
        remarks: ''
      }
    ]);
  };

  const handleRemoveRow = (index: number) => {
    const updated = formItems.filter((_, idx) => idx !== index).map((item, idx) => ({
      ...item,
      slNo: idx + 1
    }));
    setFormItems(updated);
  };

  const handleItemChange = (index: number, field: keyof QuotationItemInput, value: any) => {
    const updated = [...formItems];
    updated[index] = {
      ...updated[index],
      [field]: value
    };
    setFormItems(updated);
  };

  const openCreateMode = () => {
    setEditingQuotation(null);
    setFormValues({
      customerId: customers[0]?.id ?? '',
      tenderId: tenders[0]?.id ?? '',
      materialCost: 0,
      labourCost: 0,
      transportCost: 0,
      taxes: 0,
      discount: 0,
      margin: 0,
      validityDays: 30,
      paymentTerms: '',
      deliveryDays: 15,
      warrantyMonths: 12,
      specialTerms: '',
      notes: '',
      approvalRequired: true,
    });
    setFormItems([
      { slNo: 1, description: 'Electrical switchgear distribution panel', unit: 'NOS', quantity: 1, unitPrice: 0, hsn: '8537', gstRate: 18, remarks: '' }
    ]);
    setIsFormOpen(true);
  };

  const openEditMode = (record: any) => {
    setEditingQuotation(record);
    
    let valDays = record.validityDays;
    if (!valDays && record.validUntil) {
      const diffTime = new Date(record.validUntil).getTime() - new Date(record.createdAt ?? Date.now()).getTime();
      valDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }
    if (!valDays) valDays = 30;

    setFormValues({
      customerId: record.customerId,
      tenderId: record.tenderId ?? '',
      materialCost: Number(record.materialCost),
      labourCost: Number(record.labourCost),
      transportCost: Number(record.transportCost ?? record.transportation ?? 0),
      taxes: Number(record.taxes ?? record.gst ?? 0),
      discount: Number(record.discount),
      margin: Number(record.margin ?? record.profitMargin ?? 0),
      validityDays: Number(valDays),
      paymentTerms: record.paymentTerms ?? '',
      deliveryDays: record.deliveryDays ?? 15,
      warrantyMonths: record.warrantyMonths ?? 12,
      specialTerms: record.specialTerms ?? record.remarks ?? '',
      notes: record.notes ?? '',
      approvalRequired: record.approvalRequired ?? true,
    });
    // Load nested items
    const items = (record.items ?? []).map((item: any) => ({
      slNo: item.slNo,
      description: item.description,
      unit: item.unit ?? 'NOS',
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      hsn: item.hsn ?? '',
      gstRate: Number(item.gstRate ?? 18),
      remarks: item.remarks ?? ''
    }));
    setFormItems(items.length > 0 ? items : [
      { slNo: 1, description: 'Electrical switchgear distribution panel', unit: 'NOS', quantity: 1, unitPrice: 0, hsn: '8537', gstRate: 18, remarks: '' }
    ]);
    setIsFormOpen(true);
  };

  const handleSaveQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValues.customerId) {
      toast.error('Select a Customer account.');
      return;
    }
    if (formItems.some(item => !item.description.trim())) {
      toast.error('Each line item requires a description.');
      return;
    }

    const payload = {
      ...formValues,
      // Database model alignment
      transportation: Number(formValues.transportCost),
      gst: Number(formValues.taxes),
      profitMargin: Number(formValues.margin),
      validUntil: new Date(Date.now() + Number(formValues.validityDays) * 24 * 60 * 60 * 1000).toISOString(),
      remarks: formValues.specialTerms || formValues.notes || null,
      finalAmount: calculatedTotal,

      // UI state / local compatibility
      totalValue: calculatedTotal,
      tenderId: formValues.tenderId || null,
      materialCost: Number(formValues.materialCost),
      labourCost: Number(formValues.labourCost),
      transportCost: Number(formValues.transportCost),
      taxes: Number(formValues.taxes),
      discount: Number(formValues.discount),
      margin: Number(formValues.margin),
      validityDays: Number(formValues.validityDays),
      deliveryDays: Number(formValues.deliveryDays),
      warrantyMonths: Number(formValues.warrantyMonths),
      items: formItems.map(item => ({
        slNo: item.slNo,
        description: item.description,
        unit: item.unit,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        hsn: item.hsn || null,
        gstRate: Number(item.gstRate),
        remarks: item.remarks || null
      }))
    };

    try {
      if (editingQuotation) {
        await quotationApi.quotations.update!(editingQuotation.id, payload);
        toast.success('Quotation updated successfully.');
      } else {
        await quotationApi.quotations.create(payload);
        toast.success('Quotation created successfully.');
      }
      setIsFormOpen(false);
      await loadAllData();
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to save quotation.');
    }
  };

  const handleSubmitWorkflow = async (id: string) => {
    try {
      await quotationApi.quotations.submit(id);
      toast.success('Submitted for approvals successfully.');
      await loadAllData();
      await loadSingleQuotation(id);
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to submit.');
    }
  };

  const handleSendCustomer = async (id: string) => {
    try {
      await quotationApi.quotations.send(id);
      toast.success('Marked sent to customer.');
      await loadAllData();
      await loadSingleQuotation(id);
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed.');
    }
  };

  const handleRecordResponse = async () => {
    if (!selectedQuotation) return;
    try {
      await quotationApi.quotations.respond(selectedQuotation.id, {
        response: customerResponse,
        remarks: customerRemarks
      });
      toast.success('Customer response logged.');
      setIsResponseDialogOpen(false);
      await loadAllData();
      await loadSingleQuotation(selectedQuotation.id);
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed.');
    }
  };

  const handleCreateRevision = async () => {
    if (!selectedQuotation) return;
    try {
      await quotationApi.quotations.revise(selectedQuotation.id, {
        warrantyMonths: Number(revisionWarranty),
        notes: revisionNotes
      });
      toast.success('Revision created successfully.');
      setIsRevisionDialogOpen(false);
      setIsDetailOpen(false);
      await loadAllData();
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to revise.');
    }
  };

  const handleDecideApproval = async (status: 'APPROVED' | 'REJECTED') => {
    if (!selectedQuotation) return;
    const currentApproval = selectedQuotation.approvals?.find(
      (a: any) => a.approverId === user?.id && a.status === 'PENDING'
    );
    if (!currentApproval) {
      toast.error('No pending approval step matches your account.');
      return;
    }

    setIsSubmittingApproval(true);
    try {
      await quotationApi.approvals.update!(currentApproval.id, {
        status,
        remarks: approvalRemarks
      });
      toast.success(`Marked step as ${status}.`);
      setApprovalRemarks('');
      await loadAllData();
      await loadSingleQuotation(selectedQuotation.id);
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed.');
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  const columns: ColumnDef<any>[] = [
    { accessorKey: 'quotationNo', header: sortableHeader('Quotation No') },
    { accessorKey: 'revisionNo', header: sortableHeader('Rev') },
    {
      accessorKey: 'customerId',
      header: 'Client Partner',
      cell: ({ row }) => row.original.customer?.name || '—'
    },
    {
      accessorKey: 'tenderId',
      header: 'Linked Tender',
      cell: ({ row }) => row.original.tender?.title || 'None'
    },
    {
      accessorKey: 'totalValue',
      header: 'Total Value',
      cell: ({ getValue }) => `₹${Number(getValue() || 0).toLocaleString()}`
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => {
        const val = getValue() as string;
        return (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            val === 'DRAFT' ? 'bg-slate-500/10 text-slate-500 border border-slate-500/20' : 
            val === 'PENDING_APPROVAL' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 
            val === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 
            val === 'SENT' ? 'bg-primary/10 text-primary border border-primary/20' : 
            val === 'NEGOTIATING' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' : 
            val === 'REVISED' ? 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20' : 
            'bg-muted text-muted-foreground border border-border'
          }`}>
            {val}
          </span>
        );
      }
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quotations Pipeline</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage and revise bidding quotations with sequential approvals.</p>
        </div>
        {canCreate && (
          <Button onClick={openCreateMode} className="gap-2">
            <Plus className="size-4" /> Add Quotation
          </Button>
        )}
      </div>

      {/* Main Table */}
      <GenericTable
        columns={columns}
        data={quotations}
        onView={async (row) => {
          setIsLoading(true);
          try {
            const detail = await quotationApi.quotations.read(row.id);
            setSelectedQuotation(detail);
            setIsDetailOpen(true);
          } catch (err: any) {
            toast.error(err.response?.data?.message ?? 'Failed to load quotation details.');
          } finally {
            setIsLoading(false);
          }
        }}
        onEdit={canEdit ? (row) => {
          if (row.frozenAt) {
            toast.error('This quotation is approved and frozen. Cannot edit.');
            return;
          }
          openEditMode(row);
        } : undefined}
        onDelete={canDelete ? (row) => {
          setQuotationToDelete(row);
          setDeleteConfirmOpen(true);
        } : undefined}
        isLoading={isLoading}
        storageKey="quotations"
      />

      {/* 1. CREATE / EDIT SHEET */}
      <Sheet open={isFormOpen} onOpenChange={setIsFormOpen}>
        <SheetContent side="right" className="w-full max-w-xl data-[side=right]:sm:max-w-2xl overflow-y-auto p-6 flex flex-col gap-5 border-l">
          <SheetHeader className="border-b pb-4">
            <SheetTitle>{editingQuotation ? 'Update Quotation' : 'Create New Quotation'}</SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSaveQuotation} className="space-y-6 flex-1">
            <div className="grid grid-cols-1 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-bold text-muted-foreground uppercase">Client Partner *</Label>
                <Select value={formValues.customerId} onValueChange={(val) => setFormValues(prev => ({ ...prev, customerId: val || '' }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Client">
                      {selectedCustomerLabel}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-bold text-muted-foreground uppercase">Linked Tender Project</Label>
                <Select value={formValues.tenderId} onValueChange={(val) => setFormValues(prev => ({ ...prev, tenderId: val || '' }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Tender (Optional)">
                      {selectedTenderProjectLabel}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {tenders.map(t => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="h-px bg-border my-2" />
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
              <Calculator className="size-4 text-primary" /> Cost breakdowns & markup
            </h3>

            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] font-bold text-muted-foreground">Material Cost (INR)</Label>
                <Input type="number" value={formValues.materialCost} onChange={(e) => setFormValues(prev => ({ ...prev, materialCost: Number(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] font-bold text-muted-foreground">Labour Cost (INR)</Label>
                <Input type="number" value={formValues.labourCost} onChange={(e) => setFormValues(prev => ({ ...prev, labourCost: Number(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] font-bold text-muted-foreground">Transport Cost (INR)</Label>
                <Input type="number" value={formValues.transportCost} onChange={(e) => setFormValues(prev => ({ ...prev, transportCost: Number(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] font-bold text-muted-foreground">Taxes & Duties (INR)</Label>
                <Input type="number" value={formValues.taxes} onChange={(e) => setFormValues(prev => ({ ...prev, taxes: Number(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] font-bold text-muted-foreground">Discount Allowed (INR)</Label>
                <Input type="number" value={formValues.discount} onChange={(e) => setFormValues(prev => ({ ...prev, discount: Number(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] font-bold text-muted-foreground">Markup Margin (INR)</Label>
                <Input type="number" value={formValues.margin} onChange={(e) => setFormValues(prev => ({ ...prev, margin: Number(e.target.value) }))} />
              </div>
            </div>

            <div className="rounded-lg bg-primary/5 border border-primary/10 p-3 flex justify-between items-center text-sm font-semibold">
              <span className="text-muted-foreground">Document Stored Total:</span>
              <span className="text-primary text-base font-bold">₹{calculatedTotal.toLocaleString()}</span>
            </div>

            <div className="h-px bg-border my-2" />
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">BOQ Line items</h3>
              <Button type="button" variant="outline" size="sm" onClick={handleAddRow} className="h-8 gap-1.5 text-xs">
                <Plus className="size-3.5" /> Add Row
              </Button>
            </div>

            <div className="border rounded-lg overflow-hidden bg-card text-xs">
              <table className="w-full">
                <thead className="bg-muted text-muted-foreground font-semibold">
                  <tr className="border-b">
                    <th className="p-2 text-center w-12">Sl</th>
                    <th className="p-2 text-left">Description</th>
                    <th className="p-2 text-center w-16">Unit</th>
                    <th className="p-2 text-right w-16">Qty</th>
                    <th className="p-2 text-right w-24">Price (₹)</th>
                    <th className="p-2 text-center w-16">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {formItems.map((item, index) => (
                    <tr key={index} className="border-b border-border/40 hover:bg-muted/10">
                      <td className="p-2 text-center text-muted-foreground">{item.slNo}</td>
                      <td className="p-2">
                        <Input value={item.description} onChange={(e) => handleItemChange(index, 'description', e.target.value)} className="h-7 text-xs" placeholder="e.g. Copper busbars link" />
                      </td>
                      <td className="p-2">
                        <Input value={item.unit} onChange={(e) => handleItemChange(index, 'unit', e.target.value)} className="h-7 text-xs text-center" />
                      </td>
                      <td className="p-2">
                        <Input type="number" value={item.quantity} onChange={(e) => handleItemChange(index, 'quantity', Number(e.target.value))} className="h-7 text-xs text-right" />
                      </td>
                      <td className="p-2">
                        <Input type="number" value={item.unitPrice} onChange={(e) => handleItemChange(index, 'unitPrice', Number(e.target.value))} className="h-7 text-xs text-right" />
                      </td>
                      <td className="p-2 text-center">
                        <Button type="button" variant="ghost" onClick={() => handleRemoveRow(index)} className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase">Payment Terms</Label>
                <Input value={formValues.paymentTerms} onChange={(e) => setFormValues(prev => ({ ...prev, paymentTerms: e.target.value }))} placeholder="e.g. 30% advance" />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase">Validity Days</Label>
                <Input type="number" value={formValues.validityDays} onChange={(e) => setFormValues(prev => ({ ...prev, validityDays: Number(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase">Warranty Months</Label>
                <Input type="number" value={formValues.warrantyMonths} onChange={(e) => setFormValues(prev => ({ ...prev, warrantyMonths: Number(e.target.value) }))} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase">Delivery (Days)</Label>
                <Input type="number" value={formValues.deliveryDays} onChange={(e) => setFormValues(prev => ({ ...prev, deliveryDays: Number(e.target.value) }))} />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-[10px] font-bold text-muted-foreground uppercase">Special Erection Terms</Label>
              <Textarea value={formValues.specialTerms} onChange={(e) => setFormValues(prev => ({ ...prev, specialTerms: e.target.value }))} className="min-h-[80px]" />
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-[10px] font-bold text-muted-foreground uppercase">Internal Estimator Notes</Label>
              <Textarea value={formValues.notes} onChange={(e) => setFormValues(prev => ({ ...prev, notes: e.target.value }))} className="min-h-[80px]" />
            </div>

            <div className="flex items-center gap-2.5 p-3 rounded-lg border border-border/80 bg-card hover:bg-card/85 transition-colors">
              <Checkbox id="approvalRequired" checked={formValues.approvalRequired} onCheckedChange={(checked) => setFormValues(prev => ({ ...prev, approvalRequired: Boolean(checked) }))} />
              <Label htmlFor="approvalRequired" className="text-xs font-bold text-muted-foreground uppercase cursor-pointer">Requires management review & approvals</Label>
            </div>

            <div className="border-t pt-4 flex justify-end gap-3 sticky bottom-0 bg-background pb-4">
              <Button type="button" variant="ghost" onClick={() => setIsFormOpen(false)}>Cancel</Button>
              <Button type="submit" className="shadow-xs">{editingQuotation ? 'Save changes' : 'Create Quotation'}</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* 2. MASTER-DETAIL SHOWN IN DETAIL DRAWER */}
      <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <SheetContent side="right" className="w-full max-w-xl data-[side=right]:sm:max-w-2xl overflow-y-auto p-6 flex flex-col gap-5 border-l">
          {selectedQuotation && (
            <>
              <SheetHeader className="border-b pb-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-muted-foreground">Quotation Details</span>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                    selectedQuotation.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 
                    selectedQuotation.status === 'PENDING_APPROVAL' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 
                    'bg-slate-500/10 text-slate-500 border border-slate-500/20'
                  }`}>{selectedQuotation.status}</span>
                </div>
                <SheetTitle className="text-xl font-bold">{selectedQuotation.quotationNo} (Rev {selectedQuotation.revisionNo})</SheetTitle>
              </SheetHeader>

              {/* ACTION TOOLBAR BAR */}
              <div className="flex flex-wrap gap-2.5 p-3 rounded-xl border bg-muted/20">
                {selectedQuotation.status === 'DRAFT' && (
                  <Button size="sm" className="gap-1.5 h-8 text-xs cursor-pointer" onClick={() => handleSubmitWorkflow(selectedQuotation.id)}>
                    <Send className="size-3.5" /> Submit for Approval
                  </Button>
                )}
                {selectedQuotation.status === 'APPROVED' && (
                  <Button size="sm" className="gap-1.5 h-8 text-xs cursor-pointer" onClick={() => handleSendCustomer(selectedQuotation.id)}>
                    <Send className="size-3.5" /> Mark Sent to Client
                  </Button>
                )}
                {(selectedQuotation.status === 'SENT' || selectedQuotation.status === 'NEGOTIATING') && (
                  <Button size="sm" className="gap-1.5 h-8 text-xs cursor-pointer" onClick={() => setIsResponseDialogOpen(true)}>
                    <MessageSquare className="size-3.5" /> Log Client Response
                  </Button>
                )}
                {['SENT', 'NEGOTIATING', 'ACCEPTED', 'REJECTED', 'APPROVED'].includes(selectedQuotation.status) && (
                  <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs cursor-pointer border-border" onClick={() => setIsRevisionDialogOpen(true)}>
                    <RefreshCw className="size-3.5 text-muted-foreground" /> Generate Revision
                  </Button>
                )}
              </div>

              {/* DETAIL TAB VIEWS */}
              <Tabs defaultValue="summary" className="w-full flex flex-col flex-1">
                <TabsList className="w-full grid grid-cols-4 bg-muted/40">
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="items">BOQ Items</TabsTrigger>
                  <TabsTrigger value="approvals">Approvals</TabsTrigger>
                  <TabsTrigger value="activities">History</TabsTrigger>
                </TabsList>

                {/* TAB 1: SUMMARY */}
                <TabsContent value="summary" className="py-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-muted-foreground uppercase text-[10px]">Client / Account</span>
                      <span className="font-semibold">{selectedQuotation.customer?.name}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-muted-foreground uppercase text-[10px]">Tender Link</span>
                      <span className="font-semibold">{selectedQuotation.tender?.title || 'None'}</span>
                    </div>
                  </div>

                  <div className="h-px bg-border my-2" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Commercial Summary</h4>
                  <div className="grid grid-cols-3 gap-3 text-xs bg-muted/10 p-3 rounded-lg border border-border/40">
                    <div>
                      <p className="text-muted-foreground">Material Cost</p>
                      <p className="font-semibold">₹{Number(selectedQuotation.materialCost || 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Labour Cost</p>
                      <p className="font-semibold">₹{Number(selectedQuotation.labourCost || 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Transport Cost</p>
                      <p className="font-semibold">₹{Number(selectedQuotation.transportCost ?? selectedQuotation.transportation ?? 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Taxes</p>
                      <p className="font-semibold">₹{Number(selectedQuotation.taxes ?? selectedQuotation.gst ?? 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Markup Margin</p>
                      <p className="font-semibold text-emerald-600 dark:text-emerald-400">₹{Number(selectedQuotation.margin ?? selectedQuotation.profitMargin ?? 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Discount</p>
                      <p className="font-semibold text-rose-600 dark:text-rose-400">₹{Number(selectedQuotation.discount || 0).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-sm font-bold bg-primary/5 p-3 rounded-lg border border-primary/10">
                    <span className="text-muted-foreground">Total Quotation Value:</span>
                    <span className="text-primary text-base font-extrabold">₹{Number(selectedQuotation.totalValue ?? selectedQuotation.finalAmount ?? 0).toLocaleString()}</span>
                  </div>

                  <div className="h-px bg-border my-2" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Agreement Parameters</h4>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-muted-foreground uppercase text-[10px] font-semibold">Payment Terms</span>
                      <p className="font-medium">{selectedQuotation.paymentTerms || '—'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground uppercase text-[10px] font-semibold">Validity</span>
                      <p className="font-medium">
                        {selectedQuotation.validityDays
                          ? `${selectedQuotation.validityDays} Days`
                          : selectedQuotation.validUntil
                          ? `${Math.max(
                              1,
                              Math.ceil(
                                (new Date(selectedQuotation.validUntil).getTime() -
                                  new Date(selectedQuotation.createdAt ?? Date.now()).getTime()) /
                                  (1000 * 60 * 60 * 24)
                              )
                            )} Days`
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground uppercase text-[10px] font-semibold">Warranty Scope</span>
                      <p className="font-medium">{selectedQuotation.warrantyMonths ? `${selectedQuotation.warrantyMonths} Months` : '—'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground uppercase text-[10px] font-semibold">Delivery Timeline</span>
                      <p className="font-medium">{selectedQuotation.deliveryDays ? `${selectedQuotation.deliveryDays} Days` : '—'}</p>
                    </div>
                  </div>

                  {(selectedQuotation.specialTerms || selectedQuotation.remarks) && (
                    <div className="text-xs bg-muted/10 p-2.5 rounded border">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">Special Erection details</span>
                      <p className="mt-1 font-medium whitespace-pre-line">{selectedQuotation.specialTerms ?? selectedQuotation.remarks}</p>
                    </div>
                  )}

                  {selectedQuotation.notes && (
                    <div className="text-xs bg-muted/10 p-2.5 rounded border">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground">Estimator Internal notes</span>
                      <p className="mt-1 font-medium whitespace-pre-line">{selectedQuotation.notes}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 text-[10px] text-muted-foreground pt-4 border-t">
                    <p>Created by: {selectedQuotation.createdBy?.name || 'System'}</p>
                    <p>Created: {new Date(selectedQuotation.createdAt).toLocaleString()}</p>
                  </div>
                </TabsContent>

                {/* TAB 2: BOQ ITEMS */}
                <TabsContent value="items" className="py-4">
                  <div className="border rounded-xl overflow-hidden bg-card text-xs">
                    <table className="w-full">
                      <thead className="bg-muted/70 text-muted-foreground font-semibold border-b">
                        <tr>
                          <th className="p-2.5 text-center w-12">Sl</th>
                          <th className="p-2.5 text-left">Description</th>
                          <th className="p-2.5 text-center w-16">Unit</th>
                          <th className="p-2.5 text-right w-16">Qty</th>
                          <th className="p-2.5 text-right w-24">Price (₹)</th>
                          <th className="p-2.5 text-right w-28">Total (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedQuotation.items?.map((item: any) => (
                          <tr key={item.id} className="border-b border-border/30 hover:bg-muted/10">
                            <td className="p-2.5 text-center text-muted-foreground font-medium">{item.slNo}</td>
                            <td className="p-2.5 font-medium">
                              <div>{item.description}</div>
                              {item.hsn && <span className="text-[9px] text-muted-foreground/60 uppercase">HSN: {item.hsn}</span>}
                            </td>
                            <td className="p-2.5 text-center font-medium">{item.unit || 'NOS'}</td>
                            <td className="p-2.5 text-right font-medium">{Number(item.quantity).toLocaleString()}</td>
                            <td className="p-2.5 text-right font-medium">₹{Number(item.unitPrice).toLocaleString()}</td>
                            <td className="p-2.5 text-right font-semibold text-primary">₹{Number(item.totalPrice).toLocaleString()}</td>
                          </tr>
                        ))}
                        {(!selectedQuotation.items || selectedQuotation.items.length === 0) && (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-muted-foreground font-medium">
                              No items registered on this quotation.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                {/* TAB 3: APPROVALS */}
                <TabsContent value="approvals" className="py-4 space-y-4">
                  {/* Timeline list */}
                  <div className="space-y-3.5">
                    {selectedQuotation.approvals?.map((app: any) => (
                      <div key={app.id} className="flex gap-3 text-xs border p-3 rounded-xl bg-card shadow-sm hover:shadow-xs transition-shadow">
                        <div className="flex flex-col items-center">
                          <div className={`size-7 rounded-full flex items-center justify-center font-bold text-xs ${
                            app.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-600' :
                            app.status === 'REJECTED' ? 'bg-rose-500/10 text-rose-600' :
                            'bg-amber-500/10 text-amber-600 animate-pulse'
                          }`}>
                            {app.level}
                          </div>
                          <div className="w-px bg-border flex-1 my-1" />
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-foreground">{app.approver?.name}</span>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                              app.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-600' :
                              app.status === 'REJECTED' ? 'bg-rose-500/10 text-rose-600' :
                              'bg-amber-500/10 text-amber-600'
                            }`}>{app.status}</span>
                          </div>
                          {app.remarks && <p className="text-muted-foreground italic">"{app.remarks}"</p>}
                          {app.actionAt && (
                            <p className="text-[10px] text-muted-foreground/60">{new Date(app.actionAt).toLocaleString()}</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {(!selectedQuotation.approvals || selectedQuotation.approvals.length === 0) && (
                      <p className="text-center text-xs text-muted-foreground py-6 font-medium">No sequential approval workflows registered.</p>
                    )}
                  </div>

                  {/* APPROVAL ACTION SUBMISSION PANEL */}
                  {selectedQuotation.status === 'PENDING_APPROVAL' && 
                   selectedQuotation.approvals?.some((a: any) => a.approverId === user?.id && a.status === 'PENDING') && (
                    <div className="border border-amber-500/20 bg-amber-500/5 rounded-2xl p-4.5 space-y-4 mt-6">
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                          <UserCheck className="size-4" /> Resolve pending approval step
                        </h4>
                        <p className="text-[10px] text-muted-foreground">Submit comments to log approval or reject pricing variables.</p>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label className="text-[10px] font-bold uppercase text-muted-foreground">Remarks / Comments</Label>
                        <Textarea 
                          value={approvalRemarks} 
                          onChange={(e) => setApprovalRemarks(e.target.value)} 
                          placeholder="e.g. Reviewed pricing, looks good."
                          className="min-h-[80px] bg-card" 
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <Button 
                          size="sm" 
                          disabled={isSubmittingApproval}
                          className="bg-emerald-600 text-white hover:bg-emerald-700 h-8 text-xs cursor-pointer gap-1"
                          onClick={() => handleDecideApproval('APPROVED')}
                        >
                          <Check className="size-3.5" /> Approve Step
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive"
                          disabled={isSubmittingApproval}
                          className="h-8 text-xs cursor-pointer gap-1"
                          onClick={() => handleDecideApproval('REJECTED')}
                        >
                          <X className="size-3.5" /> Reject Step
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* TAB 4: HISTORY ACTIVITIES */}
                <TabsContent value="activities" className="py-4 space-y-3.5">
                  <div className="relative border-l pl-4.5 space-y-5 py-2">
                    {selectedQuotation.activities?.map((act: any) => (
                      <div key={act.id} className="relative text-xs">
                        {/* Dot marker */}
                        <div className="absolute -left-[24.5px] top-0.5 size-2.5 rounded-full border border-primary bg-background flex items-center justify-center">
                          <div className="size-1 bg-primary rounded-full" />
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-foreground uppercase tracking-wide text-[10px]">{act.action}</span>
                            <span className="text-[10px] text-muted-foreground/60">{new Date(act.createdAt).toLocaleString()}</span>
                          </div>
                          {act.newValue && (
                            <p className="text-muted-foreground">Action logged systematically.</p>
                          )}
                          <p className="text-[10px] text-muted-foreground/50">Performed by user ID: {act.performedBy || 'System'}</p>
                        </div>
                      </div>
                    ))}
                    {(!selectedQuotation.activities || selectedQuotation.activities.length === 0) && (
                      <p className="text-center text-xs text-muted-foreground py-6 font-medium">No activity log audit trails recorded.</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* 3. LOG RESPONSE DIALOG */}
      <Dialog open={isResponseDialogOpen} onOpenChange={setIsResponseDialogOpen}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle>Log Customer Response</DialogTitle>
          </DialogHeader>
          <div className="space-y-4.5 py-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">Response Outcome</Label>
              <Select value={customerResponse} onValueChange={(val) => setCustomerResponse(val || '')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACCEPTED">Client Accepted</SelectItem>
                  <SelectItem value="REJECTED">Client Rejected</SelectItem>
                  <SelectItem value="NEGOTIATING">Commercial Negotiation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">Remarks</Label>
              <Textarea 
                value={customerRemarks} 
                onChange={(e) => setCustomerRemarks(e.target.value)} 
                placeholder="Details of client discussion..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsResponseDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRecordResponse}>Submit Response</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 4. REVISION TRIGGER DIALOG */}
      <Dialog open={isRevisionDialogOpen} onOpenChange={setIsRevisionDialogOpen}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle>Revise Quotation (Clone items)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4.5 py-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">Adjust Warranty Duration (Months)</Label>
              <Input type="number" value={revisionWarranty} onChange={(e) => setRevisionWarranty(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase">Revision Notes</Label>
              <Textarea 
                value={revisionNotes} 
                onChange={(e) => setRevisionNotes(e.target.value)} 
                placeholder="Reason for revision..." 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsRevisionDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateRevision}>Generate Revision</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Move Quotation to Recycle Bin?"
        description="This quotation will be moved to the Recycle Bin. You can restore it anytime from Settings → Recycle Bin."
        confirmText="Move to Bin"
        onConfirm={async () => {
          if (!quotationToDelete) return;
          try {
            await quotationApi.quotations.remove!(quotationToDelete.id);
            toast.success('Quotation deleted successfully.');
            await loadAllData();
          } catch (err: any) {
            toast.error(err.response?.data?.message ?? 'Failed to delete quotation.');
          } finally {
            setQuotationToDelete(null);
          }
        }}
      />
    </div>
  );
}

export default QuotationsPage;
