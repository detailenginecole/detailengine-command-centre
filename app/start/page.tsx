import type { Metadata } from "next";
import { SalesStartPage } from "./SalesStartPage";

export const metadata: Metadata = {
  title: "Start a client | DetailEngine",
  description: "Create a secure DetailEngine setup checkout during a sales call.",
};

export default function StartPage() {
  return <SalesStartPage />;
}
