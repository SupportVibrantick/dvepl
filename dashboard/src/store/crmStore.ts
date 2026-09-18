import { create } from 'zustand';
import { Customer } from '../types/erp';
import { initialCustomers } from '../constants';

interface CRMStore {
  customers: Customer[];
  salesOrders: any[];

  setCustomers: (customers: Customer[]) => void;
  setSalesOrders: (orders: any[]) => void;
}

export const useCRMStore = create<CRMStore>((set) => ({
  customers: initialCustomers,
  salesOrders: [],

  setCustomers: (customers) => set({ customers }),
  setSalesOrders: (salesOrders) => set({ salesOrders }),
}));
