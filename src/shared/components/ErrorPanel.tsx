import { AlertTriangle, RotateCw } from "lucide-react";
import { errorMessage } from "../lib/format";
import { Button, EmptyState } from "./ui";

export function ErrorPanel({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  return (
    <EmptyState
      action={
        onRetry ? (
          <Button onClick={onRetry}>
            <RotateCw className="size-4" />
            重新加载
          </Button>
        ) : undefined
      }
      description={errorMessage(error)}
      icon={<AlertTriangle className="size-5 text-amber-200" />}
      title="数据暂时没有到达"
    />
  );
}
