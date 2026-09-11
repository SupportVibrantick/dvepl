import { ArrowLeft } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function BackToOrderWorkflowButton() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("backToOrder");

  if (!orderId) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => navigate(`/orders/${orderId}?tab=workflow`)}
      className="gap-1.5 h-9"
    >
      <ArrowLeft className="size-3.5" />
      Back to Order Workflow
    </Button>
  );
}