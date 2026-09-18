import { ColumnDef } from '@tanstack/react-table';
import * as z from 'zod';
import { sortableHeader } from '@/components/tables/genericTable';
import { crmApi, tenderApi, hrmsApi, quotationApi } from '@/services/modules';
import { Quotation } from '@/types/erp';

// ==========================================
// 21. QUOTATION ROUTE CONFIG
// ==========================================
export const quotationsConfig = {
  api: quotationApi.quotations,
  selectOptions: {
    customerId: crmApi.customers.list,
    createdById: hrmsApi.employees.list,
    approvedById: hrmsApi.employees.list,
  },
  tableName: 'quotations',
  moduleName: 'Quotation',
  pluralName: 'Quotations',
  zodSchema: z.object({
    customerId: z.string().min(1, 'Select customer'),
    tenderId: z.string().optional().nullable(),
    materialCost: z.coerce.number().nonnegative(),
    labourCost: z.coerce.number().nonnegative(),
    transportation: z.coerce.number().nonnegative().default(0),
    packing: z.coerce.number().nonnegative().default(0),
    insurance: z.coerce.number().nonnegative().default(0),
    discount: z.coerce.number().nonnegative().default(0),
    gst: z.coerce.number().nonnegative().default(0),
    profitMargin: z.coerce.number().nonnegative().default(0),
    validUntil: z.string().min(2, 'Select validity date'),
    remarks: z.string().optional().nullable(),
    status: z.string().default('DRAFT'),
  }),
  defaultFormValues: {
    customerId: '',
    tenderId: '',
    materialCost: '0',
    labourCost: '0',
    transportation: '0',
    packing: '0',
    insurance: '0',
    discount: '0',
    gst: '18',
    profitMargin: '10',
    validUntil: '',
    remarks: '',
    status: 'DRAFT',
  },
  breadcrumbs: [
    { label: 'Dashboard', href: '/' },
    { label: 'Quotations Pipeline' },
  ],
  columns: [
    { accessorKey: 'quotationNo', header: sortableHeader('Quotation No') },
    { accessorKey: 'revision', header: sortableHeader('Rev') },
    {
      accessorKey: 'customerId',
      header: 'Client Partner',
      cell: ({ row }) => {
        const item = row.original as any;
        return item.customer?.name || 'Loading...';
      },
    },
    {
      accessorKey: 'tenderId',
      header: 'Linked Tender',
      cell: ({ row }) => {
        const item = row.original as any;
        return item.tender?.title || 'None';
      },
    },
    {
      accessorKey: 'finalAmount',
      header: 'Total Value',
      cell: ({ getValue }) => `₹${Number(getValue() || 0).toLocaleString()}`,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => {
        const val = getValue() as string;
        return (
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              val === 'DRAFT'
                ? 'bg-muted-foreground/15 text-muted-foreground'
                : val === 'WAITING_APPROVAL'
                ? 'bg-warning/15 text-warning'
                : val === 'APPROVED'
                ? 'bg-success/15 text-success'
                : val === 'SENT'
                ? 'bg-primary/15 text-primary'
                : val === 'ACCEPTED'
                ? 'bg-emerald-500/15 text-emerald-500'
                : val === 'REJECTED'
                ? 'bg-danger/15 text-danger'
                : val === 'EXPIRED'
                ? 'bg-red-500/15 text-red-500'
                : 'bg-muted-foreground/15 text-muted-foreground'
            }`}
          >
            {val}
          </span>
        );
      },
    },
  ] as ColumnDef<Quotation>[],
  fields: [
    {
      name: 'customerId',
      label: 'Client Account',
      type: 'select',
      options: [],
      required: true,
    },
    {
      name: 'tenderId',
      label: 'Linked Tender Project',
      type: 'select',
      options: [],
    },
    {
      name: 'materialCost',
      label: 'Material Cost (INR)',
      type: 'number',
      placeholder: '0',
      required: true,
    },
    {
      name: 'labourCost',
      label: 'Labour Cost (INR)',
      type: 'number',
      placeholder: '0',
      required: true,
    },
    {
      name: 'transportation',
      label: 'Transportation Cost (INR)',
      type: 'number',
      placeholder: '0',
    },
    {
      name: 'packing',
      label: 'Packing Cost (INR)',
      type: 'number',
      placeholder: '0',
    },
    {
      name: 'insurance',
      label: 'Insurance Cost (INR)',
      type: 'number',
      placeholder: '0',
    },
    {
      name: 'discount',
      label: 'Discount Given (INR)',
      type: 'number',
      placeholder: '0',
    },
    {
      name: 'gst',
      label: 'GST Rate (%)',
      type: 'number',
      placeholder: '18',
    },
    {
      name: 'profitMargin',
      label: 'Profit Margin (%)',
      type: 'number',
      placeholder: '10',
    },
    {
      name: 'validUntil',
      label: 'Valid Until',
      type: 'date',
      required: true,
    },
    {
      name: 'remarks',
      label: 'Remarks / Special Terms',
      type: 'textarea',
      placeholder: 'Remarks or special installation criteria...',
    },
    {
      name: 'status',
      label: 'Workflow Status',
      type: 'select',
      options: [
        { label: 'Draft Mode', value: 'DRAFT' },
        { label: 'Waiting Approval', value: 'WAITING_APPROVAL' },
        { label: 'Approved & Active', value: 'APPROVED' },
        { label: 'Sent to Client Account', value: 'SENT' },
        { label: 'Accepted by Client', value: 'ACCEPTED' },
        { label: 'Rejected by Client', value: 'REJECTED' },
        { label: 'Expired', value: 'EXPIRED' },
      ],
    },
  ] as any[],
  statsCards: (data: Quotation[]) => [
    { label: 'Total Quotes Issued', value: data.length },
    {
      label: 'Active Valuation Pipeline',
      value: `₹${data
        .reduce((sum, item) => sum + Number(item.finalAmount || item.totalValue || 0), 0)
        .toLocaleString()}`,
    },
  ],
};
