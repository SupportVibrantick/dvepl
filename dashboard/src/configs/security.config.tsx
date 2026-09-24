import { ColumnDef } from '@tanstack/react-table';
import * as z from 'zod';
import { sortableHeader } from '@/components/tables/genericTable';
import { securityApi } from '@/services/modules';

// ==========================================
// 24. ROLES CONFIG
// ==========================================
export const rolesConfig = {
  api: securityApi.roles,
  tableName: 'roles',
  moduleName: 'Role',
  pluralName: 'PRBAC Roles',
  syncAction: {
    label: 'Sync Roles',
    run: async () => {
      const res = await securityApi.roles.sync();
      return {
        syncedCount: res?.syncedCount ?? 0,
        message: res?.message ?? 'Roles synced from portal.',
      };
    },
  },
  zodSchema: z.object({
    name: z.string().min(2, 'Role name is required'),
    description: z.string().optional().nullable(),
    isSystem: z.boolean().default(false)
  }),
  defaultFormValues: { name: '', description: '', isSystem: false },
  breadcrumbs: [{ label: 'Dashboard', href: '/' }, { label: 'Security Roles' }],
  columns: [
    { accessorKey: 'name', header: sortableHeader('Role Name') },
    { accessorKey: 'description', header: 'Description' },
    {
      accessorKey: 'isSystem',
      header: 'System Lock',
      cell: ({ getValue }) => getValue() ? 'Core System' : 'Custom'
    }
  ] as ColumnDef<any>[],
  fields: [
    { name: 'name', label: 'Role Title', type: 'text', placeholder: 'Sales Manager', required: true },
    { name: 'description', label: 'Description', type: 'textarea', placeholder: 'Authorized parameters' },
    { name: 'isSystem', label: 'System Protected Role', type: 'checkbox' }
  ] as any[]
};
