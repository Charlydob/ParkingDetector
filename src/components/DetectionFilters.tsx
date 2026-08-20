import { Search } from "lucide-react";

export type DetectionFilter = "all" | "pending" | "incidents" | "paid";

interface DetectionFiltersProps {
  filter: DetectionFilter;
  search: string;
  onFilterChange: (filter: DetectionFilter) => void;
  onSearchChange: (search: string) => void;
}

const filters: Array<{ value: DetectionFilter; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "pending", label: "Pendientes" },
  { value: "incidents", label: "Incidencias" },
  { value: "paid", label: "Validas" },
];

export function DetectionFilters({
  filter,
  search,
  onFilterChange,
  onSearchChange,
}: DetectionFiltersProps) {
  return (
    <div className="filters-bar">
      <div className="segmented-control" role="tablist" aria-label="Filtro de detecciones">
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
          placeholder="Matricula, habitacion, huesped"
        />
      </label>
    </div>
  );
}
