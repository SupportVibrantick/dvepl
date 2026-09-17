import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import { adminLogs } from "../../../services/logger/contextLogger";


interface Params {
  id: string;
}


async function adminSalesOrderDeleteRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {

  fastify.delete(
    "/:id",
    {
      schema: {
        tags: ["Sales Order"],
        summary: "Delete Sales Order",
        description: "Soft delete sales order",
      },
    },

    async (
      request: FastifyRequest<{ Params: Params }>,
      reply: FastifyReply
    ) => {


      try {

        const { id } = request.params;



        // ==========================
        // Check Existing Order
        // ==========================

        const existingOrder =
          await fastify.prisma.salesOrder.findFirst({

            where:{
              id,
              deletedAt:null,
              companyId: (request as any).user?.companyId,
            },

          });



        if(!existingOrder){

          return reply.status(404).send({

            success:false,

            message:
              "Sales Order not found.",

          });

        }



        // ==========================
        // Soft Delete
        // ==========================


        const deletedOrder =
          await fastify.prisma.salesOrder.update({

            where:{
              id,
            },


            data:{
              deletedAt:new Date(),
            },

          });



        adminLogs.info(
          "Sales Order deleted successfully",
          {
            salesOrderId:id,
            deletedBy:
              (request as any).admin?.id,
          }
        );



        return reply.status(200).send({

          success:true,

          message:
            "Sales Order deleted successfully.",

          data:{
            id:deletedOrder.id,
          },

        });



      } catch(error:any){


        console.error(error);


        adminLogs.error(
          "Sales Order deletion failed",
          {
            error,
          }
        );


        return reply.status(500).send({

          success:false,

          message:
            "Server error while deleting Sales Order.",

          error:
            process.env.NODE_ENV === "development"
              ? error.message
              : undefined,

        });


      }

    }
  );

}


export default adminSalesOrderDeleteRoutes;