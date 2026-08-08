import { redirect } from "next/navigation";
import { DocumentEditor } from "@/components/DocumentEditor";
import { getUserId } from "@/lib/auth";

export default async function NewDocumentPage() {
  if (!(await getUserId())) redirect("/login");
  return <DocumentEditor />;
}
