import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useERPStore } from "@/store/erpStore";
import { securityApi } from "@/services/modules";
import { organizationApi } from "@/services/organization";
import { toast } from "react-hot-toast";
import * as XLSX from "xlsx";
import { Eye, EyeOff, AlertTriangle, FileText, Plus, Trash2, Check, RotateCcw, ArrowUpDown, Info } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirmDialog";
import {
  DocumentCategoryDef,
  INITIAL_DOCUMENT_CATEGORIES,
  getOrderDocumentCategories,
  saveOrderDocumentCategories,
  ORDER_DOCUMENTS_CHANGED_EVENT,
} from "../tenders/components/orderDocumentsConfig";
import {
  ACTION_PERMISSION_KEYS,
  LEGACY_ACTION_DEFAULTS,
  NO_ACTIONS,
  normalizePageActionPermissions,
  type PageActionPermissions,
  type StoredActionPermissions,
} from "@/utils/pagePermissions";
import "../../styles/settings.css";

// Hex to HSL space-separated string converter for Tailwind HSL variables compatibility
function hexToHslString(hex: string): string {
  hex = hex.replace(/^#/, "");
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((char) => char + char)
      .join("");
  }
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  const hDeg = Math.round(h * 360);
  const sPct = Math.round(s * 100);
  const lPct = Math.round(l * 100);
  return `${hDeg} ${sPct}% ${lPct}%`;
}

// Type definitions
interface UserItem {
  id: string;
  name: string;
  email: string;
  designation?: string | null;
  phone?: string | null;
  role: string;
  pageAccess?: string[];
  actionPermissions?: StoredActionPermissions;
  hasOverride?: boolean;
  password?: string;
  teamId?: string | null;
  teamName?: string | null;
}

const defaultWaSettings = {
  masterToggle: true,
  number: "",
  phoneId: "",
  businessId: "",
  accessToken: "",
  orderConfirmation: true,
  lowStock: false,
};

const defaultEmailSettings = {
  address: "",
  orders: true,
  tasks: false,
  payments: true,
  delivery: false,
};

const defaultSmtpSettings = {
  title: "",
  email: "",
  password: "",
  host: "smtp.gmail.com",
  port: 465,
  supportEmail: "",
  supportPhone: "",
  address: "",
};

const defaultCaptchaSettings = {
  siteKey: "",
  secretKey: "",
  enabled: true,
};

const defaultGatewaySettings = {
  provider: "aisensy",
  baseUrl: "",
  apiKey: "",
  campaignName: "",
  number: "",
  secretKey: "",
  enabled: false,
};

const sanitizeObject = (obj: any, defaults: any) => {
  if (!obj || typeof obj !== "object") return { ...defaults };
  const result = { ...defaults, ...obj };
  for (const key of Object.keys(result)) {
    if (result[key] === null || result[key] === undefined) {
      result[key] = defaults[key] !== undefined ? defaults[key] : "";
    }
  }
  return result;
};

export function SettingsPage() {
  const store = useERPStore();
  const [searchParams] = useSearchParams();

  // Active section state
  // 'hub' represents the grid overview, clicking a card loads a section.
  const [activeSection, setActiveSection] = useState<string>(() => searchParams.get("section") || "hub");

  useEffect(() => {
    const sec = searchParams.get("section");
    if (sec) {
      setActiveSection(sec);
    }
  }, [searchParams]);

  // Users List and Search state
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState("");

  // Modals state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);

  const [isPermModalOpen, setIsPermModalOpen] = useState(false);
  const [permUser, setPermUser] = useState<UserItem | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);

  // Quick Preset state
  const [pageAccessState, setPageAccessState] = useState<
    Record<string, boolean>
  >({});
  const [actionPermsState, setActionPermsState] = useState<PageActionPermissions>({});
  const [selectedActionModule, setSelectedActionModule] = useState("dashboard");

  // Standard PRBAC UI state
  const [permissionMode, setPermissionMode] = useState<"role" | "user">("role");
  const [selectedPermissionRole, setSelectedPermissionRole] = useState("");
  const [selectedPermissionUserId, setSelectedPermissionUserId] = useState("");
  const [selectedResourceKey, setSelectedResourceKey] = useState("");
  const [permissionRoleSearch, setPermissionRoleSearch] = useState("");
  const [permissionUserSearch, setPermissionUserSearch] = useState("");

  // Create single user form state
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);
  const [showEditUserPassword, setShowEditUserPassword] = useState(false);
  const [newUserDesignation, setNewUserDesignation] = useState("");
  const [newUserPhone, setNewUserPhone] = useState("");
  const [newUserRole, setNewUserRole] = useState("");
  const [newUserTeamId, setNewUserTeamId] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});

  // Create bulk users state
  const [bulkTab, setBulkTab] = useState<"single" | "bulk">("single");
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkPreview, setBulkPreview] = useState<any[]>([]);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkStatus, setBulkStatus] = useState<"idle" | "importing" | "done">(
    "idle",
  );
  const [bulkResults, setBulkResults] = useState({ created: 0, failed: 0 });

  // Manage Fields State
  const [orderFields, setOrderFields] = useState<Record<string, boolean>>({
    delivery_month_target: true,
    concerned_person: true,
    drawing_status: true,
    po_number: true,
    material_status: true,
    plant_status: true,
    advance_amount: true,
    balance_due: true,
    dispatch_date: true,
  });

  const [concernedPersons, setConcernedPersons] = useState<string[]>([]);
  const [newPersonName, setNewPersonName] = useState("");

  // Order Documents State
  const [orderDocuments, setOrderDocuments] = useState<DocumentCategoryDef[]>(() =>
    getOrderDocumentCategories(store.settings)
  );
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocMandatory, setNewDocMandatory] = useState(false);
  const [isSavingDocs, setIsSavingDocs] = useState(false);

  // Notifications state
  const [notifTab, setNotifTab] = useState<
    "contacts" | "smtp" | "templates" | "captcha" | "gateway"
  >("contacts");

  // WhatsApp settings state
  const [waSettings, setWaSettings] = useState(defaultWaSettings);
  const [showWaConfig, setShowWaConfig] = useState(false);

  // Email notifications state
  const [emailSettings, setEmailSettings] = useState(defaultEmailSettings);

  // Alert events toggles
  const [alertEvents, setAlertEvents] = useState<
    Record<string, { wa: boolean; email: boolean }>
  >({
    new_order: { wa: true, email: true },
    order_status: { wa: true, email: true },
    task_overdue: { wa: true, email: true },
    drawing: { wa: false, email: true },
    payment: { wa: false, email: true },
    delivery: { wa: true, email: true },
  });

  const [autoSendDefaults, setAutoSendDefaults] = useState({
    waAuto: true,
    emailAuto: false,
  });

  // SMTP Settings
  const [smtpSettings, setSmtpSettings] = useState(defaultSmtpSettings);
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [isEditingSmtp, setIsEditingSmtp] = useState(true);

  // Captcha settings
  const [captchaSettings, setCaptchaSettings] = useState(
    defaultCaptchaSettings,
  );

  // WhatsApp Gateway Settings
  const [gatewaySettings, setGatewaySettings] = useState(
    defaultGatewaySettings,
  );
  const [isEditingGateway, setIsEditingGateway] = useState(true);

  // Email Templates
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTestTemplateId, setSelectedTestTemplateId] = useState("");
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateContent1, setTemplateContent1] = useState("");
  const [templateContent2, setTemplateContent2] = useState("");
  const [templateType, setTemplateType] = useState("");

  // Theme & Appearance State
  const [sidebarPos, setSidebarPos] = useState<"left" | "right">("left");
  const [brandColor, setBrandColor] = useState("#33cc33");
  const [bgColor, setBgColor] = useState("#f8fafc");

  // Backup & Restore state
  const [backupFilename, setBackupFilename] = useState("DVEPL_Backup");
  const [backupModules, setBackupModules] = useState<string[]>([
    "orders",
    "users",
    "vendors",
    "tasks",
  ]);
  const [backupHistory, setBackupHistory] = useState<any[]>([]);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreMode, setRestoreMode] = useState<"merge" | "overwrite">(
    "merge",
  );
  const [designationsList, setDesignationsList] = useState<any[]>([]);
  const [teamsList, setTeamsList] = useState<any[]>([]);

  // 1. Initial Load of Users & Configuration from API or LocalStorage
  const loadUsersList = async () => {
    setLoadingUsers(true);
    try {
      const rolesList = await securityApi.roles.list().catch(() => []);
      useERPStore.setState({ roles: rolesList });

      // Fetch designations list from organization API
      const desList = await organizationApi.designations.list().catch(() => []);
      setDesignationsList(desList);

      // Fetch teams list from organization API
      const tList = await organizationApi.teams.list().catch(() => []);
      setTeamsList(tList);

      // Fetch users from API endpoint
      const list = await securityApi.users.list();
      console.log("list",list);
      if (Array.isArray(list) && list.length > 0) {
        const mapped: UserItem[] = list.map((u: any) => ({
          id: u.id,
          name:
            u.name ||
            `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
            "No Name",
          email: u.email || "",
          phone: u.phone || "",
          designation:
            typeof u.designation === "object" && u.designation
              ? u.designation.title || "Team Member"
              : u.designation || "Team Member",
          role: u.role || "user",
          pageAccess: u.pageAccess ?? ["dashboard", "vendors", "orders"],
          actionPermissions: u.actionPermissions || {
            create: true,
            edit: true,
            delete: false,
            export: true,
          },
          teamId: u.teamId || null,
          teamName: u.teamName || null,
        }));
        setUsers(mapped);
      } else {
        // Fallback to store users
        const fallback = store.users.map((u: any) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone || "",
          designation: "Staff Member",
          role: u.id === store.currentUserId ? "admin" : "user",
          pageAccess: ["dashboard", "vendors", "orders"],
          actionPermissions: {
            create: true,
            edit: true,
            delete: false,
            export: true,
          },
        }));
        setUsers(fallback);
      }
    } catch (err) {
      // Load fallback list on failure
      const fallback = store.users.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone || "",
        designation: "Staff Member",
        role: "user",
        pageAccess: ["dashboard", "vendors", "orders"],
        actionPermissions: {
          create: true,
          edit: true,
          delete: false,
          export: true,
        },
      }));
      setUsers(fallback);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    loadUsersList();

    const initSettings = async () => {
      // First read local storage for fast paint
      const savedOrderFields = localStorage.getItem("dvepl_order_fields");
      if (savedOrderFields) setOrderFields(JSON.parse(savedOrderFields));

      const savedPersons = localStorage.getItem("dvepl_concerned_persons");
      if (savedPersons) {
        setConcernedPersons(JSON.parse(savedPersons));
      } else {
        const defaultPersons = [
          " राहुल शर्मा (Sales)",
          " अमन प्रीत (Procurement)",
          " जसकीरत सिंह (Accounts)",
          " गुरमीत सिंह (Production)",
        ];
        setConcernedPersons(defaultPersons);
      }

      const savedWa = localStorage.getItem("dvepl_whatsapp_settings");
      if (savedWa)
        setWaSettings(sanitizeObject(JSON.parse(savedWa), defaultWaSettings));

      const savedEmail = localStorage.getItem("dvepl_email_settings");
      if (savedEmail)
        setEmailSettings(
          sanitizeObject(JSON.parse(savedEmail), defaultEmailSettings),
        );

      const savedEvents = localStorage.getItem("dvepl_alert_events");
      if (savedEvents) setAlertEvents(JSON.parse(savedEvents));

      const savedAutoSend = localStorage.getItem("dvepl_auto_send_defaults");
      if (savedAutoSend) setAutoSendDefaults(JSON.parse(savedAutoSend));

      const savedSmtp = localStorage.getItem("dvepl_smtp_settings");
      if (savedSmtp) {
        const smtp = JSON.parse(savedSmtp);
        const mappedSmtp = {
          ...smtp,
          email: smtp.email || smtp.username || "",
        };
        setSmtpSettings(sanitizeObject(mappedSmtp, defaultSmtpSettings));
        if (mappedSmtp.host) {
          setIsEditingSmtp(false);
        } else {
          setIsEditingSmtp(true);
        }
      } else {
        setIsEditingSmtp(true);
      }

      const savedCaptcha = localStorage.getItem("dvepl_captcha_settings");
      if (savedCaptcha)
        setCaptchaSettings(
          sanitizeObject(JSON.parse(savedCaptcha), defaultCaptchaSettings),
        );

      const savedGateway = localStorage.getItem("dvepl_whatsapp_gateway");
      if (savedGateway) {
        const parsed = JSON.parse(savedGateway);
        setGatewaySettings(sanitizeObject(parsed, defaultGatewaySettings));
        if (parsed.baseUrl) {
          setIsEditingGateway(false);
        } else {
          setIsEditingGateway(true);
        }
      } else {
        setIsEditingGateway(true);
      }

      const savedTemplates = localStorage.getItem("dvepl_email_templates");
      if (savedTemplates) {
        setTemplates(JSON.parse(savedTemplates));
      } else {
        const defaultTemplates = [
          {
            id: "1",
            name: "Order Confirmation",
            subject: "Your Order #{$poNumber} Placed",
            content1:
              "Hi {$name},\n\nThank you for your order. We are processing it.",
            content2: "Support: {$supportPhone}",
            type: "order_created",
          },
          {
            id: "2",
            name: "Welcome Email",
            subject: "Welcome to DVEPL Portal",
            content1:
              "Dear {$name},\n\nYour account has been registered successfully.",
            content2: "Regards,\nDVEPL Admin",
            type: "welcome",
          },
        ];
        setTemplates(defaultTemplates);
      }

      const savedThemePos = localStorage.getItem("dvepl_theme_sidebar_pos");
      if (savedThemePos) setSidebarPos(savedThemePos as any);

      const savedBrandColor =
        localStorage.getItem("dvepl_brand_color") || "#33cc33";
      setBrandColor(savedBrandColor);
      try {
        const hslVal = hexToHslString(savedBrandColor);
        document.documentElement.style.setProperty("--primary", hslVal);
      } catch (e) {
        document.documentElement.style.setProperty(
          "--primary",
          savedBrandColor,
        );
      }

      const savedBgColor = localStorage.getItem("dvepl_bg_color");
      if (savedBgColor) setBgColor(savedBgColor);

      const savedBackupHistory = localStorage.getItem("dvepl_backup_history");
      if (savedBackupHistory) setBackupHistory(JSON.parse(savedBackupHistory));

      // Now sync from backend store source of truth
      try {
        await store.fetchSettings();
        const settings = store.settings || {};
        if (settings.orderFields) setOrderFields(settings.orderFields);
        if (settings.orderDocuments && Array.isArray(settings.orderDocuments)) {
          setOrderDocuments(settings.orderDocuments);
          localStorage.setItem(
            "dvepl_order_documents",
            JSON.stringify(settings.orderDocuments)
          );
        }
        if (settings.concernedPersons)
          setConcernedPersons(settings.concernedPersons);
        if (settings.waSettings)
          setWaSettings(sanitizeObject(settings.waSettings, defaultWaSettings));
        if (settings.emailSettings)
          setEmailSettings(
            sanitizeObject(settings.emailSettings, defaultEmailSettings),
          );
        if (settings.alertEvents) setAlertEvents(settings.alertEvents);
        if (settings.autoSendDefaults)
          setAutoSendDefaults(settings.autoSendDefaults);
        if (settings.smtpSettings) {
          const mappedSmtp = {
            ...settings.smtpSettings,
            email:
              settings.smtpSettings.email ||
              settings.smtpSettings.username ||
              "",
          };
          setSmtpSettings(sanitizeObject(mappedSmtp, defaultSmtpSettings));
          if (mappedSmtp.host) {
            setIsEditingSmtp(false);
          } else {
            setIsEditingSmtp(true);
          }
        }
        if (settings.captchaSettings)
          setCaptchaSettings(
            sanitizeObject(settings.captchaSettings, defaultCaptchaSettings),
          );
        if (settings.gatewaySettings) {
          const mappedGateway = {
            ...settings.gatewaySettings,
            baseUrl:
              settings.gatewaySettings.baseUrl ||
              settings.gatewaySettings.instanceId ||
              "",
          };
          setGatewaySettings(
            sanitizeObject(mappedGateway, defaultGatewaySettings),
          );
          if (mappedGateway.baseUrl) {
            setIsEditingGateway(false);
          } else {
            setIsEditingGateway(true);
          }
        }
        if (settings.templates) setTemplates(settings.templates);
        if (settings.brandColor) {
          setBrandColor(settings.brandColor);
          try {
            const hslVal = hexToHslString(settings.brandColor);
            document.documentElement.style.setProperty("--primary", hslVal);
          } catch (e) {
            document.documentElement.style.setProperty(
              "--primary",
              settings.brandColor,
            );
          }
        }
        if (settings.bgColor) setBgColor(settings.bgColor);
        if (settings.sidebarPos) setSidebarPos(settings.sidebarPos);
        if (settings.backupHistory) setBackupHistory(settings.backupHistory);
      } catch (err) {
        console.error("Backend settings fetch failed", err);
      }
    };

    initSettings();
  }, []);

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter(
      (u) =>
        (u.name || "").toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.email || "").toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.role || "").toLowerCase().includes(userSearch.toLowerCase()),
    );
  }, [users, userSearch]);

  // Handle Edit User
  const handleOpenEditModal = (user: UserItem) => {
    setEditingUser({ ...user, password: "" });
    setShowEditUserPassword(false);
    setIsEditModalOpen(true);
  };

  const handleSaveUserEdit = async () => {
    if (!editingUser) return;
    try {
      if (securityApi.users.update) {
        await securityApi.users.update(editingUser.id, {
          name: editingUser.name,
          email: editingUser.email,
          role: editingUser.role,
          designation: editingUser.designation,
          password: editingUser.password || undefined,
          teamId: editingUser.teamId || null,
        });
      }
      toast.success("User details updated successfully");
      console.log("editing user : ", editingUser);
      setIsEditModalOpen(false);
      loadUsersList();
    } catch (err) {
      toast.error("Failed to update user");
    }
  };

  // Handle User Deletion (Open Custom Confirm Modal)
  const handleDeleteUser = (userId: string) => {
    setDeleteConfirmId(userId);
  };

  // Perform actual deletion
  const handleConfirmDeleteUser = async () => {
    if (!deleteConfirmId) return;
    try {
      if (securityApi.users.remove) {
        await securityApi.users.remove(deleteConfirmId);
      }
      toast.success("User deleted successfully");
      setDeleteConfirmId(null);
      loadUsersList();
    } catch (err) {
      toast.error("Failed to delete user");
    }
  };

  // Permissions Modal Page List
  const modulesList = [
    { key: "dashboard", label: "📊 Dashboard" },

    // Organization
    { key: "companies", label: "🏢 Companies" },
    { key: "branches", label: "🌿 Branches" },
    { key: "departments", label: "🌿 Departments" },
    { key: "teams", label: "👥 Teams" },
    { key: "cost_centers", label: "💼 Cost Centers" },

    // HRMS
    { key: "employees", label: "👤 Employees" },
    { key: "attendance", label: "⏰ Attendance" },
    { key: "leaves", label: "📅 Leaves" },
    { key: "holidays", label: "📅 Holidays" },
    { key: "tasks", label: "✅ Tasks" },
    { key: "roles", label: "🛡️ Roles" },

    // CRM
    { key: "customers", label: "🤝 Customers" },
    { key: "contacts", label: "📇 Contact Persons" },
    { key: "orders", label: "🛒 Orders" },
    { key: "delivery", label: "🚚 Delivery" },
    { key: "vendors", label: "🚚 Vendors" },
    { key: "inventory", label: "📦 Inventory" },
    { key: "export_orders", label: "📤 Engineering Drawing" },

    // Finance
    { key: "finance", label: "💵 Finance / Accounts" },

    // Sales
    { key: "workflow_tracker", label: "🔄 Workflow Tracker" },

    // Lead Management & Tenders
    { key: "tender_requests", label: "📂 Tender Requests" },
    { key: "tenders", label: "🗂️ Tenders" },
    { key: "technical_clarifications", label: "❓ Technical Clarifications" },
    { key: "government_departments", label: "🏢 Government Departments" },
    { key: "sections", label: "🌿 Sections" },
    { key: "divisions", label: "🌿 Divisions" },
    { key: "sub_divisions", label: "👥 Sub Divisions" },
    { key: "reference_codes", label: "📄 Reference Codes" },

    // Security
    { key: "users", label: "👤 Users" },

    // Other / Reports / Settings
    { key: "reports", label: "📊 Reports" },
    { key: "audit_logs", label: "📜 Audit Logs" },
    { key: "custom_fields", label: "⚙️ Custom Fields" },
    { key: "recycle_bin", label: "🗑️ Recycle Bin" },
    { key: "settings", label: "⚙️ Settings" },
  ];

  useEffect(() => {
    if (!selectedResourceKey && modulesList.length > 0) {
      setSelectedResourceKey(modulesList[0].key);
    }
  }, [selectedResourceKey]);

  // Standard PRBAC permission helpers
  const permissionRoles = useMemo(() => {
    const dbRoles = store.roles || [];
    if (dbRoles.length > 0) {
      return dbRoles.map((r: any) => r.name);
    }
    const roles = Array.from(
      new Set(users.map((user) => user.role?.trim()).filter(Boolean)),
    ) as string[];

    return roles.sort((a, b) => a.localeCompare(b));
  }, [users, store.roles]);

  const roleLabel = (role: string) =>
    role
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());

  const initializePermissionState = (source: {
    pageAccess?: string[];
    actionPermissions?: StoredActionPermissions;
  }) => {
    const pageObj: Record<string, boolean> = {};
    modulesList.forEach((module) => {
      pageObj[module.key] = source.pageAccess?.includes(module.key) ?? false;
    });
    setPageAccessState(pageObj);

    setActionPermsState(
      normalizePageActionPermissions(
        source.actionPermissions ?? LEGACY_ACTION_DEFAULTS,
        modulesList.map((module) => module.key),
      ),
    );

    setSelectedActionModule(
      source.pageAccess?.find((key) => modulesList.some((module) => module.key === key)) ||
        "dashboard",
    );
  };

  // Open the permission editor from an existing user row.
  // The editor starts in Role Permissions mode if the role exists in the database.
  // Otherwise, it falls back to User Overrides mode.
  const handleOpenPermModal = async (user: UserItem) => {
    const storeObj = useERPStore.getState();
    const hasRoleInDb = storeObj.roles?.some((r: any) => r.name === user.role);

    if (hasRoleInDb) {
      setPermissionMode("role");
      setSelectedPermissionRole(user.role);
    } else {
      setPermissionMode("user");
      setSelectedPermissionRole("");
    }
    setSelectedPermissionUserId(user.id);
    setPermissionRoleSearch("");
    setPermissionUserSearch("");
    setPermUser(user);
    // Role mode must initialize from the ROLE record, never from a member's
    // (possibly overridden) permissions — otherwise one user's override could
    // be silently propagated onto the whole role.
    initializePermissionState(
      hasRoleInDb
        ? (storeObj.roles?.find((r: any) => r.name === user.role) ?? user)
        : user,
    );
    setIsPermModalOpen(true);
  };

  const handleSelectPermissionRole = (role: string) => {
    setPermissionMode("role");
    setSelectedPermissionRole(role);

    const storeObj = useERPStore.getState();
    const roleObj = storeObj.roles?.find((r: any) => r.name === role);
    if (roleObj) {
      initializePermissionState(roleObj);
    } else {
      const roleUser = users.find((user) => user.role === role);
      if (roleUser) {
        setSelectedPermissionUserId(roleUser.id);
        initializePermissionState(roleUser);
      }
    }
  };

  const handleSelectPermissionUser = (user: UserItem) => {
    setPermissionMode("user");
    setSelectedPermissionUserId(user.id);
    setSelectedPermissionRole(user.role || "user");
    setPermUser(user);
    initializePermissionState(user);
  };

  const applyPreset = (preset: "full" | "viewer" | "none") => {
    const pageObj: Record<string, boolean> = {};

    modulesList.forEach((module) => {
      pageObj[module.key] = preset === "full" || preset === "viewer";
    });

    setPageAccessState(pageObj);
    setActionPermsState(
      Object.fromEntries(
        modulesList.map((module) => [
          module.key,
          preset === "full"
            ? { create: true, edit: true, delete: true, export: true }
            : preset === "viewer"
              ? { create: false, edit: false, delete: false, export: true }
              : NO_ACTIONS,
        ]),
      ),
    );
  };

  const savePermissions = async () => {
    if (!permUser) return;

    try {
      const pageAccess = Object.keys(pageAccessState).filter(
        (key) => pageAccessState[key],
      );

      // Role mode is the standard PRBAC path: the role owns the permission set.
      // Until a dedicated role-permission endpoint exists, the existing user update
      // endpoint is used to keep every user in that role synchronized.
      const targetUsers =
        permissionMode === "role"
          ? users.filter((user) => user.role === selectedPermissionRole)
          : [permUser];

      const permissionPayload = {
        pageAccess,
        actionPermissions: actionPermsState,
      };

      if (permissionMode === "role") {
        const storeRoles = store.roles || [];
        const roleObj = storeRoles.find(
          (role: any) => role.name === selectedPermissionRole,
        );

        if (!roleObj) {
          toast.error("Role not found");
          return;
        }

        if (securityApi.roles.update) {
          await securityApi.roles.update(roleObj.id, {
            name: roleObj.name,
            ...permissionPayload,
          });
        }

        // Role permissions are the source of truth for every member of the role.
        // Clear per-user overrides so the newly saved policy actually applies to
        // all of them (previously an override was permanent and the role edit
        // silently stopped affecting overridden users).
        await Promise.all(
          targetUsers.map((user) =>
            securityApi.users.update
              ? securityApi.users
                  .update(user.id, { hasOverride: false })
                  .catch(() => {
                    // A user's override reset is best-effort; the role itself is saved.
                  })
              : Promise.resolve(),
          ),
        );
      } else if (securityApi.users.update) {
        await securityApi.users.update(permUser.id, {
          ...permissionPayload,
          hasOverride: true,
        });
      }

      // Sync the role record so the UI reflects the saved role permissions even
      // when the role currently has no members (bug: role edit was blocked).
      useERPStore.setState({
        roles: (store.roles || []).map((role: any) =>
          permissionMode === "role" && role.name === selectedPermissionRole
            ? { ...role, ...permissionPayload }
            : role,
        ),
      });

      const targetIds = new Set(targetUsers.map((user) => user.id));
      const updatedUsers = users.map((user) =>
        targetIds.has(user.id)
          ? {
              ...user,
              pageAccess,
              actionPermissions: actionPermsState,
              hasOverride:
                permissionMode === "role" ? false : user.hasOverride,
            }
          : user,
      );

      setUsers(updatedUsers);

      // Sync Zustand so permission-dependent UI changes immediately.
      const updatedStoreUsers = store.users.map((user: any) =>
        targetIds.has(user.id)
          ? {
              ...user,
              pageAccess,
              actionPermissions: actionPermsState,
              hasOverride:
                permissionMode === "role" ? false : user.hasOverride,
            }
          : user,
      );
      useERPStore.setState({ users: updatedStoreUsers });

      toast.success(
        permissionMode === "role"
          ? `${roleLabel(selectedPermissionRole)} permissions updated`
          : "User permission override updated",
      );
      setIsPermModalOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save permissions");
    }
  };

  // Clear a per-user override so the user goes back to inheriting the role's
  // permission policy (previously there was no way to un-override a user).
  const handleResetUserOverride = async () => {
    if (!permUser || !selectedPermissionRole) return;
    try {
      if (securityApi.users.update) {
        await securityApi.users.update(permUser.id, { hasOverride: false });
      }

      const storeObj = useERPStore.getState();
      const roleObj = storeObj.roles?.find(
        (r: any) => r.name === selectedPermissionRole,
      );

      // Re-initialize the modal from the role so it shows inherited permissions.
      setPermissionMode("role");
      initializePermissionState(roleObj ?? permUser);

      const reset = (u: any) =>
        u.id === permUser.id ? { ...u, hasOverride: false } : u;
      setUsers((prev) => prev.map(reset));
      useERPStore.setState({
        users: useERPStore.getState().users.map(reset),
      });

      toast.success(
        "Override cleared — user now inherits role permissions",
      );
    } catch (err) {
      console.error(err);
      toast.error("Failed to reset override");
    }
  };

  // 2. Create User Handlers
  const handleCreateUser = async () => {
    const errors: Record<string, boolean> = {};

    if (!newUserName.trim() || newUserName.trim().length < 2) {
      errors.name = true;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!newUserEmail.trim() || !emailRegex.test(newUserEmail.trim())) {
      errors.email = true;
    }
    if (!newUserPassword || newUserPassword.length < 4) {
      errors.password = true;
    }
    if (!newUserRole) {
      errors.role = true;
    }
    if (newUserPhone) {
      const phoneRegex = /^\+?[\d\s-]{10,15}$/;
      if (!phoneRegex.test(newUserPhone.trim())) {
        errors.phone = true;
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error("Please correct the highlighted fields");
      return;
    }

    setFormErrors({});

    try {
      await securityApi.users.create({
        name: newUserName.trim(),
        email: newUserEmail.trim().toLowerCase(),
        password: newUserPassword,
        role: newUserRole,
        designation: newUserDesignation.trim() || undefined,
        phone: newUserPhone.trim() || undefined,
        teamId: newUserTeamId || undefined,
      });
      toast.success("User created successfully");
      // Reset form
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserDesignation("");
      setNewUserPhone("");
      setNewUserRole("");
      setNewUserTeamId("");
      setFormErrors({});
      loadUsersList();
      setActiveSection("manage-users");
    } catch (err: any) {
      const errMsg =
        err.response?.data?.message || err.message || "Failed to create user";
      toast.error(errMsg);
    }
  };

  // Bulk Excel import
  const handleBulkFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFile(file);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<any>(worksheet);

        // Map keys to preview table headers
        const headerMap: Record<string, string> = {
          name: "name",
          email: "email",
          phone: "phone",
          password: "password",
          role: "role",
          designation: "designation",
        };

        const parsedPreview = rows.map((rawRow: any) => {
          const row: any = {};
          for (const key of Object.keys(rawRow)) {
            const cleanKey = key.trim().toLowerCase();
            const mappedKey = headerMap[cleanKey] || key;
            row[mappedKey] = rawRow[key];
          }
          return {
            name: row.name || "N/A",
            email: row.email || "N/A",
            role: row.role || "N/A",
            designation: row.designation || "Team Member",
            status: row.email ? "Ready" : "Invalid Row (No Email)",
          };
        });

        setBulkPreview(parsedPreview);
      } catch (err) {
        toast.error("Failed to parse Excel file preview");
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleBulkImport = async () => {
    if (!bulkFile) return;
    setBulkStatus("importing");
    setBulkProgress(20);

    try {
      setBulkProgress(50);
      const res = await (securityApi.users as any).bulkImport(bulkFile);
      setBulkProgress(100);

      const successCount = res.data?.successCount || 0;
      const failureCount = res.data?.failureCount || 0;

      setBulkStatus("done");
      setBulkResults({ created: successCount, failed: failureCount });

      if (failureCount > 0) {
        toast.error(
          `Import finished with ${failureCount} errors. ${successCount} imported successfully.`,
        );
      } else {
        toast.success(`All ${successCount} users imported successfully!`);
      }

      loadUsersList();
    } catch (err: any) {
      setBulkStatus("idle");
      toast.error(err.response?.data?.message || "Bulk import failed.");
    }
  };

  const downloadExcelTemplate = () => {
    // Generate true XLSX file template using SheetJS
    const headers = [
      ["Name", "Email", "Password", "Role", "Designation", "Phone", "Team"],
    ];
    const data = [
      [
        "John Doe",
        "john@dvepl.com",
        "Dvepl@2026",
        "admin",
        "Executive",
        "9876543210",
        "Engineering",
      ],
      [
        "Jane Smith",
        "jane@dvepl.com",
        "Dvepl@2026",
        "sales",
        "Manager",
        "9876543211",
        "Sales Team",
      ],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet([...headers, ...data]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Users Template");

    // Write XLSX output to binary format
    const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "DVEPL_Users_Import_Template.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Excel template downloaded successfully");
  };

  const updateStoreSettings = async (partialSettings: any) => {
    try {
      const current = store.settings || {};
      const payload = {
        ...current,
        ...partialSettings,
      };
      await store.updateSettings(payload);
    } catch (e) {
      console.error("Failed to update settings:", e);
    }
  };

  // 3. Manage Fields Handlers
  const handleToggleField = (field: string) => {
    const updated = { ...orderFields, [field]: !orderFields[field] };
    setOrderFields(updated);
    localStorage.setItem("dvepl_order_fields", JSON.stringify(updated));
    updateStoreSettings({ orderFields: updated });
    toast.success("Fields configuration updated");
  };

  const handleAddConcernedPerson = () => {
    if (!newPersonName.trim()) return;
    const updated = [...concernedPersons, newPersonName.trim()];
    setConcernedPersons(updated);
    localStorage.setItem("dvepl_concerned_persons", JSON.stringify(updated));
    updateStoreSettings({ concernedPersons: updated });
    setNewPersonName("");
    toast.success("Concerned person added");
  };

  const handleRemoveConcernedPerson = (index: number) => {
    const updated = concernedPersons.filter((_, i) => i !== index);
    setConcernedPersons(updated);
    localStorage.setItem("dvepl_concerned_persons", JSON.stringify(updated));
    updateStoreSettings({ concernedPersons: updated });
    toast.success("Concerned person removed");
  };

  // 3b. Order Documents Handlers
  const handleToggleDocMandatory = (index: number) => {
    setOrderDocuments((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, isMandatory: !item.isMandatory } : item
      )
    );
  };

  const handleUpdateDocTitle = (index: number, name: string) => {
    setOrderDocuments((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, name } : item))
    );
  };

  const handleRemoveDoc = (index: number) => {
    setOrderDocuments((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAddDoc = () => {
    const trimmed = newDocTitle.trim();
    if (!trimmed) {
      toast.error("Please enter a document title.");
      return;
    }
    if (
      orderDocuments.some(
        (doc) => doc.name.trim().toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      toast.error(`"${trimmed}" already exists in the document list.`);
      return;
    }

    setOrderDocuments((prev) => [
      ...prev,
      {
        name: trimmed,
        isMandatory: newDocMandatory,
        description: "",
      },
    ]);
    setNewDocTitle("");
    setNewDocMandatory(false);
  };

  const handleResetDocs = () => {
    setOrderDocuments(INITIAL_DOCUMENT_CATEGORIES.map((c) => ({ ...c })));
    toast.success("Reset document categories to system defaults.");
  };

  const handleSaveDocs = async () => {
    const cleaned = orderDocuments
      .map((d) => ({ ...d, name: d.name.trim() }))
      .filter((d) => d.name.length > 0);

    if (cleaned.length === 0) {
      toast.error("At least one document type must be configured.");
      return;
    }

    const setNames = new Set<string>();
    for (const d of cleaned) {
      const lower = d.name.toLowerCase();
      if (setNames.has(lower)) {
        toast.error(`Duplicate document "${d.name}" found.`);
        return;
      }
      setNames.add(lower);
    }

    setIsSavingDocs(true);
    try {
      await saveOrderDocumentCategories(cleaned, store.updateSettings);
      toast.success("Order documents configuration saved successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save order documents.");
    } finally {
      setIsSavingDocs(false);
    }
  };

  // 4. Notifications Handlers
  const saveNotifSettings = () => {
    localStorage.setItem("dvepl_whatsapp_settings", JSON.stringify(waSettings));
    localStorage.setItem("dvepl_email_settings", JSON.stringify(emailSettings));
    localStorage.setItem("dvepl_alert_events", JSON.stringify(alertEvents));
    localStorage.setItem(
      "dvepl_auto_send_defaults",
      JSON.stringify(autoSendDefaults),
    );
    updateStoreSettings({
      waSettings,
      emailSettings,
      alertEvents,
      autoSendDefaults,
    });
  };

  const testWaConnection = async () => {
    if (!waSettings.number) {
      toast.error("Please enter a valid WhatsApp Number");
      return;
    }
    try {
      const promise = securityApi.settings.testWhatsapp({
        provider: gatewaySettings.provider || "aisensy",
        apiKey: gatewaySettings.apiKey,
        campaignName: gatewaySettings.campaignName,
        number: waSettings.number,
      });
      await toast.promise(promise, {
        loading: "Sending test WhatsApp message...",
        success: "Test WhatsApp message sent successfully!",
        error: (err: any) =>
          err?.response?.data?.message || "Failed to send WhatsApp message.",
      });
    } catch (e) {
      console.error(e);
    }
  };

  const testEmailConnection = async () => {
    const targetEmail = emailSettings.address || smtpSettings.email || "admin@dvepl.com";
    try {
      let customFields = {};
      if (selectedTestTemplateId) {
        const template = templates.find((t) => t.id === selectedTestTemplateId);
        if (template) {
          const replaceVars = (str: string) => {
            return (str || "")
              .replace(/\{\$name\}/g, "John Doe")
              .replace(/\{\$poNumber\}/g, "PO-2026-0001")
              .replace(/\{\$vendorName\}/g, "Acme Industrial Corp")
              .replace(
                /\{\$supportPhone\}/g,
                smtpSettings.supportPhone || "+91 9876543210",
              )
              .replace(
                /\{\$supportEmail\}/g,
                smtpSettings.supportEmail || "support@dvepl.com",
              );
          };

          const finalSubject = replaceVars(template.subject);
          const finalContent1 = replaceVars(template.content1);
          const finalContent2 = replaceVars(template.content2);

          const emailText = `${finalContent1}\n\n${finalContent2}`;
          const emailHtml = `<div style="font-family: sans-serif; font-size: 14px; line-height: 1.5; color: #333;">
            <p>${finalContent1.replace(/\n/g, "<br>")}</p>
            ${finalContent2 ? `<hr style="border: 0; border-top: 1px solid #eee; margin: 15px 0;" /><p style="color: #666; font-size: 12px;">${finalContent2.replace(/\n/g, "<br>")}</p>` : ""}
          </div>`;

          customFields = {
            subject: finalSubject,
            text: emailText,
            html: emailHtml,
          };
        }
      }

      const promise = securityApi.settings.sendTestEmail({
        smtpSettings: {
          ...smtpSettings,
          username: smtpSettings.email,
          secure: smtpSettings.port === 465,
        },
        toEmail: targetEmail,
        fromEmail: smtpSettings.email,
        fromName: smtpSettings.title || "DVEPL ERP",
        ...customFields,
      });
      await toast.promise(promise, {
        loading: "Sending test email...",
        success: "Test email sent successfully!",
        error: (err: any) =>
          err?.response?.data?.message || "Failed to send email.",
      });
    } catch (e) {
      console.error(e);
    }
  };

  const saveSmtpSettings = () => {
    const updatedSmtp = {
      ...smtpSettings,
      username: smtpSettings.email,
    };
    localStorage.setItem("dvepl_smtp_settings", JSON.stringify(updatedSmtp));
    updateStoreSettings({ smtpSettings: updatedSmtp });
    toast.success("SMTP configuration saved successfully");
    setIsEditingSmtp(false);
  };

  const testSmtpConnection = async () => {
    try {
      const promise = securityApi.settings.testSmtp({
        host: smtpSettings.host,
        port: smtpSettings.port,
        username: smtpSettings.email,
        password: smtpSettings.password,
        secure: Number(smtpSettings.port) === 465,
      });
      await toast.promise(promise, {
        loading: "Testing SMTP connection...",
        success: "SMTP server connected successfully!",
        error: (err: any) =>
          err?.response?.data?.message ||
          "SMTP connection failed. Check host and credentials.",
      });
    } catch (e) {
      console.error(e);
    }
  };

  const saveCaptchaSettings = () => {
    localStorage.setItem(
      "dvepl_captcha_settings",
      JSON.stringify(captchaSettings),
    );
    updateStoreSettings({ captchaSettings });
    toast.success("Captcha settings saved");
  };

  const saveGatewaySettings = () => {
    const updatedGateway = {
      ...gatewaySettings,
      provider: gatewaySettings.provider || "aisensy",
      instanceId: gatewaySettings.baseUrl,
    };
    localStorage.setItem(
      "dvepl_whatsapp_gateway",
      JSON.stringify(updatedGateway),
    );
    updateStoreSettings({ gatewaySettings: updatedGateway });
    toast.success("WhatsApp Gateway settings saved");
    setIsEditingGateway(false);
  };

  const testGateway = async () => {
    try {
      const promise = securityApi.settings.testWhatsapp({
        provider: gatewaySettings.provider || "aisensy",
        apiKey: gatewaySettings.apiKey,
        campaignName: gatewaySettings.campaignName,
        number: gatewaySettings.number,
      });
      await toast.promise(promise, {
        loading: "Connecting to AiSensy...",
        success: "AiSensy connection verified!",
        error: (err: any) =>
          err?.response?.data?.message || "AiSensy unreachable.",
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Template Handlers
  const handleSaveTemplate = () => {
    if (
      !templateName ||
      !templateSubject ||
      !templateContent1 ||
      !templateType
    ) {
      toast.error("Please fill in all template required fields");
      return;
    }
    let updated;
    if (editingTemplate) {
      updated = templates.map((t) =>
        t.id === editingTemplate.id
          ? {
              ...t,
              name: templateName,
              subject: templateSubject,
              content1: templateContent1,
              content2: templateContent2,
              type: templateType,
            }
          : t,
      );
      toast.success("Template updated successfully");
    } else {
      const newT = {
        id: Date.now().toString(),
        name: templateName,
        subject: templateSubject,
        content1: templateContent1,
        content2: templateContent2,
        type: templateType,
      };
      updated = [...templates, newT];
      toast.success("Template added successfully");
    }
    setTemplates(updated);
    localStorage.setItem("dvepl_email_templates", JSON.stringify(updated));
    updateStoreSettings({ templates: updated });
    cancelTemplateForm();
  };

  const handleEditTemplate = (t: any) => {
    setEditingTemplate(t);
    setTemplateName(t.name);
    setTemplateSubject(t.subject);
    setTemplateContent1(t.content1);
    setTemplateContent2(t.content2 || "");
    setTemplateType(t.type);
    setShowTemplateForm(true);
  };

  const handleDeleteTemplate = (id: string) => {
    setDeleteTemplateId(id);
  };

  const handleConfirmDeleteTemplate = () => {
    if (!deleteTemplateId) return;
    const updated = templates.filter((t) => t.id !== deleteTemplateId);
    setTemplates(updated);
    localStorage.setItem("dvepl_email_templates", JSON.stringify(updated));
    updateStoreSettings({ templates: updated });
    toast.success("Template deleted");
    setDeleteTemplateId(null);
  };

  const cancelTemplateForm = () => {
    setShowTemplateForm(false);
    setEditingTemplate(null);
    setTemplateName("");
    setTemplateSubject("");
    setTemplateContent1("");
    setTemplateContent2("");
    setTemplateType("");
  };

  // 5. Theme & Appearance
  const selectBrandColor = (color: string) => {
    setBrandColor(color);
    localStorage.setItem("dvepl_brand_color", color);
    updateStoreSettings({ brandColor: color });
    try {
      const hslVal = hexToHslString(color);
      document.documentElement.style.setProperty("--primary", hslVal);
    } catch (e) {
      document.documentElement.style.setProperty("--primary", color);
    }
    toast.success("Primary brand color updated");
  };

  const selectBgColor = (color: string) => {
    setBgColor(color);
    localStorage.setItem("dvepl_bg_color", color);
    updateStoreSettings({ bgColor: color });
    document.documentElement.style.setProperty("--bg", color);
    toast.success("Background color updated");
  };

  const selectSidebarPos = (pos: "left" | "right") => {
    setSidebarPos(pos);
    localStorage.setItem("dvepl_theme_sidebar_pos", pos);
    updateStoreSettings({ sidebarPos: pos });
    window.dispatchEvent(new Event("dvepl_sidebar_pos_changed"));
    toast.success(`Sidebar moved to the ${pos}`);
  };

  const resetThemeToDefault = () => {
    setBrandColor("#33cc33");
    setBgColor("#f8fafc");
    setSidebarPos("left");
    localStorage.removeItem("dvepl_brand_color");
    localStorage.removeItem("dvepl_bg_color");
    localStorage.removeItem("dvepl_theme_sidebar_pos");
    updateStoreSettings({
      brandColor: "#33cc33",
      bgColor: "#f8fafc",
      sidebarPos: "left",
    });
    document.documentElement.style.setProperty("--primary", "120 60% 50%"); // HSL coordinates for #33cc33
    document.documentElement.style.setProperty("--bg", "#f8fafc");
    window.dispatchEvent(new Event("dvepl_sidebar_pos_changed"));
    toast.success("Theme reset to system defaults");
  };

  // 6. Backup & Restore
  const downloadBackup = async () => {
    try {
      // Fetch latest backup from backend (merging DB + json settings)
      const backupData = await securityApi.settings
        .exportBackup()
        .catch(() => ({
          timestamp: new Date().toISOString(),
          theme: store.theme,
          orderFields,
          concernedPersons,
          waSettings,
          emailSettings,
          smtpSettings,
          captchaSettings,
          gatewaySettings,
          templates,
        }));

      const str = JSON.stringify(backupData, null, 2);
      const blob = new Blob([str], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${backupFilename || "DVEPL_Backup"}_${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Save to backup history
      const newHistory = [
        {
          id: Date.now().toString(),
          filename: `${backupFilename || "DVEPL_Backup"}.json`,
          size: `${(str.length / 1024).toFixed(2)} KB`,
          date: new Date().toLocaleString(),
          modules: backupModules.join(", "),
        },
        ...backupHistory,
      ];
      setBackupHistory(newHistory);
      localStorage.setItem("dvepl_backup_history", JSON.stringify(newHistory));
      updateStoreSettings({ backupHistory: newHistory });

      toast.success("Backup file generated and downloaded");
    } catch (error) {
      toast.error("Failed to generate backup.");
    }
  };

  const restoreBackup = () => {
    if (!restoreFile) {
      toast.error("Please select a JSON backup file to restore");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);

        // Push the restore data to the backend settings and database
        await securityApi.settings.importBackup(data).catch(() => {});

        const payload: any = {};
        if (data.orderFields) {
          setOrderFields(data.orderFields);
          payload.orderFields = data.orderFields;
          localStorage.setItem(
            "dvepl_order_fields",
            JSON.stringify(data.orderFields),
          );
        }
        if (data.concernedPersons) {
          setConcernedPersons(data.concernedPersons);
          payload.concernedPersons = data.concernedPersons;
          localStorage.setItem(
            "dvepl_concerned_persons",
            JSON.stringify(data.concernedPersons),
          );
        }
        if (data.waSettings) {
          setWaSettings(data.waSettings);
          payload.waSettings = data.waSettings;
          localStorage.setItem(
            "dvepl_whatsapp_settings",
            JSON.stringify(data.waSettings),
          );
        }
        if (data.emailSettings) {
          setEmailSettings(data.emailSettings);
          payload.emailSettings = data.emailSettings;
          localStorage.setItem(
            "dvepl_email_settings",
            JSON.stringify(data.emailSettings),
          );
        }
        if (data.smtpSettings) {
          setSmtpSettings(data.smtpSettings);
          payload.smtpSettings = data.smtpSettings;
          localStorage.setItem(
            "dvepl_smtp_settings",
            JSON.stringify(data.smtpSettings),
          );
        }
        if (data.templates) {
          setTemplates(data.templates);
          payload.templates = data.templates;
          localStorage.setItem(
            "dvepl_email_templates",
            JSON.stringify(data.templates),
          );
        }
        updateStoreSettings(payload);
        toast.success("Backup restored successfully!");
      } catch (err) {
        toast.error(
          "Failed to parse backup file. Please use a valid DVEPL Backup JSON file.",
        );
      }
    };
    reader.readAsText(restoreFile);
  };

  const rolesList =
    store.roles && store.roles.length > 0
      ? store.roles
      : [
          { id: "1", name: "Admin" },
          { id: "2", name: "Sales Executive" },
          { id: "3", name: "Project Manager" },
          { id: "4", name: "Procurement Manager" },
          { id: "5", name: "Accounts Team" },
          { id: "6", name: "Production Team" },
          { id: "7", name: "User" },
        ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 pb-12">
      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            System Settings
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
            ⚙️ Settings & Control Panel
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Manage users, custom fields, theme styling, SMTP, templates and
            WhatsApp configurations.
          </p>
        </div>
        {activeSection !== "hub" && (
          <button
            onClick={() => setActiveSection("hub")}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg bg-card text-xs font-bold text-muted-foreground hover:text-foreground transition shadow-sm"
          >
            ← Back to Hub
          </button>
        )}
      </div>

      {/* ─── SECTION 1: HUB CARDS OVERVIEW ─── */}
      {activeSection === "hub" && (
        <div className="settings-hub">
          <div
            className="hub-card"
            onClick={() => setActiveSection("manage-users")}
          >
            <div className="hub-icon-wrap green">👤</div>
            <div className="hub-card-body">
              <div className="hub-card-title">Manage Users</div>
              <div className="hub-card-desc">
                View, edit, delete, assign roles and custom permissions.
              </div>
            </div>
            <div className="hub-arrow">→</div>
          </div>

          <div
            className="hub-card"
            onClick={() => {
              setActiveSection("create-user");
              setBulkTab("single");
            }}
          >
            <div className="hub-icon-wrap blue">➕</div>
            <div className="hub-card-body">
              <div className="hub-card-title">Create User</div>
              <div className="hub-card-desc">
                Add a new team member individually or bulk import from Excel.
              </div>
            </div>
            <div className="hub-arrow">→</div>
          </div>

          <div
            className="hub-card"
            onClick={() => setActiveSection("order-documents")}
          >
            <div className="hub-icon-wrap teal">📑</div>
            <div className="hub-card-body">
              <div className="hub-card-title">Order Documents</div>
              <div className="hub-card-desc">
                Customize document types and mandatory requirements for order creation.
              </div>
            </div>
            <div className="hub-arrow">→</div>
          </div>

          



          <div className="hub-card" onClick={() => setActiveSection('notifications')}>
            <div className="hub-icon-wrap purple">🔔</div>
            <div className="hub-card-body">
              <div className="hub-card-title">Notifications & SMTP</div>
              <div className="hub-card-desc">
                Configure WhatsApp Gateway, SMTP credentials and templates.
              </div>
            </div>
            <div className="hub-arrow">→</div>
          </div>

          <div className="hub-card" onClick={() => setActiveSection("theme")}>
            <div className="hub-icon-wrap pink">🎨</div>
            <div className="hub-card-body">
              <div className="hub-card-title">Theme & Appearance</div>
              <div className="hub-card-desc">
                Modify brand colors, layouts and sidebar positioning.
              </div>
            </div>
            <div className="hub-arrow">→</div>
          </div>

          <div className="hub-card" onClick={() => setActiveSection("backup")}>
            <div className="hub-icon-wrap blue">💾</div>
            <div className="hub-card-body">
              <div className="hub-card-title">Backup & Restore</div>
              <div className="hub-card-desc">
                Export all system details to local storage backup or restore.
              </div>
            </div>
            <div className="hub-arrow">→</div>
          </div>
        </div>
      )}

      {/* ─── SECTION 2: MANAGE USERS ─── */}
      {activeSection === "manage-users" && (
        <div className="space-y-4">
          <div className="section-card">
            <div className="section-header">
              <div className="section-icon">👤</div>
              <div>
                <div className="section-title">Manage Users</div>
                <div className="section-desc">
                  View and manage system users. Click 🔐 Permissions to
                  fine-tune access control.
                </div>
              </div>
            </div>
            <div className="p-4 bg-muted/10 border-b border-border flex flex-col md:flex-row gap-3 items-center justify-between">
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search by name, email or role..."
                className="w-full md:max-w-md px-3.5 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
              />
              <div className="text-xs text-muted-foreground font-semibold flex items-center gap-3">
                <span>Total: {users.length} users</span>
                <button
                  onClick={() => {
                    setActiveSection("create-user");
                    setBulkTab("single");
                  }}
                  className="px-3.5 py-1.5 text-xs bg-primary text-white font-bold rounded-lg hover:bg-primary/95 transition shadow-sm"
                >
                  ➕ Add User
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-muted/15 border-b border-border">
                  <tr>
                    <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Name
                    </th>
                    <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Email
                    </th>
                    <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Designation
                    </th>
                    <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Role
                    </th>
                    <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loadingUsers ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-8 text-center text-muted-foreground"
                      >
                        ⏳ Loading system users...
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-8 text-center text-muted-foreground"
                      >
                        No users found matching search query.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-muted/10">
                        <td className="p-3 font-semibold text-foreground flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-bold text-[10px]">
                            {user.name.charAt(0).toUpperCase()}
                          </span>
                          {user.name}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {user.email}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          <div>{user.designation || "Staff"}</div>
                          {user.teamName && (
                            <div className="text-[10px] text-muted-foreground/75 font-semibold mt-0.5">
                              Team: {user.teamName}
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          <span
                            className={`role-badge ${user.role.toLowerCase()}`}
                          >
                            {user.role}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="inline-flex gap-1.5">
                            <button
                              onClick={() => handleOpenPermModal(user)}
                              className="px-2 py-1 text-[10px] font-bold bg-primary-pale text-primary border border-primary/25 rounded-md hover:bg-primary-pale/80"
                            >
                              🔐 Permissions
                            </button>
                            <button
                              onClick={() => handleOpenEditModal(user)}
                              className="px-2 py-1 text-[10px] font-bold bg-muted text-muted-foreground border border-border rounded-md hover:bg-border"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              className="px-2 py-1 text-[10px] font-bold bg-red-50 text-red-600 border border-red-200 rounded-md hover:bg-red-100"
                            >
                              🗑 Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── SECTION 3: CREATE USER ─── */}
      {activeSection === "create-user" && (
        <div className="space-y-4">
          {/* Sub Navigation */}
          <div className="flex border-b border-border gap-4">
            <button
              onClick={() => setBulkTab("single")}
              className={`pb-2 text-xs font-bold transition border-b-2 ${bulkTab === "single" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
            >
              👤 Single User
            </button>
            <button
              onClick={() => setBulkTab("bulk")}
              className={`pb-2 text-xs font-bold transition border-b-2 ${bulkTab === "bulk" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
            >
              📊 Bulk Import
            </button>
          </div>

          {bulkTab === "single" ? (
            <div className="section-card">
              <div className="section-header">
                <div className="section-icon">➕</div>
                <div>
                  <div className="section-title">New User Account</div>
                  <div className="section-desc">
                    Create a new user credentials profile directly.
                  </div>
                </div>
              </div>
              <form
                className="section-body space-y-4"
                autoComplete="off"
                onSubmit={(e) => e.preventDefault()}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      placeholder="e.g. Rahul Sharma"
                      autoComplete="new-user-name"
                      className={`w-full px-3.5 py-2 text-xs border bg-card rounded-lg outline-none focus:border-primary ${formErrors.name ? "border-red-500 shake-input" : "border-border"}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="e.g. rahul@dvepl.com"
                      autoComplete="new-user-email"
                      className={`w-full px-3.5 py-2 text-xs border bg-card rounded-lg outline-none focus:border-primary ${formErrors.email ? "border-red-500 shake-input" : "border-border"}`}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showNewUserPassword ? "text" : "password"}
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        className={`w-full pl-3.5 pr-10 py-2 text-xs border bg-card rounded-lg outline-none focus:border-primary ${formErrors.password ? "border-red-500 shake-input" : "border-border"}`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowNewUserPassword(!showNewUserPassword)
                        }
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground focus:outline-none"
                      >
                        {showNewUserPassword ? (
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Designation
                    </label>
                    <select
                      value={newUserDesignation}
                      onChange={(e) => setNewUserDesignation(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                    >
                      <option value="">— Select Designation —</option>
                      {designationsList.map((d: any) => (
                        <option key={d.id} value={d.title}>
                          {d.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      value={newUserPhone}
                      onChange={(e) => setNewUserPhone(e.target.value)}
                      placeholder="e.g. 9876543210"
                      autoComplete="new-user-phone"
                      className={`w-full px-3.5 py-2 text-xs border bg-card rounded-lg outline-none focus:border-primary ${formErrors.phone ? "border-red-500 shake-input" : "border-border"}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      User Role *
                    </label>
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value)}
                      className={`w-full px-3.5 py-2 text-xs border bg-card rounded-lg outline-none focus:border-primary ${formErrors.role ? "border-red-500 shake-input" : "border-border"}`}
                    >
                      <option value="">— Select a role —</option>
                      {rolesList.map((r) => (
                        <option key={r.id} value={r.name.toLowerCase()}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Team (Optional)
                    </label>
                    <select
                      value={newUserTeamId}
                      onChange={(e) => setNewUserTeamId(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                    >
                      <option value="">— Select Team —</option>
                      {teamsList.map((t: any) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="border-t border-border pt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSection("manage-users");
                      setFormErrors({});
                    }}
                    className="px-4 py-2 border border-border rounded-lg bg-card text-xs font-bold text-muted-foreground hover:text-foreground transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateUser}
                    className="px-4 py-2 bg-primary text-white font-bold rounded-lg text-xs hover:bg-primary/95 transition shadow-sm"
                  >
                    Create User →
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="section-card">
              <div className="section-header">
                <div className="section-icon">📊</div>
                <div>
                  <div className="section-title">Bulk Import Users</div>
                  <div className="section-desc">
                    Create multiple accounts by uploading an Excel file.
                  </div>
                </div>
              </div>
              <div className="section-body space-y-4">
                <div className="p-4 bg-muted/20 border border-dashed border-border rounded-lg flex flex-col md:flex-row items-center justify-between gap-4">
                  <div>
                    <h4 className="text-xs font-bold text-foreground">
                      📋 Excel Import Template
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Required fields: Name, Email, Password, Role. Optional:
                      Designation, Phone.
                    </p>
                  </div>
                  <button
                    onClick={downloadExcelTemplate}
                    className="px-3 py-1.5 text-xs bg-primary text-white font-bold rounded-lg hover:bg-primary/95 transition flex items-center gap-1 shadow-sm"
                  >
                    ⬇️ Download Template
                  </button>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Select Excel File
                  </label>
                  <input
                    type="file"
                    accept=".xls,.xlsx"
                    onChange={handleBulkFileChange}
                    className="w-full p-2 border border-border bg-card rounded-lg text-xs"
                  />
                </div>

                {/* Preview Grid */}
                {bulkPreview.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-foreground">
                      📋 Preview Data ({bulkPreview.length} records ready)
                    </div>
                    <div className="overflow-hidden border border-border rounded-lg">
                      <table className="w-full text-[11px] text-left border-collapse">
                        <thead className="bg-muted/15 border-b border-border">
                          <tr>
                            <th className="p-2 font-bold text-muted-foreground">
                              Name
                            </th>
                            <th className="p-2 font-bold text-muted-foreground">
                              Email
                            </th>
                            <th className="p-2 font-bold text-muted-foreground">
                              Role
                            </th>
                            <th className="p-2 font-bold text-muted-foreground">
                              Designation
                            </th>
                            <th className="p-2 font-bold text-muted-foreground text-center">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {bulkPreview.map((row, idx) => (
                            <tr key={idx} className="hover:bg-muted/5">
                              <td className="p-2 font-semibold">{row.name}</td>
                              <td className="p-2">{row.email}</td>
                              <td className="p-2">
                                <span className={`role-badge ${row.role}`}>
                                  {row.role}
                                </span>
                              </td>
                              <td className="p-2 text-muted-foreground">
                                {row.designation}
                              </td>
                              <td className="p-2 text-center text-green-600 font-bold">
                                {row.status}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Progress bar */}
                {bulkStatus === "importing" && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span>Importing accounts...</span>
                      <span>{bulkProgress}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden border border-border">
                      <div
                        className="bg-primary h-full transition-all duration-300"
                        style={{ width: `${bulkProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Results block */}
                {bulkStatus === "done" && (
                  <div className="p-3 bg-primary-pale border border-primary/25 rounded-lg text-xs">
                    <div className="font-bold text-primary">
                      Import Completed Successfully
                    </div>
                    <div className="flex gap-4 mt-2">
                      <div>
                        Created:{" "}
                        <strong className="text-foreground">
                          {bulkResults.created}
                        </strong>
                      </div>
                      <div>
                        Failed:{" "}
                        <strong className="text-foreground">
                          {bulkResults.failed}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}

                <div className="border-t border-border pt-4 flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setBulkFile(null);
                      setBulkPreview([]);
                      setBulkStatus("idle");
                    }}
                    className="px-4 py-2 border border-border rounded-lg bg-card text-xs font-bold text-muted-foreground hover:text-foreground transition"
                  >
                    Clear
                  </button>
                  <button
                    onClick={handleBulkImport}
                    disabled={!bulkFile || bulkStatus === "importing"}
                    className="px-4 py-2 bg-primary text-white font-bold rounded-lg text-xs hover:bg-primary/95 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    📥 Import Users
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── SECTION 2B: ORDER DOCUMENTS CONFIGURATION ─── */}
      {activeSection === "order-documents" && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
              <div>
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <span>📑</span> Order Documents Configuration
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Define the list of documents required or accepted during Sales Order creation. Changes apply company-wide.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetDocs}
                  className="px-3 py-2 border border-border rounded-lg bg-card text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition shadow-sm"
                  title="Reset to system default document list"
                >
                  <RotateCcw className="size-3.5" />
                  Reset Defaults
                </button>
                <button
                  type="button"
                  onClick={handleSaveDocs}
                  disabled={isSavingDocs}
                  className="px-5 py-2 bg-primary text-white font-bold rounded-lg text-xs hover:bg-primary/95 transition shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Check className="size-4" />
                  {isSavingDocs ? "Saving..." : "Save Configuration"}
                </button>
              </div>
            </div>

            {/* Quick Add Form */}
            <div className="mt-5 p-4 rounded-xl bg-muted/30 border border-border space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Plus className="size-3.5 text-primary" /> Add New Document Type
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <input
                  type="text"
                  value={newDocTitle}
                  onChange={(e) => setNewDocTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddDoc();
                    }
                  }}
                  placeholder="e.g. Tax Invoice Copy, Client Specification Sheet, Inspection Clearance"
                  className="flex-1 px-3.5 py-2 bg-background border border-border rounded-lg text-xs font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <label className="flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-lg text-xs font-medium text-foreground cursor-pointer select-none shrink-0">
                  <input
                    type="checkbox"
                    checked={newDocMandatory}
                    onChange={(e) => setNewDocMandatory(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary size-4"
                  />
                  <span>Mandatory (Required *)</span>
                </label>
                <button
                  type="button"
                  onClick={handleAddDoc}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-xs font-bold shrink-0 transition flex items-center gap-1"
                >
                  <Plus className="size-3.5" /> Add Document
                </button>
              </div>
            </div>

            {/* Documents List */}
            <div className="mt-6 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-muted-foreground px-2">
                <span>DOCUMENT TITLE ({orderDocuments.length})</span>
                <div className="flex items-center gap-8">
                  <span className="w-28 text-center">MANDATORY</span>
                  <span className="w-10 text-center">ACTION</span>
                </div>
              </div>

              <div className="border border-border rounded-xl divide-y divide-border overflow-hidden bg-card">
                {orderDocuments.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    No order document types configured. Add one above or click Reset Defaults.
                  </div>
                ) : (
                  orderDocuments.map((doc, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="text-xs font-bold text-muted-foreground/60 w-6">
                          {idx + 1}.
                        </span>
                        <input
                          type="text"
                          value={doc.name}
                          onChange={(e) => handleUpdateDocTitle(idx, e.target.value)}
                          placeholder="Document title"
                          className="flex-1 px-3 py-1.5 bg-background border border-border rounded-md text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>

                      <div className="flex items-center gap-8 shrink-0">
                        <div className="w-28 flex justify-center">
                          <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={doc.isMandatory}
                              onChange={() => handleToggleDocMandatory(idx)}
                              className="rounded border-border text-primary focus:ring-primary size-4"
                            />
                            <span
                              className={`text-[11px] font-bold ${
                                doc.isMandatory ? "text-red-500" : "text-muted-foreground"
                              }`}
                            >
                              {doc.isMandatory ? "Required *" : "Optional"}
                            </span>
                          </label>
                        </div>

                        <div className="w-10 flex justify-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveDoc(idx)}
                            className="text-muted-foreground hover:text-red-500 transition-colors p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30"
                            title="Remove document type"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Explanatory note */}
            <div className="mt-6 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 p-4 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2.5">
              <Info className="size-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">How Order Documents Work:</p>
                <p className="text-[11px] text-blue-800 dark:text-blue-300 leading-relaxed">
                  The document categories configured here appear in the <strong>Project Document Upload</strong> section when any user creates a new sales order manually. Any document marked as <strong>Required *</strong> must be uploaded before the order can be saved.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      



      {/* ─── SECTION 6: NOTIFICATIONS & SMTP ─── */}
      {activeSection === "notifications" && (
        <div className="space-y-6">
          {/* Subtabs */}
          <div className="flex flex-wrap gap-2 border-b border-border pb-2.5">
            {[
              { key: "contacts", label: "📬 Contacts & Alerts" },
              { key: "smtp", label: "📧 SMTP Settings" },
              { key: "templates", label: "📄 Email Templates" },
              { key: "captcha", label: "🛡️ Captcha settings" },
              { key: "gateway", label: "💬 WhatsApp Gateway" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setNotifTab(tab.key as any)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${notifTab === tab.key ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:bg-muted/15"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Contacts & Alerts tab */}
          {notifTab === "contacts" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* WhatsApp configuration */}
                <div className="section-card mb-0">
                  <div className="section-header">
                    <div className="section-icon">💬</div>
                    <div className="flex-1">
                      <div className="section-title">
                        WhatsApp Notifications
                      </div>
                      <div className="section-desc">
                        Manage your business WhatsApp gateway alerts.
                      </div>
                    </div>
                    <label className="toggle-wrap">
                      <input
                        type="checkbox"
                        checked={waSettings.masterToggle}
                        onChange={(e) => {
                          const updated = {
                            ...waSettings,
                            masterToggle: e.target.checked,
                          };
                          setWaSettings(updated);
                          localStorage.setItem(
                            "dvepl_whatsapp_settings",
                            JSON.stringify(updated),
                          );
                        }}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="section-body space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        WhatsApp Number
                      </label>
                      <input
                        type="text"
                        value={waSettings.number}
                        onChange={(e) =>
                          setWaSettings({
                            ...waSettings,
                            number: e.target.value,
                          })
                        }
                        placeholder="+91 98765 43210"
                        className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                      />
                      <small className="text-[10px] text-muted-foreground block">
                        Include country code e.g. +91
                      </small>
                    </div>
                    <button
                      onClick={() => setShowWaConfig(!showWaConfig)}
                      className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"
                    >
                      {showWaConfig
                        ? "Hide Settings ▾"
                        : "Configure Credentials ▾"}
                    </button>
                    {showWaConfig && (
                      <div className="p-3 bg-muted/10 border border-border rounded-lg space-y-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            Phone Number ID
                          </label>
                          <input
                            type="text"
                            value={waSettings.phoneId}
                            onChange={(e) =>
                              setWaSettings({
                                ...waSettings,
                                phoneId: e.target.value,
                              })
                            }
                            placeholder="Meta Phone Number ID"
                            className="w-full px-3 py-1 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            Access Token
                          </label>
                          <input
                            type="password"
                            value={waSettings.accessToken}
                            onChange={(e) =>
                              setWaSettings({
                                ...waSettings,
                                accessToken: e.target.value,
                              })
                            }
                            placeholder="Bearer Token"
                            className="w-full px-3 py-1 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                          />
                        </div>
                      </div>
                    )}
                    <div className="border-t border-border pt-4 flex gap-2">
                      <button
                        onClick={testWaConnection}
                        className="px-3.5 py-1.5 bg-primary text-white font-bold rounded-lg text-xs hover:bg-primary/95 transition shadow-sm"
                      >
                        ✓ Test WhatsApp
                      </button>
                    </div>
                  </div>
                </div>

                {/* Email configuration */}
                <div className="section-card mb-0">
                  <div className="section-header">
                    <div className="section-icon">📧</div>
                    <div className="flex-1">
                      <div className="section-title">Email Notifications</div>
                      <div className="section-desc">
                        Manage system summary and event email reports.
                      </div>
                    </div>
                  </div>
                  <div className="section-body space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Recipient Email Address
                      </label>
                      <input
                        type="email"
                        value={emailSettings.address}
                        onChange={(e) =>
                          setEmailSettings({
                            ...emailSettings,
                            address: e.target.value,
                          })
                        }
                        placeholder="alerts@company.com"
                        className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Test Template (Optional)
                      </label>
                      <select
                        value={selectedTestTemplateId}
                        onChange={(e) =>
                          setSelectedTestTemplateId(e.target.value)
                        }
                        className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                      >
                        <option value="">Default Test Message</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.type})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Channel Preferences
                      </div>
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-2 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={emailSettings.orders}
                            onChange={(e) =>
                              setEmailSettings({
                                ...emailSettings,
                                orders: e.target.checked,
                              })
                            }
                            className="accent-primary"
                          />
                          Order created & update summaries
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={emailSettings.payments}
                            onChange={(e) =>
                              setEmailSettings({
                                ...emailSettings,
                                payments: e.target.checked,
                              })
                            }
                            className="accent-primary"
                          />
                          Payment due notifications
                        </label>
                      </div>
                    </div>
                    <div className="border-t border-border pt-4">
                      <button
                        onClick={testEmailConnection}
                        className="px-3.5 py-1.5 bg-primary text-white font-bold rounded-lg text-xs hover:bg-primary/95 transition shadow-sm"
                      >
                        ✓ Test Email
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Alert Events Table */}
              <div className="section-card">
                <div className="section-header">
                  <div className="section-icon">🔔</div>
                  <div>
                    <div className="section-title">Alert Events matrix</div>
                    <div className="section-desc">
                      Toggle which system hooks trigger automatic alerts to
                      recipients.
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-muted/15 border-b border-border">
                      <tr>
                        <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Event Hook Name
                        </th>
                        <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center">
                          WhatsApp Channel
                        </th>
                        <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center">
                          Email Channel
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {Object.keys(alertEvents).map((eventKey) => (
                        <tr key={eventKey} className="hover:bg-muted/5">
                          <td className="p-3 font-semibold capitalize">
                            {eventKey.replace(/_/g, " ")}
                          </td>
                          <td className="p-3 text-center">
                            <label className="toggle-wrap">
                              <input
                                type="checkbox"
                                checked={alertEvents[eventKey].wa}
                                onChange={(e) => {
                                  const updated = {
                                    ...alertEvents,
                                    [eventKey]: {
                                      ...alertEvents[eventKey],
                                      wa: e.target.checked,
                                    },
                                  };
                                  setAlertEvents(updated);
                                  localStorage.setItem(
                                    "dvepl_alert_events",
                                    JSON.stringify(updated),
                                  );
                                }}
                              />
                              <span className="toggle-slider"></span>
                            </label>
                          </td>
                          <td className="p-3 text-center">
                            <label className="toggle-wrap">
                              <input
                                type="checkbox"
                                checked={alertEvents[eventKey].email}
                                onChange={(e) => {
                                  const updated = {
                                    ...alertEvents,
                                    [eventKey]: {
                                      ...alertEvents[eventKey],
                                      email: e.target.checked,
                                    },
                                  };
                                  setAlertEvents(updated);
                                  localStorage.setItem(
                                    "dvepl_alert_events",
                                    JSON.stringify(updated),
                                  );
                                }}
                              />
                              <span className="toggle-slider"></span>
                            </label>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* SMTP settings tab */}
          {/* SMTP settings tab */}
          {notifTab === "smtp" && (
            <div className="section-card">
              <div className="section-header flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="section-icon">📧</div>
                  <div>
                    <div className="section-title">SMTP Mail Configuration</div>
                    <div className="section-desc">
                      Manage credentials for outgoing server. Required for order
                      pdf mailing.
                    </div>
                  </div>
                </div>
                {!isEditingSmtp && (
                  <button
                    onClick={() => setIsEditingSmtp(true)}
                    className="px-3.5 py-1.5 bg-primary text-white font-bold rounded-lg text-xs hover:bg-primary/95 transition shadow-sm"
                  >
                    ✏️ Edit Configuration
                  </button>
                )}
              </div>

              {!isEditingSmtp ? (
                <div className="overflow-x-auto p-4 space-y-4">
                  <table className="w-full text-xs text-left border-collapse border border-border rounded-lg overflow-hidden">
                    <thead className="bg-muted/15 border-b border-border">
                      <tr>
                        <th className="p-3 font-bold text-muted-foreground w-1/3">
                          Setting Field
                        </th>
                        <th className="p-3 font-bold text-muted-foreground w-2/3">
                          Configured Value
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      <tr className="hover:bg-muted/5">
                        <td className="p-3 font-semibold">
                          Sender Name / Title
                        </td>
                        <td className="p-3 text-foreground">
                          {smtpSettings.title || (
                            <span className="text-muted-foreground italic">
                              Not set
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr className="hover:bg-muted/5">
                        <td className="p-3 font-semibold">
                          SMTP Email Address (Username)
                        </td>
                        <td className="p-3 text-foreground">
                          {smtpSettings.email || (
                            <span className="text-muted-foreground italic">
                              Not set
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr className="hover:bg-muted/5">
                        <td className="p-3 font-semibold">SMTP Host Server</td>
                        <td className="p-3 text-foreground">
                          {smtpSettings.host || (
                            <span className="text-muted-foreground italic">
                              Not set
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr className="hover:bg-muted/5">
                        <td className="p-3 font-semibold">SMTP Port</td>
                        <td className="p-3 text-foreground">
                          {smtpSettings.port || (
                            <span className="text-muted-foreground italic">
                              Not set
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr className="hover:bg-muted/5">
                        <td className="p-3 font-semibold">
                          Security (SSL/TLS)
                        </td>
                        <td className="p-3 text-foreground">
                          {Number(smtpSettings.port) === 465 ? (
                            <span className="role-badge user">
                              SSL/TLS (Port 465)
                            </span>
                          ) : (
                            <span className="role-badge">
                              STARTTLS (Port {smtpSettings.port || "587"})
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr className="hover:bg-muted/5">
                        <td className="p-3 font-semibold">
                          Support Contact Phone
                        </td>
                        <td className="p-3 text-foreground">
                          {smtpSettings.supportPhone || (
                            <span className="text-muted-foreground italic">
                              Not set
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr className="hover:bg-muted/5">
                        <td className="p-3 font-semibold">
                          Registered Office Address
                        </td>
                        <td className="p-3 text-foreground">
                          {smtpSettings.address || (
                            <span className="text-muted-foreground italic">
                              Not set
                            </span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="pt-2 flex gap-2">
                    <button
                      onClick={testSmtpConnection}
                      className="px-4 py-2 border border-border rounded-lg bg-card text-xs font-bold text-muted-foreground hover:text-foreground transition"
                    >
                      ✉️ Test SMTP Connection
                    </button>
                  </div>
                </div>
              ) : (
                <div className="section-body space-y-4">
                  {/* Dummy inputs to intercept and prevent browser autofill */}
                  <input
                    type="text"
                    name="prevent_autofill_username"
                    style={{ display: "none" }}
                    autoComplete="off"
                  />
                  <input
                    type="password"
                    name="prevent_autofill_password"
                    style={{ display: "none" }}
                    autoComplete="new-password"
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Sender Name / Title *
                      </label>
                      <input
                        type="text"
                        name="smtp_sender_title"
                        autoComplete="off"
                        value={smtpSettings.title}
                        onChange={(e) =>
                          setSmtpSettings({
                            ...smtpSettings,
                            title: e.target.value,
                          })
                        }
                        placeholder="e.g. DVEPL PO Service"
                        className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        SMTP Email Address *
                      </label>
                      <input
                        type="text"
                        name="smtp_email_address"
                        autoComplete="new-password"
                        value={smtpSettings.email}
                        onChange={(e) =>
                          setSmtpSettings({
                            ...smtpSettings,
                            email: e.target.value,
                          })
                        }
                        placeholder="e.g. alerts@dvepl.com"
                        className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        SMTP Password *
                      </label>
                      <div className="relative">
                        <input
                          type={showSmtpPass ? "text" : "password"}
                          name="smtp_email_password"
                          autoComplete="new-password"
                          value={smtpSettings.password}
                          onChange={(e) =>
                            setSmtpSettings({
                              ...smtpSettings,
                              password: e.target.value,
                            })
                          }
                          placeholder="••••••••"
                          className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary pr-8"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSmtpPass(!showSmtpPass)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none flex items-center justify-center"
                        >
                          {showSmtpPass ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        SMTP Host Server *
                      </label>
                      <input
                        type="text"
                        value={smtpSettings.host}
                        onChange={(e) =>
                          setSmtpSettings({
                            ...smtpSettings,
                            host: e.target.value,
                          })
                        }
                        placeholder="smtp.gmail.com"
                        className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        SMTP Port *
                      </label>
                      <input
                        type="number"
                        value={smtpSettings.port}
                        onChange={(e) =>
                          setSmtpSettings({
                            ...smtpSettings,
                            port: parseInt(e.target.value) || 587,
                          })
                        }
                        placeholder="587"
                        className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Support Contact Phone
                      </label>
                      <input
                        type="text"
                        value={smtpSettings.supportPhone}
                        onChange={(e) =>
                          setSmtpSettings({
                            ...smtpSettings,
                            supportPhone: e.target.value,
                          })
                        }
                        placeholder="e.g. +91 94176 01244"
                        className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Registered Office Address
                    </label>
                    <input
                      type="text"
                      value={smtpSettings.address}
                      onChange={(e) =>
                        setSmtpSettings({
                          ...smtpSettings,
                          address: e.target.value,
                        })
                      }
                      placeholder="Ranipur, Pathankot, Punjab"
                      className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                    />
                  </div>
                  <div className="border-t border-border pt-4 flex gap-2">
                    <button
                      onClick={saveSmtpSettings}
                      className="px-4 py-2 bg-primary text-white font-bold rounded-lg text-xs hover:bg-primary/95 transition shadow-sm"
                    >
                      💾 Save SMTP Settings
                    </button>
                    {smtpSettings.host && (
                      <button
                        onClick={() => setIsEditingSmtp(false)}
                        className="px-4 py-2 border border-border rounded-lg bg-card text-xs font-bold text-muted-foreground hover:text-foreground transition"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      onClick={testSmtpConnection}
                      className="px-4 py-2 border border-border rounded-lg bg-card text-xs font-bold text-muted-foreground hover:text-foreground transition"
                    >
                      ✉️ Test SMTP
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Email Templates Tab */}
          {notifTab === "templates" && (
            <div className="space-y-6">
              {showTemplateForm ? (
                <div className="section-card">
                  <div className="section-header">
                    <div className="section-icon">📄</div>
                    <div>
                      <div className="section-title">
                        {editingTemplate
                          ? "Edit Template"
                          : "New Email Template"}
                      </div>
                      <div className="section-desc">
                        Create/edit templates used when emailing PO documents.
                      </div>
                    </div>
                  </div>
                  <div className="section-body space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          Template Name *
                        </label>
                        <input
                          type="text"
                          value={templateName}
                          onChange={(e) => setTemplateName(e.target.value)}
                          placeholder="e.g. PO Confirmation"
                          className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          Subject Line *
                        </label>
                        <input
                          type="text"
                          value={templateSubject}
                          onChange={(e) => setTemplateSubject(e.target.value)}
                          placeholder="Your Purchase Order is ready"
                          className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Main Email Body content *
                      </label>
                      <textarea
                        value={templateContent1}
                        onChange={(e) => setTemplateContent1(e.target.value)}
                        rows={4}
                        placeholder="Content body..."
                        className="w-full p-2 border border-border bg-card rounded-lg text-xs outline-none focus:border-primary font-sans"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Footer content
                      </label>
                      <input
                        type="text"
                        value={templateContent2}
                        onChange={(e) => setTemplateContent2(e.target.value)}
                        placeholder="Regards, DVEPL Team"
                        className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Template Type Hook *
                      </label>
                      <select
                        value={templateType}
                        onChange={(e) => setTemplateType(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                      >
                        <option value="">Select type</option>
                        <option value="order_created">Order Created</option>
                        <option value="order_updated">Order Updated</option>
                        <option value="payment_due">Payment Due</option>
                        <option value="welcome">Welcome</option>
                      </select>
                    </div>

                    <div className="p-3 bg-primary-pale border border-primary/25 rounded-lg text-[11px] space-y-1">
                      <strong className="text-primary block">
                        Available Dynamic Variables:
                      </strong>
                      <span className="text-muted-foreground">
                        Use these placeholders to render values dynamically:
                      </span>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {[
                          "{$name}",
                          "{$poNumber}",
                          "{$vendorName}",
                          "{$supportPhone}",
                          "{$supportEmail}",
                        ].map((v) => (
                          <code
                            key={v}
                            className="bg-card border border-primary/20 px-2 py-0.5 rounded text-[10px] text-primary"
                          >
                            {v}
                          </code>
                        ))}
                      </div>
                    </div>

                    <div className="border-t border-border pt-4 flex justify-end gap-2">
                      <button
                        onClick={cancelTemplateForm}
                        className="px-4 py-2 border border-border rounded-lg bg-card text-xs font-bold text-muted-foreground hover:text-foreground transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveTemplate}
                        className="px-4 py-2 bg-primary text-white font-bold rounded-lg text-xs hover:bg-primary/95 transition shadow-sm"
                      >
                        💾 Save Template
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="section-card">
                  <div className="section-header">
                    <div className="section-icon">📄</div>
                    <div className="flex-1">
                      <div className="section-title">Email Templates</div>
                      <div className="section-desc">
                        Manage structured templates for automated mail
                        dispatches.
                      </div>
                    </div>
                    <button
                      onClick={() => setShowTemplateForm(true)}
                      className="px-3.5 py-1.5 bg-primary text-white font-bold rounded-lg text-xs hover:bg-primary/95 transition shadow-sm"
                    >
                      ➕ Add Template
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-muted/15 border-b border-border">
                        <tr>
                          <th className="p-3 font-bold text-muted-foreground">
                            Template Name
                          </th>
                          <th className="p-3 font-bold text-muted-foreground">
                            Subject Line
                          </th>
                          <th className="p-3 font-bold text-muted-foreground">
                            Hook Type
                          </th>
                          <th className="p-3 font-bold text-muted-foreground text-center">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {templates.map((t) => (
                          <tr key={t.id} className="hover:bg-muted/5">
                            <td className="p-3 font-semibold">{t.name}</td>
                            <td className="p-3 text-muted-foreground">
                              {t.subject}
                            </td>
                            <td className="p-3">
                              <span className="role-badge user">{t.type}</span>
                            </td>
                            <td className="p-3 text-center">
                              <div className="inline-flex gap-1.5">
                                <button
                                  onClick={() => handleEditTemplate(t)}
                                  className="px-2 py-1 text-[10px] font-bold bg-muted text-muted-foreground border border-border rounded hover:bg-border"
                                >
                                  ✏️ Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteTemplate(t.id)}
                                  className="px-2 py-1 text-[10px] font-bold bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100"
                                >
                                  ✕ Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Captcha settings tab */}
          {notifTab === "captcha" && (
            <div className="section-card">
              <div className="section-header">
                <div className="section-icon">🛡️</div>
                <div>
                  <div className="section-title">Captcha Settings</div>
                  <div className="section-desc">
                    Protect DVEPL portal authentication using Google ReCAPTCHA.
                  </div>
                </div>
              </div>
              <div className="section-body space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Site Key
                    </label>
                    <input
                      type="text"
                      value={captchaSettings.siteKey}
                      onChange={(e) =>
                        setCaptchaSettings({
                          ...captchaSettings,
                          siteKey: e.target.value,
                        })
                      }
                      placeholder="Enter Google ReCAPTCHA Site Key"
                      className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Secret Key
                    </label>
                    <input
                      type="text"
                      value={captchaSettings.secretKey}
                      onChange={(e) =>
                        setCaptchaSettings({
                          ...captchaSettings,
                          secretKey: e.target.value,
                        })
                      }
                      placeholder="Enter Google ReCAPTCHA Secret Key"
                      className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="toggle-wrap">
                    <input
                      type="checkbox"
                      checked={captchaSettings.enabled}
                      onChange={(e) =>
                        setCaptchaSettings({
                          ...captchaSettings,
                          enabled: e.target.checked,
                        })
                      }
                    />
                    <span className="toggle-slider"></span>
                  </label>
                  <span className="text-xs font-semibold text-foreground">
                    Enable Captcha verification on Portal Login page
                  </span>
                </div>
                <div className="border-t border-border pt-4">
                  <button
                    onClick={saveCaptchaSettings}
                    className="px-4 py-2 bg-primary text-white font-bold rounded-lg text-xs hover:bg-primary/95 transition shadow-sm"
                  >
                    💾 Save Captcha
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* WhatsApp Gateway settings tab */}
          {notifTab === "gateway" && (
            <div className="section-card">
              <div className="section-header flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="section-icon">💬</div>
                  <div>
                    <div className="section-title">
                      WhatsApp Gateway Settings
                    </div>
                    <div className="section-desc">
                      Manage API endpoints for sending automated WhatsApp text
                      orders.
                    </div>
                  </div>
                </div>
                {!isEditingGateway && (gatewaySettings.apiKey || gatewaySettings.campaignName) && (
                  <button
                    onClick={() => setIsEditingGateway(true)}
                    className="px-3.5 py-1.5 bg-primary text-white font-bold rounded-lg text-xs hover:bg-primary/95 transition shadow-sm"
                  >
                    ✏️ Edit Configuration
                  </button>
                )}
              </div>

              {!isEditingGateway && (gatewaySettings.apiKey || gatewaySettings.campaignName) ? (
                <div className="overflow-x-auto p-4 space-y-4">
                  <table className="w-full text-xs text-left border-collapse border border-border rounded-lg overflow-hidden">
                    <thead className="bg-muted/15 border-b border-border">
                      <tr>
                        <th className="p-3 font-bold text-muted-foreground w-1/3">
                          Setting Field
                        </th>
                        <th className="p-3 font-bold text-muted-foreground w-2/3">
                          Configured Value
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      <tr className="hover:bg-muted/5">
                        <td className="p-3 font-semibold">Provider</td>
                        <td className="p-3 text-foreground">
                          {gatewaySettings.provider === "aisensy" ? "AiSensy" : gatewaySettings.provider || (
                            <span className="text-muted-foreground italic">
                              Not set
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr className="hover:bg-muted/5">
                        <td className="p-3 font-semibold">API Authorization Key</td>
                        <td className="p-3 text-foreground">
                          {gatewaySettings.apiKey || (
                            <span className="text-muted-foreground italic">
                              Not set
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr className="hover:bg-muted/5">
                        <td className="p-3 font-semibold">Campaign Name</td>
                        <td className="p-3 text-foreground">
                          {gatewaySettings.campaignName || (
                            <span className="text-muted-foreground italic">
                              Not set
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr className="hover:bg-muted/5">
                        <td className="p-3 font-semibold">WhatsApp Number</td>
                        <td className="p-3 text-foreground">
                          {gatewaySettings.number || (
                            <span className="text-muted-foreground italic">
                              Not set
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr className="hover:bg-muted/5">
                        <td className="p-3 font-semibold">
                          Status / Integration
                        </td>
                        <td className="p-3 text-foreground">
                          {gatewaySettings.enabled ? (
                            <span className="role-badge user">
                              Active / Live
                            </span>
                          ) : (
                            <span className="role-badge">
                              Inactive / Disabled
                            </span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="pt-2 flex gap-2">
                    <button
                      onClick={testGateway}
                      className="px-4 py-2 border border-border rounded-lg bg-card text-xs font-bold text-muted-foreground hover:text-foreground transition"
                    >
                      🔌 Test AiSensy Connection
                    </button>
                  </div>
                </div>
              ) : (
                <div className="section-body space-y-4">
                  {/* Dummy inputs to intercept and prevent browser autofill */}
                  <input
                    type="text"
                    name="prevent_autofill_username"
                    style={{ display: "none" }}
                    autoComplete="off"
                  />
                  <input
                    type="password"
                    name="prevent_autofill_password"
                    style={{ display: "none" }}
                    autoComplete="new-password"
                  />

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        WhatsApp Provider
                      </label>
                      <select
                        value={gatewaySettings.provider || "aisensy"}
                        onChange={(e) =>
                          setGatewaySettings({
                            ...gatewaySettings,
                            provider: e.target.value,
                          })
                        }
                        className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                      >
                        <option value="aisensy">AiSensy</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        AiSensy API Key
                      </label>
                      <input
                        type="password"
                        name="wa_gateway_api_key"
                        autoComplete="new-password"
                        value={gatewaySettings.apiKey}
                        onChange={(e) =>
                          setGatewaySettings({
                            ...gatewaySettings,
                            apiKey: e.target.value,
                          })
                        }
                        placeholder="Enter your AiSensy API key"
                        className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Campaign Name
                      </label>
                      <input
                        type="text"
                        name="wa_gateway_campaign_name"
                        autoComplete="off"
                        value={gatewaySettings.campaignName || ""}
                        onChange={(e) =>
                          setGatewaySettings({
                            ...gatewaySettings,
                            campaignName: e.target.value,
                          })
                        }
                        placeholder="e.g. order_notification"
                        className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        WhatsApp Business Number
                      </label>
                      <input
                        type="text"
                        name="wa_gateway_number"
                        autoComplete="off"
                        value={gatewaySettings.number || ""}
                        onChange={(e) =>
                          setGatewaySettings({
                            ...gatewaySettings,
                            number: e.target.value,
                          })
                        }
                        placeholder="e.g. +917428526285"
                        className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="toggle-wrap">
                      <input
                        type="checkbox"
                        checked={gatewaySettings.enabled}
                        onChange={(e) =>
                          setGatewaySettings({
                            ...gatewaySettings,
                            enabled: e.target.checked,
                          })
                        }
                      />
                      <span className="toggle-slider"></span>
                    </label>
                    <span className="text-xs font-semibold text-foreground">
                      Activate AiSensy WhatsApp Integration
                    </span>
                  </div>
                  <div className="border-t border-border pt-4 flex gap-2">
                    <button
                      onClick={saveGatewaySettings}
                      className="px-4 py-2 bg-primary text-white font-bold rounded-lg text-xs hover:bg-primary/95 transition shadow-sm"
                    >
                      💾 Save Configuration
                    </button>
                    {gatewaySettings.apiKey && (
                      <button
                        onClick={() => setIsEditingGateway(false)}
                        className="px-4 py-2 border border-border rounded-lg bg-card text-xs font-bold text-muted-foreground hover:text-foreground transition"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      onClick={testGateway}
                      className="px-4 py-2 border border-border rounded-lg bg-card text-xs font-bold text-muted-foreground hover:text-foreground transition"
                    >
                      🔌 Test Connection
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── SECTION 7: THEME & APPEARANCE ─── */}
      {activeSection === "theme" && (
        <div className="space-y-6">
          <div className="section-card">
            <div className="section-header">
              <div className="section-icon">↔️</div>
              <div>
                <div className="section-title">Sidebar Position Layout</div>
                <div className="section-desc">
                  Move the primary navigation sidebar to either side of the
                  portal layout.
                </div>
              </div>
            </div>
            <div className="section-body">
              <div className="sidepos-grid">
                <label className="sidepos-option">
                  <input
                    type="radio"
                    name="sidebar-pos"
                    value="left"
                    checked={sidebarPos === "left"}
                    onChange={() => selectSidebarPos("left")}
                  />
                  <div className="sidepos-card">
                    <div className="sidepos-preview">
                      <div className="sp-bar"></div>
                      <div className="sp-main"></div>
                    </div>
                    <div className="sidepos-label">⬅ Left Side</div>
                  </div>
                </label>
                <label className="sidepos-option">
                  <input
                    type="radio"
                    name="sidebar-pos"
                    value="right"
                    checked={sidebarPos === "right"}
                    onChange={() => selectSidebarPos("right")}
                  />
                  <div className="sidepos-card">
                    <div className="sidepos-preview">
                      <div className="sp-main"></div>
                      <div className="sp-bar"></div>
                    </div>
                    <div className="sidepos-label">Right Side ➡</div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className="section-card">
            <div className="section-header">
              <div className="section-icon">🎨</div>
              <div>
                <div className="section-title">Primary Brand Accent Color</div>
                <div className="section-desc">
                  Sets the main accent color across buttons, tables and selected
                  item menus.
                </div>
              </div>
            </div>
            <div className="section-body space-y-4">
              <div className="theme-color-grid">
                {[
                  { name: "Brand Green", hex: "#33cc33" },
                  { name: "Forest Green", hex: "#1d5c2e" },
                  { name: "Ocean Blue", hex: "#1e40af" },
                  { name: "Crimson Red", hex: "#b91c1c" },
                  { name: "Charcoal Grey", hex: "#374151" },
                  { name: "Deep Purple", hex: "#6b21a8" },
                ].map((color) => (
                  <button
                    key={color.hex}
                    onClick={() => selectBrandColor(color.hex)}
                    className={`theme-swatch ${brandColor === color.hex ? "active" : ""}`}
                    style={{ background: color.hex }}
                    title={color.name}
                  />
                ))}
                <label
                  className="theme-custom-swatch"
                  title="Pick a custom color"
                >
                  🎨
                  <input
                    type="color"
                    value={brandColor}
                    onChange={(e) => selectBrandColor(e.target.value)}
                  />
                </label>
              </div>
              <hr className="border-border my-4" />
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-foreground">
                  🖼️ Workspace Background Color
                </h4>
                <div className="theme-color-grid">
                  {[
                    { name: "Slate Light", hex: "#f8fafc" },
                    { name: "Warm Cream", hex: "#fdfbf7" },
                    { name: "Pure White", hex: "#ffffff" },
                  ].map((color) => (
                    <button
                      key={color.hex}
                      onClick={() => selectBgColor(color.hex)}
                      className={`theme-swatch ${bgColor === color.hex ? "active" : ""}`}
                      style={{
                        background: color.hex,
                        border: "1px solid #cbd5e1",
                      }}
                      title={color.name}
                    />
                  ))}
                  <label
                    className="theme-custom-swatch"
                    title="Pick a custom workspace background"
                  >
                    🎨
                    <input
                      type="color"
                      value={bgColor}
                      onChange={(e) => selectBgColor(e.target.value)}
                    />
                  </label>
                </div>
              </div>
              <div className="theme-live-row">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm"
                  style={{ background: brandColor }}
                >
                  A
                </div>
                <div>
                  <div className="theme-live-title">Style Live Preview</div>
                  <div className="theme-live-desc">
                    Sample preview for buttons, badge elements and layout
                    avatars.
                  </div>
                </div>
                <button
                  className="px-4 py-1.5 text-xs text-white font-bold rounded-lg shadow-sm"
                  style={{ background: brandColor }}
                >
                  Accent Color Button
                </button>
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={resetThemeToDefault}
              className="px-4 py-2 border border-border rounded-lg bg-card text-xs font-bold text-muted-foreground hover:text-foreground transition"
            >
              ↺ Reset to Defaults
            </button>
          </div>
        </div>
      )}

      {/* ─── SECTION 8: BACKUP & RESTORE ─── */}
      {activeSection === "backup" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Create backup */}
            <div className="section-card mb-0">
              <div className="section-header">
                <div className="section-icon">📤</div>
                <div>
                  <div className="section-title">Download System Backup</div>
                  <div className="section-desc">
                    Download configuration and settings logs to your local
                    device.
                  </div>
                </div>
              </div>
              <div className="section-body space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Backup Filename
                  </label>
                  <input
                    type="text"
                    value={backupFilename}
                    onChange={(e) => setBackupFilename(e.target.value)}
                    placeholder="DVEPL_Backup"
                    className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Include Sections
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {["orders", "users", "vendors", "tasks"].map((mod) => (
                      <label
                        key={mod}
                        className="flex items-center gap-1.5 cursor-pointer text-xs capitalize"
                      >
                        <input
                          type="checkbox"
                          checked={backupModules.includes(mod)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setBackupModules([...backupModules, mod]);
                            } else {
                              setBackupModules(
                                backupModules.filter((m) => m !== mod),
                              );
                            }
                          }}
                          className="accent-primary"
                        />
                        {mod}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="border-t border-border pt-4">
                  <button
                    onClick={downloadBackup}
                    className="px-4 py-2 bg-primary text-white font-bold rounded-lg text-xs hover:bg-primary/95 transition shadow-sm"
                  >
                    ⬇️ Download Backup
                  </button>
                </div>
              </div>
            </div>

            {/* Restore backup */}
            <div className="section-card mb-0">
              <div className="section-header">
                <div className="section-icon">📥</div>
                <div>
                  <div className="section-title">Restore from Backup</div>
                  <div className="section-desc">
                    Restore settings from a downloaded .json backup.
                  </div>
                </div>
              </div>
              <div className="section-body space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Select Backup File
                  </label>
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) =>
                      setRestoreFile(e.target.files?.[0] || null)
                    }
                    className="w-full p-2 border border-border bg-card rounded-lg text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Restore Mode
                  </label>
                  <select
                    value={restoreMode}
                    onChange={(e) => setRestoreMode(e.target.value as any)}
                    className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                  >
                    <option value="merge">
                      Merge — Append and keep current (Safe)
                    </option>
                    <option value="overwrite">
                      Overwrite — Destructive overwrite (Replaces all data)
                    </option>
                  </select>
                </div>
                <div className="border-t border-border pt-4">
                  <button
                    onClick={restoreBackup}
                    disabled={!restoreFile}
                    className="px-4 py-2 bg-red-600 text-white font-bold rounded-lg text-xs hover:bg-red-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    📥 Restore Now
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Backup History */}
          <div className="section-card">
            <div className="section-header">
              <div className="section-icon">🕓</div>
              <div>
                <div className="section-title">Local Backup History</div>
                <div className="section-desc">
                  Backup log created inside this session.
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-muted/15 border-b border-border">
                  <tr>
                    <th className="p-3 font-bold text-muted-foreground">
                      Filename
                    </th>
                    <th className="p-3 font-bold text-muted-foreground">
                      Included Modules
                    </th>
                    <th className="p-3 font-bold text-muted-foreground">
                      Size
                    </th>
                    <th className="p-3 font-bold text-muted-foreground">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {backupHistory.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="p-4 text-center text-muted-foreground"
                      >
                        No recent backups.
                      </td>
                    </tr>
                  ) : (
                    backupHistory.map((b) => (
                      <tr key={b.id} className="hover:bg-muted/5">
                        <td className="p-3 font-semibold text-foreground">
                          {b.filename}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {b.modules}
                        </td>
                        <td className="p-3 text-muted-foreground">{b.size}</td>
                        <td className="p-3 text-muted-foreground">{b.date}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODALS ─── */}

      {/* EDIT USER MODAL */}
      {isEditModalOpen && editingUser && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-header">
              <div className="modal-title">✏️ Edit User Details</div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="modal-close"
              >
                ✕
              </button>
            </div>
            <div className="modal-body space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Full Name
                </label>
                <input
                  type="text"
                  value={editingUser.name}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, name: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Email Address
                </label>
                <input
                  type="email"
                  value={editingUser.email}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, email: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Designation
                </label>
                <select
                  value={editingUser.designation || ""}
                  onChange={(e) =>
                    setEditingUser({
                      ...editingUser,
                      designation: e.target.value,
                    })
                  }
                  className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                >
                  <option value="">— Select Designation —</option>
                  {designationsList.map((d: any) => (
                    <option key={d.id} value={d.title}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  User Role
                </label>
                <select
                  value={editingUser.role}
                  onChange={(e) => {
                    console.log("Selected Role:", e.target.value);
                    setEditingUser({ ...editingUser, role: e.target.value });
                  }}
                  className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none"
                >
                  {rolesList.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Team (Optional)
                </label>
                <select
                  value={editingUser.teamId || ""}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, teamId: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                >
                  <option value="">— Select Team —</option>
                  {teamsList.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  New Password (Optional)
                </label>
                <div className="relative">
                  <input
                    type={showEditUserPassword ? "text" : "password"}
                    placeholder="Leave blank to keep current password"
                    value={editingUser.password || ""}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, password: e.target.value })
                    }
                    className="w-full pl-3 pr-10 py-1.5 text-xs border border-border bg-card rounded-lg outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditUserPassword(!showEditUserPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground focus:outline-none"
                  >
                    {showEditUserPassword ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 border border-border rounded-lg bg-card text-xs font-bold text-muted-foreground hover:text-foreground transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveUserEdit}
                className="px-4 py-2 bg-primary text-white font-bold rounded-lg text-xs hover:bg-primary/95 transition shadow-sm"
              >
                Save Changes →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODALS */}
      <ConfirmDialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
        title="Delete User Account?"
        description={`Are you sure you want to delete ${
          users.find((u) => u.id === deleteConfirmId)?.name ||
          users.find((u) => u.id === deleteConfirmId)?.email ||
          "this user"
        }? This action is permanent and cannot be undone.`}
        confirmText="Delete User"
        variant="danger"
        onConfirm={handleConfirmDeleteUser}
      />

      <ConfirmDialog
        open={!!deleteTemplateId}
        onOpenChange={(open) => !open && setDeleteTemplateId(null)}
        title="Delete Template?"
        description="Are you sure you want to delete this email template? This action is permanent and cannot be undone."
        confirmText="Delete Template"
        variant="danger"
        onConfirm={handleConfirmDeleteTemplate}
      />

      {/* STANDARD PRBAC PERMISSIONS MODAL */}
      {isPermModalOpen && permUser && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 md:p-6">
          <div className="w-full max-w-7xl h-[92vh] overflow-hidden rounded-2xl border border-border bg-background shadow-2xl flex flex-col">
            {/* Header */}
            <div className="shrink-0 border-b border-border bg-card px-5 md:px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-11 w-11 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-xl">
                    🛡️
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-bold text-foreground">
                        Permission Management
                      </h2>
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-primary">
                        PRBAC
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Manage role-based access, resource actions and field-level permissions.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsPermModalOpen(false)}
                  className="h-9 w-9 shrink-0 rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition"
                  aria-label="Close permission management"
                >
                  ✕
                </button>
              </div>

              {/* Permission mode */}
              <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPermissionMode("role");
                      const roleUser = users.find(
                        (user) => user.role === selectedPermissionRole,
                      );
                      if (roleUser) initializePermissionState(roleUser);
                    }}
                    className={`rounded-md px-4 py-2 text-[11px] font-bold transition ${
                      permissionMode === "role"
                        ? "bg-card text-primary shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Role Permissions
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPermissionMode("user");
                      const currentUser = users.find(
                        (user) => user.id === selectedPermissionUserId,
                      );
                      if (currentUser) initializePermissionState(currentUser);
                    }}
                    className={`rounded-md px-4 py-2 text-[11px] font-bold transition ${
                      permissionMode === "user"
                        ? "bg-card text-primary shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    User Overrides
                  </button>
                </div>

                <div className="text-[10px] text-muted-foreground">
                  {permissionMode === "role"
                    ? `Changes apply to users assigned to ${roleLabel(selectedPermissionRole)}`
                    : `Override permissions for ${permUser.name}`}
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
              {/* Left navigation */}
              <aside className="min-h-0 overflow-y-auto border-r border-border bg-card">
                {permissionMode === "role" ? (
                  <>
                    <div className="sticky top-0 z-20 border-b border-border bg-card p-4">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Roles
                      </div>
                      <input
                        value={permissionRoleSearch}
                        onChange={(e) => setPermissionRoleSearch(e.target.value)}
                        placeholder="Search roles..."
                        className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
                      />
                    </div>
                    <div className="p-2">
                      {permissionRoles
                        .filter((role) =>
                          roleLabel(role)
                            .toLowerCase()
                            .includes(permissionRoleSearch.toLowerCase()),
                        )
                        .map((role) => {
                          const roleUsers = users.filter((user) => user.role === role);
                          const selected = role === selectedPermissionRole;
                          const rolePermissionSource = roleUsers[0];
                          const count = rolePermissionSource?.pageAccess?.length ?? 0;

                          return (
                            <button
                              key={role}
                              type="button"
                              onClick={() => handleSelectPermissionRole(role)}
                              className={`mb-1 w-full rounded-xl border p-3 text-left transition ${
                                selected
                                  ? "border-primary/30 bg-primary/5"
                                  : "border-transparent hover:border-border hover:bg-muted/40"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-foreground truncate">
                                    {roleLabel(role)}
                                  </div>
                                  <div className="mt-1 text-[10px] text-muted-foreground">
                                    {roleUsers.length} user{roleUsers.length === 1 ? "" : "s"} • {count} resources
                                  </div>
                                </div>
                                <span
                                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                                    selected ? "bg-primary" : "bg-muted-foreground/30"
                                  }`}
                                />
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="sticky top-0 z-20 border-b border-border bg-card p-4">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Users
                      </div>
                      <input
                        value={permissionUserSearch}
                        onChange={(e) => setPermissionUserSearch(e.target.value)}
                        placeholder="Search users..."
                        className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
                      />
                    </div>
                    <div className="p-2">
                      {users
                        .filter((user) => {
                          const q = permissionUserSearch.toLowerCase();
                          return (
                            user.name.toLowerCase().includes(q) ||
                            user.email.toLowerCase().includes(q) ||
                            user.role.toLowerCase().includes(q)
                          );
                        })
                        .map((user) => {
                          const selected = user.id === selectedPermissionUserId;
                          return (
                            <button
                              key={user.id}
                              type="button"
                              onClick={() => handleSelectPermissionUser(user)}
                              className={`mb-1 w-full rounded-xl border p-3 text-left transition ${
                                selected
                                  ? "border-primary/30 bg-primary/5"
                                  : "border-transparent hover:border-border hover:bg-muted/40"
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold">
                                  {user.name
                                    .split(" ")
                                    .map((part) => part[0])
                                    .join("")
                                    .slice(0, 2)
                                    .toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-foreground truncate">
                                    {user.name}
                                  </div>
                                  <div className="mt-0.5 text-[10px] text-muted-foreground truncate">
                                    {roleLabel(user.role)}
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  </>
                )}
              </aside>

              {/* Main permission editor */}
              <main className="min-h-0 overflow-y-auto bg-background">
                <div className="p-5 md:p-6 space-y-5">
                  {/* Context card */}
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-primary">
                          {permissionMode === "role" ? "Role" : "User Override"}
                        </div>
                        <h3 className="mt-1 text-xl font-bold text-foreground">
                          {permissionMode === "role"
                            ? roleLabel(selectedPermissionRole)
                            : permUser.name}
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {permissionMode === "role"
                            ? `${users.filter((user) => user.role === selectedPermissionRole).length} users inherit this permission policy.`
                            : `Overrides inherited role permissions for ${permUser.name}.`}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
                        <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          Permission model
                        </div>
                        <div className="mt-1 text-[11px] font-semibold text-foreground">
                          Resource → Action → Field
                        </div>
                      </div>
                    </div>

                    {/* Presets */}
                    <div className="mt-5 flex items-center gap-2 flex-wrap border-t border-border pt-4">
                      <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Presets
                      </span>
                      <button
                        onClick={() => applyPreset("full")}
                        className="rounded-lg border border-border bg-background px-3 py-2 text-[10px] font-bold text-foreground hover:border-primary hover:text-primary transition"
                      >
                        Full Access
                      </button>
                      <button
                        onClick={() => applyPreset("viewer")}
                        className="rounded-lg border border-border bg-background px-3 py-2 text-[10px] font-bold text-foreground hover:border-primary hover:text-primary transition"
                      >
                        View Only
                      </button>
                      <button
                        onClick={() => applyPreset("none")}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-bold text-red-600 hover:bg-red-100 transition"
                      >
                        No Access
                      </button>
                    </div>
                  </div>

                  {/* Resource matrix */}
                  <section className="rounded-2xl border border-border bg-card overflow-hidden">
                    <div className="border-b border-border px-5 py-4">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-primary">
                            Resource permissions
                          </div>
                          <h3 className="mt-1 text-sm font-bold text-foreground">
                            Resource access matrix
                          </h3>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            Grant access to resources and control the actions available within each one.
                          </p>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {Object.values(pageAccessState).filter(Boolean).length}/{modulesList.length} resources enabled
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] text-left">
                        <thead>
                          <tr className="border-b border-border bg-muted/50">
                            <th className="px-5 py-3 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                              Resource
                            </th>
                            <th className="px-3 py-3 text-center text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                              View
                            </th>
                            {ACTION_PERMISSION_KEYS.map((key) => (
                              <th
                                key={key}
                                className="px-3 py-3 text-center text-[9px] font-bold uppercase tracking-wider text-muted-foreground"
                              >
                                {key === "edit" ? "Update" : key.charAt(0).toUpperCase() + key.slice(1)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {modulesList.map((module) => {
                            const accessible = pageAccessState[module.key] ?? false;
                            const actions = actionPermsState[module.key] ?? NO_ACTIONS;
                            const selected = selectedActionModule === module.key;

                            return (
                              <tr
                                key={module.key}
                                onClick={() => setSelectedActionModule(module.key)}
                                className={`cursor-pointer border-b border-border/70 transition ${
                                  selected ? "bg-primary/5" : "hover:bg-muted/30"
                                }`}
                              >
                                <td className="px-5 py-3">
                                  <div className="flex items-center gap-2.5">
                                    <input
                                      type="checkbox"
                                      checked={accessible}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => {
                                        const enabled = e.target.checked;
                                        setPageAccessState({
                                          ...pageAccessState,
                                          [module.key]: enabled,
                                        });
                                        if (!enabled) {
                                          setActionPermsState({
                                            ...actionPermsState,
                                            [module.key]: NO_ACTIONS,
                                          });
                                        }
                                      }}
                                      className="h-4 w-4 accent-primary"
                                    />
                                    <div>
                                      <div className="text-xs font-semibold text-foreground">
                                        {module.label}
                                      </div>
                                      <div className="text-[9px] text-muted-foreground">
                                        {accessible ? "Accessible" : "No access"}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <span
                                    className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold ${
                                      accessible
                                        ? "bg-emerald-500/10 text-emerald-600"
                                        : "bg-muted text-muted-foreground"
                                    }`}
                                  >
                                    {accessible ? "✓" : "—"}
                                  </span>
                                </td>
                                {ACTION_PERMISSION_KEYS.map((key) => {
                                  const checked = Boolean(actions[key]);
                                  return (
                                    <td key={key} className="px-3 py-3 text-center">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={!accessible}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) =>
                                          setActionPermsState({
                                            ...actionPermsState,
                                            [module.key]: {
                                              ...(actionPermsState[module.key] ?? NO_ACTIONS),
                                              [key]: e.target.checked,
                                            },
                                          })
                                        }
                                        className={`h-4 w-4 accent-primary ${
                                          !accessible ? "opacity-40" : ""
                                        }`}
                                      />
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {/* Selected resource */}
                  <section className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-primary">
                          Selected resource
                        </div>
                        <h3 className="mt-1 text-lg font-bold text-foreground">
                          {modulesList.find((module) => module.key === selectedActionModule)?.label ||
                            selectedActionModule}
                        </h3>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1.5 text-[9px] font-bold ${
                          pageAccessState[selectedActionModule]
                            ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {pageAccessState[selectedActionModule]
                          ? "ACCESS GRANTED"
                          : "NO ACCESS"}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="mt-5 grid grid-cols-2 xl:grid-cols-4 gap-3">
                      {[
                        { key: "create", label: "Create", description: "Add records" },
                        { key: "edit", label: "Update", description: "Modify records" },
                        { key: "delete", label: "Delete", description: "Remove records" },
                        { key: "export", label: "Export", description: "Download data" },
                      ].map((action) => {
                        const checked = Boolean(
                          actionPermsState[selectedActionModule]?.[
                            action.key as keyof typeof actionPermsState[string]
                          ],
                        );
                        const disabled = !pageAccessState[selectedActionModule];

                        return (
                          <label
                            key={action.key}
                            className={`rounded-xl border p-4 transition ${
                              disabled
                                ? "opacity-50 cursor-not-allowed bg-muted/30"
                                : checked
                                  ? "border-primary/40 bg-primary/5 cursor-pointer"
                                  : "border-border bg-background hover:border-primary/30 cursor-pointer"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={(e) =>
                                setActionPermsState({
                                  ...actionPermsState,
                                  [selectedActionModule]: {
                                    ...(actionPermsState[selectedActionModule] ?? NO_ACTIONS),
                                    [action.key]: e.target.checked,
                                  },
                                })
                              }
                              className="sr-only"
                            />
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-xs font-bold text-foreground">
                                  {action.label}
                                </div>
                                <div className="mt-1 text-[10px] text-muted-foreground">
                                  {action.description}
                                </div>
                              </div>
                              <span
                                className={`h-5 w-5 rounded-md border flex items-center justify-center text-[10px] font-bold ${
                                  checked
                                    ? "border-primary bg-primary text-white"
                                    : "border-border bg-background"
                                }`}
                              >
                                {checked ? "✓" : ""}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>

                  </section>
                </div>
              </main>
            </div>

            {/* Footer */}
            <div className="shrink-0 flex items-center justify-between gap-4 border-t border-border bg-card px-5 md:px-6 py-4">
              <div className="text-[10px] text-muted-foreground">
                {permissionMode === "role" ? (
                  <>
                    Saving for <span className="font-semibold text-foreground">{roleLabel(selectedPermissionRole)}</span> role
                    ({users.filter((user) => user.role === selectedPermissionRole).length} users)
                  </>
                ) : (
                  <>
                    Saving override for <span className="font-semibold text-foreground">{permUser.name}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPermModalOpen(false)}
                  className="px-4 py-2.5 border border-border rounded-lg bg-background text-xs font-bold text-muted-foreground hover:text-foreground transition"
                >
                  Cancel
                </button>
                {permissionMode === "user" && (
                  <button
                    onClick={handleResetUserOverride}
                    className="px-4 py-2.5 border border-destructive/30 rounded-lg bg-background text-xs font-bold text-destructive hover:bg-destructive/5 transition"
                    title="Stop overriding the role policy — this user will inherit role permissions again"
                  >
                    Reset to Role
                  </button>
                )}
                <button
                  onClick={savePermissions}
                  className="px-5 py-2.5 bg-primary text-white font-bold rounded-lg text-xs hover:bg-primary/95 transition shadow-sm"
                >
                  {permissionMode === "role" ? "Save Role Permissions" : "Save Override"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsPage;
