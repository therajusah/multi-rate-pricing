import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getUserId } from "@/lib/auth";

export default async function LoginPage() {
  if (await getUserId()) redirect("/documents");
  return <AuthForm mode="login" />;
}
