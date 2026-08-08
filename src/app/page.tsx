import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";

export default async function HomePage() {
  redirect((await getUserId()) ? "/documents" : "/login");
}
