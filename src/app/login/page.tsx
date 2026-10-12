import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { AuthForm } from "@/components/AuthForm";

export default async function LoginPage() {
  if (await getUserId()) redirect("/dashboard");
  return <AuthForm mode="login" />;
}
