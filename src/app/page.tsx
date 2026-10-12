import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";

export default async function Home() {
  redirect((await getUserId()) ? "/dashboard" : "/login");
}
