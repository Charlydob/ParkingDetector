interface StatusBadgeProps {
  value: string;
  tone?: "paid" | "unpaid" | "unknown" | "matched" | "unmatched" | "ambiguous" | "neutral";
}

export function StatusBadge({ value, tone = "neutral" }: StatusBadgeProps) {
  return <span className={`status-badge ${tone}`}>{value.toUpperCase()}</span>;
}
