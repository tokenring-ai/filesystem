import { EmptyState } from "@tokenring-ai/one-frontend/ui";
import { FileText } from "lucide-react";

/** The `/files` landing tab; closes once a file is opened from the tree. */
export default function FileStartPane() {
  return <EmptyState variant="page" className="h-full" icon={FileText} title="No file open" hint="Pick a file in the Files panel to edit it here." />;
}
