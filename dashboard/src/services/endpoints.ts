export const API_ENDPOINTS = {
  auth: {
    login: "/auth/login",
    logout: "/auth/logout",
    profile: "/auth/profile",
  },

  organization: {
    companies: {
      list: "/company/read/",
      create: "/company/create/",
      update: (id: string) => `/company/update/${id}`,
      remove: (id: string) => `/company/delete/${id}`,
    },

    branches: {
      list: "/branch/",
      create: "/branch/create/",
      update: (id: string) => `/branch/${id}`,
      remove: (id: string) => `/branch/${id}`,
    },

    departments: {
      list: "/department/",
      create: "/department/create/",
      update: (id: string) => `/department/update/${id}`,
      remove: (id: string) => `/department/${id}`,
    },

    teams: {
      list: "/team/read/",
      create: "/team/create/",
      update: (id: string) => `/team/update/${id}`,
      remove: (id: string) => `/team/delete/${id}`,
    },
    designations: {
      list: "/designation/read/",
      create: "/designation/create/",
      update: (id: string) => `/designation/update/${id}`,
      remove: (id: string) => `/designation/delete/${id}`,
    },

    costCenters: {
      list: "/cost-center/read/",
      create: "/cost-center/create/",
      update: (id: string) => `/cost-center/update/${id}`,
      remove: (id: string) => `/cost-center/delete/${id}`,
    },
  },
  hrms: {
    employees: {
      list: "/employee/read/",
      create: "/employee/create/",
      update: (id: string) => `/employee/update/${id}`,
      remove: (id: string) => `/employee/delete/${id}`,
    },

    attendance: {
      list: "/attendance/read/",
      statuses: "/attendance/read/statuses",
      create: "/attendance/create/",
      update: (id: string) => `/attendance/update/${id}`,
      remove: (id: string) => `/attendance/delete/${id}`,
    },

    leave: {
      list: "/leave/read/",
      create: "/leave/create/",
      update: (id: string) => `/leave/update/${id}`,
      remove: (id: string) => `/leave/delete/${id}`,
    },

    salary: {
      list: "/salary/read/",
      create: "/salary/create/",
      update: (id: string) => `/salary/update/${id}`,
      remove: (id: string) => `/salary/delete/${id}`,
    },

    holidays: {
      list: "/holiday/read/",
      create: "/holiday/create/",
      update: (id: string) => `/holiday/update/${id}`,
      remove: (id: string) => `/holiday/delete/${id}`,
    },

    shifts: {
      list: "/shift/read/",
    },

    documents: {
      list: '/employee-document/read/',
      create: '/employee-document/create/',
      update: (id: string) => `/employee-document/update/${id}`,
      remove: (id: string) => `/employee-document/delete/${id}`
    },
    tasks: {
      list: "/task/read",
      create: "/task/create",
      update: (id: string) => `/task/update/${id}`,
      remove: (id: string) => `/task/delete/${id}`
    },
  },
  crm: {
    customers: {
      list: "/customer/read/",
      create: "/customer/create/",
      update: (id: string) => `/customer/update/${id}`,
      remove: (id: string) => `/customer/delete/${id}`,
      sync: "/customer/sync/",
    },
    leads: {
      list: '/lead/read',
      create: '/lead/create',
      update: (id: string) => `/lead/update/${id}`,
      remove: (id: string) => `/lead/delete/${id}`,
    },

    contacts: {
      list: "/contact/read/",
      create: "/contact/create/",
      update: (id: string) => `/contact/update/${id}`,
      remove: (id: string) => `/contact/delete/${id}`,
    },

    communications: {
      list: "/communication/read/",
      create: "/communication/create/",
      remove: (id: string) => `/communication/delete/${id}`,
    },
  },
  tender: {
    requests: {
      list: "/tender-request/read/",
      create: "/tender-request/create/",
      update: (id: string) => `/tender-request/update/${id}`,
      remove: (id: string) => `/tender-request/delete/${id}`,
    },

    tenders: {
      list: "/tender/read/",
      create: "/tender/create/",
      update: (id: string) => `/tender/update/${id}`,
      remove: (id: string) => `/tender/delete/${id}`,
    },

    governmentDepartments: {
      list: "/government-department/read/",
      create: "/government-department/create/",
      update: (id: string) => `/government-department/update/${id}`,
      remove: (id: string) => `/government-department/delete/${id}`,
    },

    sections: {
      list: "/section/read/",
      create: "/section/create/",
      update: (id: string) => `/section/update/${id}`,
      remove: (id: string) => `/section/delete/${id}`,
    },

    divisions: {
      list: "/division/read/",
      create: "/division/create/",
      update: (id: string) => `/division/update/${id}`,
      remove: (id: string) => `/division/delete/${id}`,
    },

    subDivisions: {
      list: "/sub-division/read/",
      create: "/sub-division/create/",
      update: (id: string) => `/sub-division/update/${id}`,
      remove: (id: string) => `/sub-division/delete/${id}`,
    },

    referenceCodes: {
      list: "/reference-code/read/",
      regenerate: (tenderId: string) =>
        `/reference-code/regenerate/${tenderId}`,
    },

    technicalClarifications: {
      list: '/technical-clarification/read/',
      create: '/technical-clarification/create',
      update: (id: string) => `/technical-clarification/update/${id}`,
      remove: (id: string) => `/technical-clarification/delete/${id}`
    },
    boqs: {
      list: '/boq/read/',
      create: '/boq/create/',
      update: (id: string) => `/boq/update/${id}`,
      remove: (id: string) => `/boq/delete/${id}`
    },
    vendors: {
      list: "/vendor/read/",
      create: "/vendor/create/",
      update: (id: string) => `/vendor/update/${id}`,
      remove: (id: string) => `/vendor/delete/${id}`,
    },
  },
  quotation: {
    quotations: {
      list: '/quotation/read/',
      create: '/quotation/create/',
      update: (id: string) => `/quotation/update/${id}`,
      remove: (id: string) => `/quotation/delete/${id}`,
      submit: (id: string) => `/quotation/action/${id}/submit`,
      send: (id: string) => `/quotation/action/${id}/send`,
      respond: (id: string) => `/quotation/action/${id}/respond`,
      revise: (id: string) => `/quotation/action/${id}/revise`,
    },
    items: {
      list: '/quotation-item/read/',
      create: '/quotation-item/create/',
      update: (id: string) => `/quotation-item/update/${id}`,
      remove: (id: string) => `/quotation-item/delete/${id}`,
    },
    approvals: {
      list: '/quotation-approval/read/',
      create: '/quotation-approval/create/',
      update: (id: string) => `/quotation-approval/update/${id}`,
      remove: (id: string) => `/quotation-approval/delete/${id}`,
    },
    activities: {
      list: '/quotation-activity/read/',
      create: '/quotation-activity/create/',
      remove: (id: string) => `/quotation-activity/delete/${id}`,
    },
  },
  salesOrder: {
    salesOrders: {
      list: '/order/read/',
      create: '/order/create/',
      update: (id: string) => `/order/update/${id}`,
      remove: (id: string) => `/order/delete/${id}`,
      assign: (id: string) => `/order/assign/${id}`,
    },
  },
  approvalRule: {
    approvalRules: {
      list: '/approval-rule/read/',
      create: '/approval-rule/create/',
      update: (id: string) => `/approval-rule/update/${id}`,
      remove: (id: string) => `/approval-rule/delete/${id}`,
    },
  },
  security: {
    roles: {
      list: '/role/read/',
      create: '/role/create/',
      update: (id: string) => `/role/update/${id}`,
      remove: (id: string) => `/role/delete/${id}`,
    },
    users: {
      list: '/user/read/',
      create: '/user/create/',
      update: (id: string) => `/user/update/${id}`,
      remove: (id: string) => `/user/delete/${id}`,
      bulkImport: '/user/bulk-import/',
    },
    settings: {
      read: '/settings/read/',
      update: '/settings/update/',
      testSmtp: '/settings/test-smtp',
      sendTestEmail: '/settings/send-test-email',
      sendPoEmail: '/settings/send-po-email',
      sendPoWhatsapp: '/settings/send-po-whatsapp',
      testWhatsapp: '/settings/test-whatsapp/',
      exportBackup: '/settings/backup/export',
      importBackup: '/settings/backup/import',
    },
    auditLogs: {
      list: '/audit-log/read/',
    },
  },
  workflow: {
    approvalRequests: {
      list: '/approval-request/read/',
      create: '/approval-request/create/',
      update: (id: string) => `/approval-request/update/${id}`,
      remove: (id: string) => `/approval-request/delete/${id}`,
    },
  },
  material: {
    materials: {
      list: '/material/read/',
      create: '/material/create/',
      update: (id: string) => `/material/update/${id}`,
      remove: (id: string) => `/material/delete/${id}`,
    },
    categories: {
      list: '/material-category/read/',
      create: '/material-category/create/',
      update: (id: string) => `/material-category/update/${id}`,
      remove: (id: string) => `/material-category/delete/${id}`,
    },
    brands: {
      list: '/material-brand/read/',
      create: '/material-brand/create/',
      update: (id: string) => `/material-brand/update/${id}`,
      remove: (id: string) => `/material-brand/delete/${id}`,
    },
    specifications: {
      list: '/material-specification/read/',
      create: '/material-specification/create/',
      update: (id: string) => `/material-specification/update/${id}`,
      remove: (id: string) => `/material-specification/delete/${id}`,
    },
  },
  purchase: {
    requests: {
      list: '/purchase-request/read/',
      create: '/purchase-request/create/',
      update: (id: string) => `/purchase-request/update/${id}`,
      remove: (id: string) => `/purchase-request/delete/${id}`,
    },
    orders: {
      list: '/purchase-order/read/',
      create: '/purchase-order/create/',
      update: (id: string) => `/purchase-order/update/${id}`,
      remove: (id: string) => `/purchase-order/delete/${id}`,
    },
    receipts: {
      list: '/goods-receipt/read/',
      create: '/goods-receipt/create/',
      update: (id: string) => `/goods-receipt/update/${id}`,
      remove: (id: string) => `/goods-receipt/delete/${id}`,
    },
  },
  inventory: {
  warehouses: {
    list: '/warehouse/read/',
    create: '/warehouse/create/',
    update: (id: string) => `/warehouse/update/${id}`,
    remove: (id: string) => `/warehouse/delete/${id}`,
  },

  bins: {
    list: '/bin/read/',
    create: '/bin/create/',
    update: (id: string) => `/bin/update/${id}`,
    remove: (id: string) => `/bin/delete/${id}`,
  },

  stocks: {
    list: '/inventory/read/',
    create: '/inventory/create/',
    update: (id: string) => `/inventory/update/${id}`,
    remove: (id: string) => `/inventory/delete/${id}`,
  },

  transfers: {
    list: '/stock-transfer/read/',
    create: '/stock-transfer/create/',
    update: (id: string) => `/stock-transfer/update/${id}`,
    remove: (id: string) => `/stock-transfer/delete/${id}`,
  },

  // ⭐ ADD THIS
  tracking: {
    list: '/inventory-tracking/read/',
    receive: '/inventory-tracking/receive/',
  },
},
  production: {
    plans: {
      list: '/production-plan/read/',
      create: '/production-plan/create/',
      update: (id: string) => `/production-plan/update/${id}`,
      remove: (id: string) => `/production-plan/delete/${id}`,
    },
    workOrders: {
      list: '/work-order/read/',
      create: '/work-order/create/',
      update: (id: string) => `/work-order/update/${id}`,
      remove: (id: string) => `/work-order/delete/${id}`,
    },
    logs: {
      list: '/production-log/read/',
      create: '/production-log/create/',
      update: (id: string) => `/production-log/update/${id}`,
      remove: (id: string) => `/production-log/delete/${id}`,
    },
  },
  quality: {
    inspections: {
      list: '/inspection/read/',
      create: '/inspection/create/',
      update: (id: string) => `/inspection/update/${id}`,
      remove: (id: string) => `/inspection/delete/${id}`,
    },
    reworks: {
      list: '/rework/read/',
      create: '/rework/create/',
      update: (id: string) => `/rework/update/${id}`,
      remove: (id: string) => `/rework/delete/${id}`,
    },
  },
  logistics: {
    dispatches: {
      list: '/dispatch/read/',
      create: '/dispatch/create/',
      update: (id: string) => `/dispatch/update/${id}`,
      remove: (id: string) => `/dispatch/delete/${id}`,
    },
    vehicles: {
      list: '/vehicle/read/',
      create: '/vehicle/create/',
      update: (id: string) => `/vehicle/update/${id}`,
      remove: (id: string) => `/vehicle/delete/${id}`,
    },
  },
  finance: {
    invoices: {
      list: '/invoice/read/',
      create: '/invoice/create/',
      update: (id: string) => `/invoice/update/${id}`,
      remove: (id: string) => `/invoice/delete/${id}`,
    },
    payments: {
      list: '/payment/read/',
      create: '/payment/create/',
      update: (id: string) => `/payment/update/${id}`,
      remove: (id: string) => `/payment/delete/${id}`,
    },
    expenses: {
      list: '/expense/read/',
      create: '/expense/create/',
      update: (id: string) => `/expense/update/${id}`,
      remove: (id: string) => `/expense/delete/${id}`,
    },
  },
  exportOrders: {
    list: '/export-orders/read',
    drawings: '/export-orders/drawings',
    nextDrawingNo: '/export-orders/next-drawing-no',
    createDrawing: '/export-orders/create-drawing',
    updateDrawing: (id: string) => `/export-orders/drawing/update/${id}`,
    deleteDrawing: (id: string) => `/export-orders/drawing/delete/${id}`,
    sendDrawing: '/export-orders/drawing/send',
    createDrawingRevision: (drawingId: string) =>
      `/export-orders/drawing/${drawingId}/revision`,
    listDrawingRevisions: (drawingId: string) =>
      `/export-orders/drawing/${drawingId}/revisions`,
    updateDrawingRevisionStatus: (revisionId: string) =>
      `/export-orders/drawing/revision/${revisionId}/status`,
  },
} as const;
