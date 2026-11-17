import { EmptyState } from "@tokenring-ai/one-frontend/ui";
import { Cloud } from "lucide-react";

export default function RemoteStartPane() {
  return (
    <EmptyState
      variant="page"
      icon={Cloud}
      title="Remote files"
      hint="Files in Google Drive, S3 and other remote stores. They are not on the host: copy a file to the host to edit it or let agents grep it."
    />
  );
}
