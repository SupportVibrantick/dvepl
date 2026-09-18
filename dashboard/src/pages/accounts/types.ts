export interface PanelItem {
  id: string;
  panelName: string;
  qty: number | "";
  price: number | "";
  total: number;
}

export interface SharedOrderFile {
  id: string;
  name: string;
  uploader: string;
  uploadTime: string;
  location: string;
  size?: string;
  fileUrl?: string;
  isBlocked: boolean;
  allowedRoles?: string[];
  allowedUsers?: string[];
}

export interface AccountSectionFile {
  id: string;
  name: string;
  size: string;
  uploadTime: string;
  fileUrl?: string;
  file?: File;
}

export interface CustomerMasterDetails {
  companyName: string;
  contactPerson: string;
  dveplRefCode: string;
  dateOfOrder: string;
  dateOfCommitment: string;
  projectRef: string;
  gstNumber: string;
  billingAddress: string;
  specialNotes: string;
}

export interface AccountCostingData {
  orderId: string;
  orderCode: string;
  customerDetails: CustomerMasterDetails;
  sharedFiles: SharedOrderFile[];
  accountFiles: AccountSectionFile[];
  items: PanelItem[];
  taxPercent: number | "";
  lessAdvance: number | "";
  specialNote: string;
  lastSavedAt?: string;
}
