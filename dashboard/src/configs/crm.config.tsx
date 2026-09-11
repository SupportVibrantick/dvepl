import { ColumnDef } from '@tanstack/react-table';
import * as z from 'zod';
import { sortableHeader } from '@/components/tables/genericTable';
import { crmApi } from '@/services/modules';
import { 
  Customer, 
  CommunicationHistory 
} from '@/types/erp';

// ==========================================
// 13. CUSTOMER ROUTE CONFIG
// ==========================================
export const customersConfig = {
  api: crmApi.customers,
  hideAdd: true,
  tableName: 'customers',
  moduleName: 'Customer',
  pluralName: 'Customers',
  searchPlaceholder: 'Search corporate accounts...',
  syncAction: {
    label: 'Sync from Portal',
    run: async () => {
      const res = await crmApi.customers.sync();
      return {
        syncedCount: res?.syncedCount ?? 0,
        message: res?.message ?? 'Customers synced from portal.',
      };
    },
  },
  zodSchema: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    gst: z.string().optional().nullable(),
    pan: z.string().optional().nullable(),
    billingAddress: z.string().optional().nullable(),
    shippingAddress: z.string().optional().nullable(),
    paymentTerms: z.string().optional().nullable(),
    firmName: z.string().optional().nullable(),
    isGovernment: z.boolean().default(false),
    isActive: z.boolean().default(true)
  }),
  defaultFormValues: { name: '', gst: '', pan: '', billingAddress: '', shippingAddress: '', paymentTerms: 'Net 30 Days', firmName: '', isGovernment: false, isActive: true },
  breadcrumbs: [{ label: 'Dashboard', href: '/' }, { label: 'Customers' }],
  columns: [
    { accessorKey: 'name', header: sortableHeader('Company/Client Name') },
    { accessorKey: 'gst', header: 'GSTIN' },
    { accessorKey: 'paymentTerms', header: 'Payment Terms' },
    { 
      accessorKey: 'isGovernment', 
      header: 'Sector',
      cell: ({ getValue }) => (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getValue() ? 'bg-indigo-500/15 text-indigo-500' : 'bg-orange-500/15 text-orange-500'}`}>
          {getValue() ? 'Govt / PSU' : 'Private'}
        </span>
      )
    },
    { 
      accessorKey: 'isActive', 
      header: 'Status',
      cell: ({ getValue }) => (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getValue() ? 'bg-success/15 text-success' : 'bg-muted-foreground/15 text-muted-foreground'}`}>
          {getValue() ? 'Active' : 'Inactive'}
        </span>
      )
    }
  ] as ColumnDef<Customer>[],
  fields: [
    { name: 'name', label: 'Company / Client Name', type: 'text', placeholder: 'Indian Railways (CR)', required: true },
    { name: 'firmName', label: 'Firm Registered Name', type: 'text', placeholder: 'Central Railway Logistics Division' },
    { name: 'gst', label: 'GSTIN', type: 'text', placeholder: '27RAILW1234A1Z0' },
    { name: 'pan', label: 'PAN', type: 'text', placeholder: 'RAILW1234A' },
    { name: 'paymentTerms', label: 'Payment Terms', type: 'select', options: [
      { label: 'Net 15 Days', value: 'Net 15 Days' },
      { label: 'Net 30 Days', value: 'Net 30 Days' },
      { label: 'Net 45 Days', value: 'Net 45 Days' },
      { label: 'Net 60 Days', value: 'Net 60 Days' }
    ] },
    { name: 'billingAddress', label: 'Billing Address', type: 'textarea', placeholder: 'Registered address' },
    { name: 'shippingAddress', label: 'Shipping Address', type: 'textarea', placeholder: 'Site delivery address' },
    { name: 'isGovernment', label: 'Government Body / Public Sector', type: 'checkbox' },
    { name: 'isActive', label: 'Active Status', type: 'checkbox' }
  ] as any[],
  statsCards: (data: Customer[]) => [
    { label: 'Total Clients', value: data.length },
    { label: 'Government Accounts', value: data.filter(c => c.isGovernment).length },
    { label: 'Private Accounts', value: data.filter(c => !c.isGovernment).length }
  ]
};

// ==========================================
// 15. COMMUNICATION HISTORY ROUTE CONFIG
// ==========================================
export const communicationConfig = {
  api: crmApi.communications,
  selectOptions: { customerId: crmApi.customers.list },
  tableName: 'communicationHistories',
  moduleName: 'Communication Log',
  pluralName: 'Communication Logs',
  zodSchema: z.object({
    customerId: z.string().min(1, 'Select a customer'),
    type: z.string().min(1, 'Select interaction channel'),
    subject: z.string().min(2, 'Subject is required'),
    content: z.string().optional().nullable()
  }),
  defaultFormValues: { customerId: 'cust-1', type: 'CALL', subject: '', content: '' },
  breadcrumbs: [{ label: 'Dashboard', href: '/' }, { label: 'Interaction History' }],
  columns: [
    { accessorKey: 'createdAt', header: sortableHeader('Date & Time'), cell: ({ getValue }) => new Date(getValue() as string).toLocaleString() },
    { 
      accessorKey: 'customerId', 
      header: 'Customer Account',
      cell: ({ getValue }) => {
        const id = getValue();
        if (id === 'cust-1') return 'Indian Railways';
        if (id === 'cust-2') return 'Larsen & Toubro';
        return 'ONGC India';
      }
    },
    { 
      accessorKey: 'type', 
      header: 'Channel',
      cell: ({ getValue }) => (
        <span className="text-xs font-semibold uppercase">{String(getValue())}</span>
      )
    },
    { accessorKey: 'subject', header: 'Discussion Topic' },
    { accessorKey: 'content', header: 'Summary/Notes' }
  ] as ColumnDef<CommunicationHistory>[],
  fields: [
    { name: 'customerId', label: 'Link Customer', type: 'select', options: [
      { label: 'Indian Railways (CR)', value: 'cust-1' },
      { label: 'Larsen & Toubro Ltd', value: 'cust-2' },
      { label: 'ONGC', value: 'cust-3' }
    ], required: true },
    { name: 'type', label: 'Channel Type', type: 'select', options: [
      { label: 'Phone Call', value: 'CALL' },
      { label: 'Email Thread', value: 'EMAIL' },
      { label: 'WhatsApp Message', value: 'WHATSAPP' },
      { label: 'SMS Notification', value: 'SMS' },
      { label: 'Internal Note', value: 'NOTE' }
    ], required: true },
    { name: 'subject', label: 'Interaction Topic', type: 'text', placeholder: 'Pricing review call notes', required: true },
    { name: 'content', label: 'Conversation Summary', type: 'textarea', placeholder: 'Enter notes from call or copy paste email text' }
  ] as any[]
};
