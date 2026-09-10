import { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from "fastify";
import { adminLogs } from "../../../services/logger/contextLogger";

interface ReportsQuery {
  type?: "customer" | "datewise" | "salesperson" | "finance" | "procurement" | "delivery";
  fromDate?: string;
  toDate?: string;
}

async function adminReportReadRouteGroup(fastify: FastifyInstance, options: FastifyPluginOptions) {
  fastify.get(
    "/",
    {
      schema: {
        tags: ["Report"],
        description: "Get dynamic calculated business reports",
        querystring: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["customer", "datewise", "salesperson", "finance", "procurement", "delivery"] },
            fromDate: { type: "string" },
            toDate: { type: "string" }
          }
        }
      },
      preHandler: [
        fastify.verifyToken,
        fastify.authorizePermissions(["report.view"]),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { type = "customer", fromDate, toDate } = request.query as ReportsQuery;

        // Fetch all orders matching basic active constraints
        const where: any = {
          deletedAt: null
        };

        // Fetch orders from database
        const orders = await fastify.prisma.salesOrder.findMany({
          where,
          include: {
            company: {
              select: {
                id: true,
                name: true
              }
            },
            customer: {
              select: {
                id: true,
                name: true
              }
            },
            orderTakenBy: {
              select: {
                id: true,
                name: true
              }
            },
            takenByUsers: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            },
            items: true
          }
        });

        // Helper to get total amount
        const getOrderTotal = (o: any): number => {
          if (o.grandTotal) return Number(o.grandTotal);
          if (o.totalAmount) return Number(o.totalAmount);
          if (Array.isArray(o.items) && o.items.length) {
            return o.items.reduce((sum: number, it: any) => {
              const rate = Number(it.rate || it.unitPrice || 0);
              const gst = Number(it.gst || it.gstPercentage || 0);
              const qty = Number(it.qty || it.quantity || 0);
              return sum + (rate + (rate * gst) / 100) * qty;
            }, 0);
          }
          const rate = Number(o.rate || 0);
          const gst = Number(o.gst || 0);
          const qty = Number(o.qty || 0);
          return (rate + (rate * gst) / 100) * qty;
        };

        const getFormattedDate = (date: any): string => {
          if (!date) return "";
          try {
            const d = new Date(date);
            if (isNaN(d.getTime())) return "";
            return d.toISOString().split("T")[0];
          } catch {
            return "";
          }
        };

        adminLogs.info(`Report request received: type=${type}, fromDate=${fromDate}, toDate=${toDate}, totalOrdersInDB=${orders.length}`);

        // 1. Filter by Date range
        const filtered = orders.filter((o) => {
          const oDate = getFormattedDate(o.orderConfirmDate) ||
                        getFormattedDate(o.poDate) ||
                        getFormattedDate(o.createdAt);

          if (!oDate) return false;

          if (fromDate && oDate < fromDate) return false;
          if (toDate && oDate > toDate) return false;
          return true;
        });

        // 2. Compute Summary Statistics
        const total = filtered.length;
        const revenue = filtered.reduce((sum, o) => sum + getOrderTotal(o), 0);
        const completed = filtered.filter((o) => o.status === "COMPLETED").length;
        const pending = filtered.filter((o) => o.status === "PENDING").length;

        // 3. Group and compute data rows dynamically based on report type
        let dataRows: any[] = [];

        if (type === "customer") {
          const map: Record<string, any> = {};
          filtered.forEach((o) => {
            const name = o.partyName || o.customer?.name || "Unknown Customer";
            if (!map[name]) {
              map[name] = { name, count: 0, revenue: 0, pending: 0, completed: 0 };
            }
            map[name].count++;
            map[name].revenue += getOrderTotal(o);
            if (o.status === "PENDING") map[name].pending++;
            if (o.status === "COMPLETED") map[name].completed++;
          });
          dataRows = Object.values(map).sort((a, b) => b.revenue - a.revenue);
        } 
        
        else if (type === "datewise") {
          const map: Record<string, any> = {};
          filtered.forEach((o) => {
            const date = getFormattedDate(o.orderConfirmDate) ||
                         getFormattedDate(o.poDate) ||
                         getFormattedDate(o.createdAt) ||
                         "Unknown Date";

            if (!map[date]) {
              map[date] = { date, count: 0, revenue: 0 };
            }
            map[date].count++;
            map[date].revenue += getOrderTotal(o);
          });
          dataRows = Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
        } 
        
        else if (type === "salesperson") {
          const map: Record<string, any> = {};
          filtered.forEach((o) => {
            const names = Array.from(
              new Set(
                [
                  ...(o.takenByUsers || []).map((tu: any) => tu.user?.name).filter(Boolean),
                  o.orderTakenBy?.name,
                ].filter(Boolean) as string[],
              ),
            );
            const salesNames = names.length > 0 ? names : ["Unassigned"];
            salesNames.forEach((name) => {
              if (!map[name]) {
                map[name] = { name, count: 0, revenue: 0, completed: 0 };
              }
              map[name].count++;
              map[name].revenue += getOrderTotal(o);
              if (o.status === "COMPLETED") map[name].completed++;
            });
          });
          dataRows = Object.values(map).sort((a: any, b: any) => b.revenue - a.revenue);
        } 
        
        else if (type === "finance") {
          dataRows = filtered.map((o) => {
            const totalVal = getOrderTotal(o);
            const paid = Number((o as any).advance || 0); // Can expand when payment relational model details are added
            const balance = Math.max(0, totalVal - paid);
            const itemNames = Array.isArray(o.items) && o.items.length
              ? o.items.map((it: any) => it.description || (it as any).itemName || "—").join(", ")
              : "—";

            return {
              dveplCode: o.dveplCode || "—",
              customerName: o.partyName || o.customer?.name || "—",
              items: itemNames,
              total: totalVal,
              paid,
              balance,
              status: o.status || "—"
            };
          });
        } 
        
        else if (type === "procurement") {
          dataRows = filtered.map((o) => ({
            dveplCode: o.dveplCode || "—",
            customerName: o.partyName || o.customer?.name || "—",
            orderPlaceTo: (o as any).orderPlaceTo || "—",
            poNumber: (o as any).poNumber || "—",
            materialStatus: (o as any).materialStatus || "—",
            poDate: getFormattedDate(o.poDate) || "—"
          }));
        } 
        
        else if (type === "delivery") {
          dataRows = filtered.map((o) => {
            const item = Array.isArray(o.items) && o.items.length
              ? o.items[0].description || (o.items[0] as any).itemName
              : "—";
            return {
              dveplCode: o.dveplCode || "—",
              customerName: o.partyName || o.customer?.name || "—",
              item,
              orderDate: getFormattedDate(o.orderConfirmDate) || getFormattedDate(o.createdAt) || "—",
              deliveryTarget: o.deliveryMonthTarget || "—",
              completeDate: getFormattedDate((o as any).orderCompleteDate) || "—",
              status: o.status || "—"
            };
          });
        }

        adminLogs.info(`Report generated successfully: type=${type}, filteredOrders=${filtered.length}, dataRows=${dataRows.length}`);

        return reply.send({
          success: true,
          message: "Report processed successfully",
          summary: { total, revenue, completed, pending },
          data: dataRows
        });
      } catch (error: any) {
        adminLogs.error(`Report calculation failed: ${error}`);
        return reply.status(500).send({
          success: false,
          message: "Server error during report calculations.",
          error: process.env.NODE_ENV === "development" ? error.message : undefined
        });
      }
    }
  );
}

export default adminReportReadRouteGroup;