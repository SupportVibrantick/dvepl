import { ColumnDef } from '@tanstack/react-table';
import * as z from 'zod';
import { sortableHeader } from '@/components/tables/genericTable';
import { tenderApi } from '@/services/modules';
import { 
  Section, 
  Division, 
  SubDivision,
  ReferenceCode
} from '@/types/erp';

// ==========================================
// 18. SECTIONS ROUTE CONFIG
// ==========================================
export const sectionsConfig = {
  api: tenderApi.sections,
  selectOptions: {},
  tableName: 'sections',
  moduleName: 'Tender Section',
  pluralName: 'Tender Sections',
  zodSchema: z.object({
    name: z.string().min(2, 'Name is required'),
    code: z.string().optional().nullable(),
    departmentId: z.string().optional().nullable(),
    isActive: z.boolean().default(true)
  }),
  defaultFormValues: { name: '', code: '', isActive: true },
  breadcrumbs: [{ label: 'Dashboard', href: '/' }, { label: 'Tender Sections' }],
  columns: [
    { accessorKey: 'name', header: sortableHeader('Section Name') },
    { accessorKey: 'code', header: 'Section Code' },
    { accessorKey: 'departmentId', header: 'Department Link ID' },
    { 
      accessorKey: 'isActive', 
      header: 'Status',
      cell: ({ getValue }) => (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getValue() ? 'bg-success/15 text-success' : 'bg-muted-foreground/15 text-muted-foreground'}`}>
          {getValue() ? 'Active' : 'Inactive'}
        </span>
      )
    }
  ] as ColumnDef<Section>[],
  fields: [
    { name: 'departmentId', label: 'Link Department', type: 'select', options: [
      { label: 'Sales & Marketing', value: 'dept-1' },
      { label: 'Human Resources', value: 'dept-2' }
    ], required: true },
    { name: 'name', label: 'Section Name', type: 'text', placeholder: 'Zonal Engineering Wing', required: true },
    { name: 'code', label: 'Section Code', type: 'text', placeholder: 'SEC-ZEW' },
    { name: 'isActive', label: 'Active', type: 'checkbox' }
  ] as any[]
};

// ==========================================
// 20. DIVISIONS ROUTE CONFIG
// ==========================================
export const divisionsConfig = {
  api: tenderApi.divisions,
  selectOptions: { sectionId: tenderApi.sections.list },
  tableName: 'divisions',
  moduleName: 'Tender Division',
  pluralName: 'Tender Divisions',
  zodSchema: z.object({
    name: z.string().min(2, 'Name is required'),
    code: z.string().optional().nullable(),
    sectionId: z.string().min(1, 'Section is required'),
    isActive: z.boolean().default(true)
  }),
  defaultFormValues: { name: '', code: '', sectionId: 'sec-1', isActive: true },
  breadcrumbs: [{ label: 'Dashboard', href: '/' }, { label: 'Tender Divisions' }],
  columns: [
    { accessorKey: 'name', header: sortableHeader('Division Name') },
    { accessorKey: 'code', header: 'Division Code' },
    { accessorKey: 'sectionId', header: 'Section Link ID' }
  ] as ColumnDef<Division>[],
  fields: [
    { name: 'sectionId', label: 'Link Section', type: 'select', options: [
      { label: 'Zonal Engineering Wing', value: 'sec-1' }
    ], required: true },
    { name: 'name', label: 'Division Name', type: 'text', placeholder: 'Western Division', required: true },
    { name: 'code', label: 'Division Code', type: 'text', placeholder: 'DIV-WEST' },
    { name: 'isActive', label: 'Active', type: 'checkbox' }
  ] as any[]
};

// ==========================================
// 21. SUB DIVISIONS ROUTE CONFIG
// ==========================================
export const subdivisionsConfig = {
  api: tenderApi.subDivisions,
  selectOptions: { divisionId: tenderApi.divisions.list },
  tableName: 'subDivisions',
  moduleName: 'Tender Sub Division',
  pluralName: 'Tender Sub Divisions',
  zodSchema: z.object({
    name: z.string().min(2, 'Name is required'),
    code: z.string().optional().nullable(),
    divisionId: z.string().min(1, 'Division is required'),
    isActive: z.boolean().default(true)
  }),
  defaultFormValues: { name: '', code: '', divisionId: 'div-1', isActive: true },
  breadcrumbs: [{ label: 'Dashboard', href: '/' }, { label: 'Tender Sub Divisions' }],
  columns: [
    { accessorKey: 'name', header: sortableHeader('Sub Division Name') },
    { accessorKey: 'code', header: 'Sub Division Code' },
    { accessorKey: 'divisionId', header: 'Division Link ID' }
  ] as ColumnDef<SubDivision>[],
  fields: [
    { name: 'divisionId', label: 'Link Division', type: 'select', options: [
      { label: 'Western Division', value: 'div-1' }
    ], required: true },
    { name: 'name', label: 'Sub Division Name', type: 'text', placeholder: 'Mumbai Sub-Division 1', required: true },
    { name: 'code', label: 'Sub Division Code', type: 'text', placeholder: 'SUB-MUM1' },
    { name: 'isActive', label: 'Active', type: 'checkbox' }
  ] as any[]
};

// ==========================================
// 22. REFERENCE CODES CONFIG (READ ONLY)
// ==========================================
export const referenceCodesConfig = {
  api: tenderApi.referenceCodes,
  readOnly: true,
  tableName: 'referenceCodes',
  moduleName: 'Reference Code Transaction',
  pluralName: 'Reference Codes',
  zodSchema: z.object({}),
  defaultFormValues: {},
  breadcrumbs: [{ label: 'Dashboard', href: '/' }, { label: 'Reference Codes' }],
  columns: [
    { 
      accessorKey: 'tenderId', 
      header: 'Assigned Reference / ID',
      cell: ({ getValue, row }) => {
        const id = getValue() as string;
        const tenderObj = (row.original as any)?.tender;
        if (tenderObj) return `${tenderObj.title || ''} (${tenderObj.tenderNo || ''})`;
        return id || 'System Generated';
      }
    },
    { accessorKey: 'oldReferenceCode', header: 'Old Reference Code', cell: ({ getValue }) => getValue() || '—' },
    { accessorKey: 'newReferenceCode', header: 'Reference Code', cell: ({ getValue }) => getValue() || '—' },
    { accessorKey: 'actionType', header: 'Action Type' },
    { accessorKey: 'actionReason', header: 'Audit Reason' },
    { accessorKey: 'actionBy', header: 'Generated By' },
    { accessorKey: 'createdAt', header: 'Timestamp', cell: ({ getValue }) => getValue() ? new Date(getValue() as string).toLocaleString() : '—' }
  ] as ColumnDef<any>[],
  fields: [] as any[],
  statsCards: (data: any[]) => [
    { label: 'Total Codes Issued', value: data.length }
  ]
};

// ==========================================
// 23. TECHNICAL CLARIFICATIONS CONFIG
// ==========================================
export const technicalClarificationsConfig = {
  api: tenderApi.technicalClarifications,
  selectOptions: {},
  tableName: 'technicalClarifications',
  moduleName: 'Technical Clarification',
  pluralName: 'Technical Clarifications',
  zodSchema: z.object({
    tenderId: z.string().optional().nullable(),
    tenderRequestId: z.string().optional().nullable(),
    category: z.string().default('TECHNICAL'),
    question: z.string().min(5, 'Enter the clarification question'),
    answer: z.string().optional().nullable(),
    status: z.string().default('OPEN'),
    isInternal: z.boolean().default(false),
  }),
  defaultFormValues: {
    tenderId: '', tenderRequestId: '', category: 'TECHNICAL',
    question: '', answer: '', status: 'OPEN', isInternal: false,
  },
  breadcrumbs: [
    { label: 'Dashboard', href: '/' },
    { label: 'Tenders', href: '/tender/tenders' },
    { label: 'Technical Clarifications' }
  ],
  columns: [
    { accessorKey: 'questionNo', header: 'Q. No', cell: ({ getValue }: any) => `#${getValue()}` },
    {
      accessorKey: 'tender',
      header: 'Linked Tender',
      cell: ({ getValue }: any) => getValue()?.title || getValue()?.tenderNo || '—'
    },
    { accessorKey: 'category', header: 'Category' },
    { accessorKey: 'question', header: 'Question', cell: ({ getValue }: any) => {
      const val = getValue() as string;
      return val?.length > 60 ? val.slice(0, 60) + '…' : val;
    }},
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }: any) => {
        const val = getValue() as string;
        return (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            val === 'OPEN'     ? 'bg-warning/15 text-warning' :
            val === 'ANSWERED' ? 'bg-success/15 text-success' :
            val === 'CLOSED'   ? 'bg-muted-foreground/15 text-muted-foreground' :
            'bg-primary/15 text-primary'
          }`}>
            {val}
          </span>
        );
      }
    },
    {
      accessorKey: 'isInternal',
      header: 'Visibility',
      cell: ({ getValue }: any) => (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getValue() ? 'bg-destructive/15 text-destructive' : 'bg-success/15 text-success'}`}>
          {getValue() ? 'Internal' : 'Customer-Facing'}
        </span>
      )
    },
    {
      accessorKey: 'answeredAt',
      header: 'Answered At',
      cell: ({ getValue }: any) => getValue() ? new Date(getValue()).toLocaleDateString() : '—'
    },
  ] as ColumnDef<any>[],
  fields: [
    { name: 'tenderId', label: 'Linked Tender', type: 'select', required: false },
    { name: 'category', label: 'Category', type: 'select', options: [
      { label: 'Technical', value: 'TECHNICAL' },
      { label: 'Commercial', value: 'COMMERCIAL' },
      { label: 'Scope', value: 'SCOPE' },
      { label: 'Document', value: 'DOCUMENT' },
      { label: 'Legal', value: 'LEGAL' },
    ], required: true },
    { name: 'question', label: 'Clarification Question', type: 'textarea', placeholder: 'What is the minimum cable size required for LT Panel feeder?', required: true },
    { name: 'answer', label: 'Answer / Response', type: 'textarea', placeholder: 'Minimum 4 sq.mm copper conductor is required.' },
    { name: 'status', label: 'Status', type: 'select', options: [
      { label: 'Open', value: 'OPEN' },
      { label: 'Answered', value: 'ANSWERED' },
      { label: 'Closed', value: 'CLOSED' },
    ] },
    { name: 'isInternal', label: 'Internal Note Only (not visible to customer)', type: 'checkbox' },
  ] as any[],
  statsCards: (data: any[]) => [
    { label: 'Total Clarifications', value: data.length },
    { label: 'Open', value: data.filter(d => d.status === 'OPEN').length },
    { label: 'Answered', value: data.filter(d => d.status === 'ANSWERED').length },
    { label: 'Internal Notes', value: data.filter(d => d.isInternal).length },
  ]
};

