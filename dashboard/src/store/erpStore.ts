import { create } from 'zustand';
import {
  ReferenceCodeAction, Company, Branch, Department, Team, Designation,
  CostCenter, User, Role, Employee,
  Attendance, Leave, Salary, Section, Division,
  SubDivision, ReferenceCode, AuditLog, Holiday, DeliveryOrder
} from '../types/erp';
import { securityApi } from '@/services/modules';

import {
  initialCompanies,
  initialBranches,
  initialDepartments,
  initialTeams,
  initialDesignations,
  initialCostCenters,
  initialUsers,
  initialRoles,
  initialEmployees,
  initialAttendances,
  initialLeaves,
  initialSalaries,
  initialSections,
  initialDivisions,
  initialSubDivisions,
  initialHolidays,
  initialReferenceCodes,
  initialAuditLogs
} from '../constants';

console.log("initialUsers:", initialUsers);

interface ERPStore {
  companies: Company[];
  branches: Branch[];
  departments: Department[];
  teams: Team[];
  designations: Designation[];
  costCenters: CostCenter[];
  users: User[];
  roles: Role[];
  employees: Employee[];
  attendances: Attendance[];
  leaves: Leave[];
  salaries: Salary[];
  sections: Section[];
  divisions: Division[];
  subDivisions: SubDivision[];
  referenceCodes: ReferenceCode[];
  auditLogs: AuditLog[];
  holidays: Holiday[];
  deliveryOrders: DeliveryOrder[];

  // Session settings
  currentCompanyId: string;
  currentUserId: string;
  currentUserName: string;
  currentWorkspace: string;
  theme: 'light' | 'dark';
  language: string;

  // Actions
  setCompanyId: (id: string) => void;
  setCurrentUser: (id: string, name: string) => void;
  setWorkspace: (ws: string) => void;
  toggleTheme: () => void;
  setLanguage: (language: string) => void;
  setDeliveryOrders: (orders: DeliveryOrder[]) => void;
  updateDeliveryOrder: (id: string, payload: Partial<DeliveryOrder>) => void;

  // CRUD Actions
  addRecord: (table: string, data: any) => any;
  updateRecord: (table: string, id: string, data: any) => void;
  deleteRecord: (table: string, id: string) => void;
  addAuditLog: (module: string, recordId: string, action: string, oldValue?: any, newValue?: any) => void;
  settings: any;
  fetchSettings: () => Promise<void>;
  updateSettings: (payload: any) => Promise<void>;
}
// Combine into Zustand store
export const useERPStore = create<ERPStore>((set) => ({
  companies: initialCompanies,
  branches: initialBranches,
  departments: initialDepartments,
  teams: initialTeams,
  designations: initialDesignations,
  costCenters: initialCostCenters,
  users: initialUsers,
  roles: initialRoles,
  employees: initialEmployees,
  attendances: initialAttendances,
  leaves: initialLeaves,
  salaries: initialSalaries,
  sections: initialSections,
  divisions: initialDivisions,
  subDivisions: initialSubDivisions,
  referenceCodes: initialReferenceCodes,
  auditLogs: initialAuditLogs,
  holidays: initialHolidays,
  deliveryOrders: [],

  // Selected states
  currentCompanyId: 'comp-1',
  currentUserId: '',
  currentUserName: '',
  currentWorkspace: 'Default Workspace',
  theme: 'light',
  language: 'English',

  setCompanyId: (id) => set({ currentCompanyId: id }),
  setCurrentUser: (id, name) => set({ currentUserId: id, currentUserName: name }),
  setWorkspace: (ws) => set({ currentWorkspace: ws }),
  toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
  setLanguage: (language: string) => set({ language }),
  setDeliveryOrders: (orders) => set({ deliveryOrders: orders }),
  updateDeliveryOrder: (id, payload) =>
    set((state) => ({
      deliveryOrders: state.deliveryOrders.map((order) =>
        order.id === id ? { ...order, ...payload } : order
      ),
    })),

  addAuditLog: (module, recordId, action, oldValue = null, newValue = null) => {
    const newLog: AuditLog = {
      id: `log-${Math.random().toString(36).substr(2, 9)}`,
      userId: useERPStore.getState().currentUserId,
      module,
      recordId,
      action,
      oldValue,
      newValue,
      ipAddress: '127.0.0.1',
      userAgent: 'Chrome Agentic UI',
      createdAt: new Date().toISOString()
    };
    set((state) => ({ auditLogs: [newLog, ...state.auditLogs] }));
    try {
      void securityApi.auditLogs.create(module, recordId, action, oldValue, newValue).then((saved) => {
        if (saved && saved.id) {
          set((state) => ({ auditLogs: state.auditLogs.map((l) => (l.id === newLog.id ? saved : l)) }));
        }
      }).catch(() => {});
    } catch {
      // fire-and-forget: local log still shows even if persistence fails
    }
  },

  addRecord: (table, data) => {
    const id = `${table.toLowerCase().slice(0, 3)}-${Math.random().toString(36).substr(2, 9)}`;
    const newRecord = {
      ...data,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    set((state: any) => {
      const records = state[table] || [];
      const updatedList = [newRecord, ...records];

      return {
        [table]: updatedList
      };
    });

    useERPStore.getState().addAuditLog(table, id, 'CREATE', null, data);
    return newRecord;
  },

  updateRecord: (table, id, data) => {
    let oldRecord: any = null;
    set((state: any) => {
      const records = state[table] || [];
      const index = records.findIndex((r: any) => r.id === id);
      if (index === -1) return {};

      oldRecord = records[index];
      const newRecord = {
        ...oldRecord,
        ...data,
        updatedAt: new Date().toISOString()
      };

      const updatedList = [...records];
      updatedList[index] = newRecord;

      return { [table]: updatedList };
    });

    useERPStore.getState().addAuditLog(table, id, 'UPDATE', oldRecord, data);
  },

  deleteRecord: (table, id) => {
    let oldRecord: any = null;
    set((state: any) => {
      const records = state[table] || [];
      const index = records.findIndex((r: any) => r.id === id);
      if (index === -1) return {};

      oldRecord = records[index];
      const updatedList = records.filter((r: any) => r.id !== id);

      return { [table]: updatedList };
    });

    useERPStore.getState().addAuditLog(table, id, 'DELETE', oldRecord, null);
  },

  settings: {},
  fetchSettings: async () => {
    try {
      const data = await securityApi.settings.read();
      set({ settings: data || {} });
    } catch (e) {
      console.error(e);
    }
  },
  updateSettings: async (payload: any) => {
    try {
      const updated = await securityApi.settings.update(payload);
      set({ settings: updated || {} });
    } catch (e) {
      console.error(e);
      throw e;
    }
  }
}));
