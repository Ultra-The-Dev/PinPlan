"use client";
import { RotateCw } from "lucide-react";

export default function RetryButton() {
  return (
    <button className="btn" onClick={() => location.reload()}>
      <RotateCw /> Try again
    </button>
  );
}
