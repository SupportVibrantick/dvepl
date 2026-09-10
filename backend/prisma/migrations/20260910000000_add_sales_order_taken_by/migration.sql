-- CreateTable
CREATE TABLE "sales_order_taken_by" (
    "id" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_order_taken_by_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_order_taken_by_userId_idx" ON "sales_order_taken_by"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_order_taken_by_salesOrderId_userId_key" ON "sales_order_taken_by"("salesOrderId", "userId");

-- AddForeignKey
ALTER TABLE "sales_order_taken_by" ADD CONSTRAINT "sales_order_taken_by_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_taken_by" ADD CONSTRAINT "sales_order_taken_by_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;