import { create } from 'zustand';
import { Customer, CommunicationHistory } from '../types/erp';
import { initialCustomers, initialCommunicationHistories } from '../constants';

interface CRMStore {
  customers: Customer[];
  communicationHistories: CommunicationHistory[];
  salesOrders: any[];

  setCustomers: (customers: Customer[]) => void;
  setCommunicationHistories: (histories: CommunicationHistory[]) => void;
  setSalesOrders: (orders: any[]) => void;
}

export const useCRMStore = create<CRMStore>((set) => ({
  customers: initialCustomers,
  communicationHistories: initialCommunicationHistories,
  salesOrders: [],

  setCustomers: (customers) => set({ customers }),
  setCommunicationHistories: (communicationHistories) => set({ communicationHistories }),
  setSalesOrders: (salesOrders) => set({ salesOrders }),
}));
