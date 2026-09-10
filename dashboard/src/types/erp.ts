// Enterprise ERP Database Schema Types (Phase 1)

export enum EmployeeStatus {
  ACTIVE = 'ACTIVE',
  ON_LEAVE = 'ON_LEAVE',
  SUSPENDED = 'SUSPENDED',
  RESIGNED = 'RESIGNED',
  TERMINATED = 'TERMINATED'
}

export enum ContactType {
  PHONE = 'PHONE',
  EMAIL = 'EMAIL',
  ADDRESS = 'ADDRESS'
}

export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  HALF_DAY = 'HALF_DAY',
  ON_LEAVE = 'ON_LEAVE',
  HOLIDAY = 'HOLIDAY'
}

export enum LeaveStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED'
}

export enum CommunicationType {
  CALL = 'CALL',
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  SMS = 'SMS',
  NOTE = 'NOTE'
}

export enum TenderStatus {
  DRAFT = 'DRAFT',
  OPEN = 'OPEN',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export enum TenderRequestSource {
  WEBSITE = 'WEBSITE',
  REFERRAL = 'REFERRAL',
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  MANUAL = 'MANUAL'
}

export enum TenderRequestStatus {
  NEW = 'NEW',
  ASSIGNED = 'ASSIGNED',
  CONTACTED = 'CONTACTED',
  QUALIFIED = 'QUALIFIED',
  TENDER = 'TENDER',
  QUOTATION = 'QUOTATION',
  WON = 'WON',
  LOST = 'LOST'
}

export enum ReferenceCodeAction {
  GENERATED = 'GENERATED',
  UPDATED = 'UPDATED',
  DELETED = 'DELETED',
  REGENERATED = 'REGENERATED',
  MISSING = 'MISSING'
}

export enum OtpPurpose {
  LOGIN = 'LOGIN',
  PHONE_VERIFICATION = 'PHONE_VERIFICATION',
  PASSWORD_RESET = 'PASSWORD_RESET'
}
export enum DeliveryStatus {
  PLANNED = 'planned',
  IN_PROGRESS = 'in-progress',
  DISPATCHED = 'dispatched',
  DELIVERED = 'delivered'
}

export interface DeliveryHistoryItem {
  date: string;
  status: string;
  remarks?: string;
  updatedBy?: string;
}

export interface DeliveryOrder {
  id: string;
  companyCode: string;
  customerName: string;
  itemName: string;
  assignedTo: string;
  deliveryTarget: string;
  dispatchDate?: string;
  actualDeliveryDate?: string;
  deliveryStatus: DeliveryStatus;
  orderStatus: string;
  remarks?: string;
  targetMonth?: string;
  history?: DeliveryHistoryItem[];
}

export enum LeadStatus {
  NEW = "NEW",
  CONTACTED = "CONTACTED",
  QUALIFIED = "QUALIFIED",
  PROPOSAL_SENT = "PROPOSAL_SENT",
  NEGOTIATION = "NEGOTIATION",
  WON = "WON",
  LOST = "LOST",
}
export interface Company {
  id: string;
  name: string;
  gst?: string | null;
  pan?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface Branch {
  id: string;
  companyId: string;
  name: string;
  code: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface Department {
  id: string;
  branchId: string;
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface Team {

  id:string;

  departmentId:string;

  name:string;

  isActive:boolean;

  department?:{
    id:string;
    name:string;
  };

  employees?: Array<{
    id:string;
    firstName:string;
    lastName:string;
  }>;

  _count?:{
    employees:number;
  };

  createdAt?: string;
  updatedAt?: string;
}

export interface Designation {
  id: string;
  title: string;
  level?: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface CostCenter {
  id: string;
  companyId: string;
  departmentId?: string | null;
  code: string;
  name: string;
  budget?: number | string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface User {
  id: string;
  name: string;
  companyId: string;
  email: string;
  phone?: string | null;
  passwordHash?: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface Role {
  id: string;
  companyId: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  pageAccess?: any;
  actionPermissions?: any;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}
export interface Lead {
  id: string;
  companyId: string;

  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;

  source?: string | null;
  status: LeadStatus;

  assignedToId?: string | null;

  remarks?: string | null;

  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface PermissionGroup {
  id: string;
  name: string;
  description?: string | null;
}

export interface Permission {
  id: string;
  groupId?: string | null;
  code: string;
  description?: string | null;
}

export interface RolePermission {
  id: string;
  roleId: string;
  permissionId: string;
  createdAt: string;
}

export interface UserRole {
  id: string;
  userId: string;
  roleId: string;
  createdAt: string;
}

export interface UserPermission {
  id: string;
  userId: string;
  permissionId: string;
  allowed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Employee {
  id: string;
  userId?: string | null;

  companyId: string;

  branchId?: string | null;
  departmentId?: string | null;
  teamId?: string | null;
  designationId?: string | null;

  reportsToId?: string | null;

  branch?: {
    id: string;
    name: string;
  };

  department?: {
    id: string;
    name: string;
  };

  designation?: {
    id: string;
    title: string;
  };

  team?: {
    id: string;
    name: string;
  };

  employeeCode: string;
  firstName: string;
  lastName: string;

  dateOfBirth?: string | null;
  gender?: string | null;

  dateOfJoining?: string | null;
  dateOfExit?: string | null;

  status: EmployeeStatus;

  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface EmployeeContact {
  id: string;
  employeeId: string;
  type: ContactType;
  value: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface EmployeeEmergencyContact {
  id: string;
  employeeId: string;
  name: string;
  relationship: string;
  phone: string;
  createdAt: string;
}

export interface EmployeeEducation {
  id: string;
  employeeId: string;
  degree: string;
  institution: string;
  yearOfPassing?: number | null;
  grade?: string | null;
  createdAt: string;
}

export interface EmployeeExperience {
  id: string;
  employeeId: string;
  companyName: string;
  designation: string;
  fromDate?: string | null;
  toDate?: string | null;
  createdAt: string;
}

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  documentType: string;
  fileUrl: string;
  fileName: string;
  createdAt: string;
}

export interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface EmployeeShift {
  id: string;
  employeeId: string;
  shiftId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  type?: string | null;
}

export interface Attendance {

  id:string;

  employeeId:string;

  date:string;

  status: AttendanceStatus;
  remarks?: string | null;

  employee?:{
    id:string;
    firstName:string;
    lastName:string;
    employeeCode:string;
  };
    checkIn?: string | null;

  checkOut?: string | null;

  createdAt?:string;
  updatedAt?:string;
}

export interface Leave {
  id: string;
  employeeId: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  reason?: string | null;
  status: LeaveStatus;
  approvedById?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Salary {
  id: string;
  employeeId: string;
  effectiveFrom: string;
  basic: number;
  hra: number;
  allowances: number;
  deductions: number;
  ctc: number;
  createdAt: string;
}

export interface Customer {
  id: string;
  companyId: string;
  name: string;
  gst?: string | null;
  pan?: string | null;
  billingAddress?: string | null;
  shippingAddress?: string | null;
  paymentTerms?: string | null;
  firmName?: string | null;
  isGovernment: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface CommunicationHistory {
  id: string;
  customerId: string;
  userId?: string | null;
  type: CommunicationType;
  subject?: string | null;
  content?: string | null;
  createdAt: string;
}

export interface Tender {
  id: string;
  companyId: string;
  tenderRequestId?: string | null;
  customerId?: string | null;
  departmentId?: string | null;
  sectionId?: string | null;
  divisionId?: string | null;
  subDivisionId?: string | null;
  tenderNo?: string | null;
  tenderCode?: string | null;
  title: string;
  description?: string | null;
  projectLocation?: string | null;
  estimatedCost?: number | null;
  publishedAt?: string | null;
  dueDate?: string | null;
  status: TenderStatus;
  createdById: string;
  assignedToId?: string | null;
  governmentDepartmentId?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface TenderFile {
  id: string;
  tenderId: string;
  fileName: string;
  fileUrl: string;
  fileType?: string | null;
  uploadedBy?: string | null;
  createdAt: string;
}

export interface TenderRemark {
  id: string;
  tenderId: string;
  userId?: string | null;
  remark: string;
  createdAt: string;
}

export interface TenderRequest {
  id: string;
  companyId: string;
  customerId?: string | null;
  assignedToId?: string | null;
  createdById?: string | null;
  source: TenderRequestSource;
  status: TenderRequestStatus;
  title: string;
  description?: string | null;
  estimatedValue?: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface TenderActivity {
  id: string;
  tenderId: string;
  action: string;
  oldValue?: any;
  newValue?: any;
  performedBy?: string | null;
  createdAt: string;
}

export interface GovernmentDepartment {
  id: string;
  companyId: string;
  name: string;
  code?: string | null;
  shortName?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Section {
  id: string;
  companyId: string;
  departmentId: string;
  name: string;
  code?: string | null;
  isActive: boolean;
  governmentDepartmentId?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface Division {
  id: string;
  companyId: string;
  sectionId: string;
  name: string;
  code?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface SubDivision {
  id: string;
  companyId: string;
  divisionId: string;
  name: string;
  code?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface ReferenceCode {
  id: string;
  tenderId: string;
  oldReferenceCode?: string | null;
  newReferenceCode?: string | null;
  actionType: ReferenceCodeAction;
  actionReason?: string | null;
  actionBy?: string | null;
  createdAt: string;
}

export interface ReferenceCodeCounter {
  id: string;
  companyId: string;
  prefix: string;
  lastSequence: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  userId?: string | null;
  user?: {
    id: string;
    name: string;
    email: string;
  } | null;
  module: string;
  recordId: string;
  action: string;
  oldValue?: any;
  newValue?: any;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
}

export enum QuotationStatus {
  DRAFT = 'DRAFT',
  WAITING_APPROVAL = 'WAITING_APPROVAL',
  APPROVED = 'APPROVED',
  SENT = 'SENT',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED'
}

export interface Quotation {
  id: string;
  companyId: string;
  quotationNo: string;
  tenderId?: string | null;
  customerId: string;
  revision: number;
  status: QuotationStatus;
  materialCost: number;
  labourCost: number;
  transportation: number;
  packing: number;
  insurance: number;
  discount: number;
  gst: number;
  profitMargin: number;
  finalAmount: number;
  totalValue?: number;
  currency: string;
  validUntil: string;
  remarks?: string | null;
  createdById: string;
  approvedById?: string | null;
  approvedAt?: string | null;
  sentAt?: string | null;
  acceptedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export enum SalesOrderStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  IN_PRODUCTION = 'IN_PRODUCTION',
  READY = 'READY',
  DISPATCHED = 'DISPATCHED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export interface SalesOrder {
  id: string;
  companyId: string;
  orderNo: string;
  customerId: string;
  tenderId?: string | null;
  quotationId?: string | null;
  orderDate: string;
  deliveryDate?: string | null;
  status: SalesOrderStatus;
  paymentTerms?: string | null;
  deliverySchedule?: string | null;
  warranty?: string | null;
  freight: number;
  gst: number;
  total: number;
  totalValue?: number;
  remarks?: string | null;
  createdById: string;
  confirmedById?: string | null;
  cancelledById?: string | null;
  confirmedAt?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface ApprovalRule {
  id: string;
  module: string;
  level: number;
  roleId: string;
  minValue?: number | null;
  maxValue?: number | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

