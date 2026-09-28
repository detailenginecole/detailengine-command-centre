import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SalesStartClient } from "../start/SalesStartClient";

export const metadata: Metadata = {
  title: "Sales start preview | DetailEngine",
  description: "Visual preview of the DetailEngine sales-call client start tool.",
  robots: { index: false, follow: false },
};

export default function SalesStartVisualPreview() {
  if (process.env.VERCEL_ENV === "production") notFound();

  return (
    <SalesStartClient
      staffName="Cole"
      staffEmail="cole@getdetailengine.com"
      previewMode
    />
  );
}
