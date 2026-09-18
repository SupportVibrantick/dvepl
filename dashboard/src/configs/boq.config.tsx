import { ColumnDef } from '@tanstack/react-table';
import * as z from 'zod';
import { sortableHeader } from '@/components/tables/genericTable';
import { tenderApi } from '@/services/modules';

export const boqsConfig = {
  api: tenderApi.boqs,
  selectOptions: {},
  tableName: 'boqs',
  moduleName: 'Bill of Quantity (BOQ)',
  pluralName: 'BOQ Records',
  zodSchema: z.object({
    tenderId: z.string().optional().nullable(),
    boqNo: z.string().min(2, 'Enter BOQ Reference Number'),
    estimatedValue: z.coerce.number().nonnegative(),
    remarks: z.string().optional().nullable(),
  }),
  defaultFormValues: {
    tenderId: '',
    boqNo: '',
    estimatedValue: '0',
    remarks: '',
  },
  breadcrumbs: [
    { label: 'Dashboard', href: '/' },
    { label: 'BOQ Manager' },
  ],
  columns: [
    { accessorKey: 'boqNo', header: sortableHeader('BOQ Ref No') },
    {
      accessorKey: 'tenderId',
      header: 'Linked Tender',
      cell: ({ row }) => {
        const item = row.original as any;
        return item.tender?.title || 'Loading...';
      },
    },
    {
      accessorKey: 'estimatedValue',
      header: 'Estimated Cost',
      cell: ({ getValue }) => `₹${Number(getValue() || 0).toLocaleString()}`,
    },
    { accessorKey: 'remarks', header: 'Scope Summary' },
  ] as ColumnDef<any>[],
  fields: [
    { name: 'tenderId', label: 'Linked Tender Project', type: 'select', options: [], required: true },
    { name: 'boqNo', label: 'BOQ Reference No', type: 'text', placeholder: 'BOQ-2026-0001', required: true },
    { name: 'estimatedValue', label: 'Estimated BOQ Cost (INR)', type: 'number', placeholder: '1000000', required: true },
    { name: 'remarks', label: 'Notes / Scope Remarks', type: 'textarea', placeholder: 'Scope details...' },
  ] as any[],
  statsCards: (data: any[]) => [
    { label: 'Total BOQs Prepared', value: data.length },
    {
      label: 'BOQ Pipeline Valuation',
      value: `₹${data
        .reduce((sum, item) => sum + Number(item.estimatedValue || 0), 0)
        .toLocaleString()}`,
    },
  ],
};
