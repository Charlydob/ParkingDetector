import { Search } from "lucide-react";

export type DetectionFilter = "all" | "pending" | "incidents" | "paid";

interface DetectionFiltersProps {
  filter: DetectionFilter;
  search: string;
  onFilterChange: (filter: DetectionFilter) => void;
  onSearchChange: (search: string) => void;
}

const filters: Array<{ value: DetectionFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "incidents", label: "Incidents" },
  { value: "paid", label: "Paid" },
];

export function DetectionFilters({
  filter,
  search,
  onFilterChange,
  onSearchChange,
}: DetectionFiltersProps) {
  return (
    <div className="filters-bar">
      <div className="segmented-control" role="tablist" aria-label="Detection filter">
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            className={filter === item.value ? "active" : ""}
            onClick={() => onFilterChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <label className="search-box">
        <Search size={16} />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="License plate, room, guest"
        />
      </label>
    </div>
  );
}
